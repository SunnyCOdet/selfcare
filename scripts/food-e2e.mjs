/**
 * E2E: the food calorie pipeline — nutrition DB grounding (USDA + Open Food
 * Facts) + the LLM check/compute prompts. No server or auth needed; it drives
 * Gemini and the databases directly, mirroring /api/ai/food.
 *
 * Run: node scripts/food-e2e.mjs   (needs GEMINI_API_KEY in .env.local)
 */
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);
if (!env.GEMINI_API_KEY) {
  console.error("SKIP: GEMINI_API_KEY not set in .env.local");
  process.exit(2);
}
const USDA = env.USDA_API_KEY || "DEMO_KEY";
const MODEL = env.GEMINI_MODEL || "gemini-2.5-flash";

let pass = 0,
  fail = 0;
function check(name, cond, detail = "") {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}  ${detail}`);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function gemini(system, user) {
  // Retry transient overload (429/500/503/529), mirroring the app's provider.
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: user }] }],
          generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
        }),
      }
    );
    if (res.ok) {
      const data = await res.json();
      return JSON.parse(data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}");
    }
    if (![429, 500, 503, 529].includes(res.status) || attempt === 4) {
      throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 160)}`);
    }
    await sleep(attempt * 4000);
  }
}

// --- nutrition lookup (USDA Foundation/SR Legacy + Open Food Facts) ---
const num = (v) => {
  const x = Number(v);
  return Number.isFinite(x) ? Math.round(x * 10) / 10 : 0;
};
async function getJson(url) {
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": "Ascend/1.0", Accept: "application/json" },
      signal: AbortSignal.timeout(6000),
    });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}
async function lookupNutrition(q) {
  const offUrl =
    "https://world.openfoodfacts.org/cgi/search.pl?search_simple=1&action=process&json=1&page_size=4&fields=product_name,brands,nutriments&search_terms=" +
    encodeURIComponent(q);
  const usdaUrl =
    "https://api.nal.usda.gov/fdc/v1/foods/search?pageSize=4&dataType=Foundation,SR%20Legacy&api_key=" +
    USDA +
    "&query=" +
    encodeURIComponent(q);
  const [off, usda] = await Promise.all([getJson(offUrl), getJson(usdaUrl)]);
  const hits = [];
  for (const p of off?.products ?? []) {
    const n = p.nutriments ?? {};
    const kcal = num(n["energy-kcal_100g"]);
    if (kcal <= 0 || !p.product_name) continue;
    hits.push(`- ${p.product_name} [OFF] per100g: ${kcal}kcal ${num(n.proteins_100g)}P ${num(n.carbohydrates_100g)}C ${num(n.fat_100g)}F`);
    if (hits.length >= 3) break;
  }
  for (const f of usda?.foods ?? []) {
    const by = {};
    for (const nu of f.foodNutrients ?? []) by[String(nu.nutrientNumber)] = num(nu.value);
    if (!by["208"]) continue;
    hits.push(`- ${f.description} [USDA] per100g: ${by["208"]}kcal ${by["203"] ?? 0}P ${by["205"] ?? 0}C ${by["204"] ?? 0}F`);
  }
  return hits.slice(0, 6).join("\n") || null;
}

// --- prompts (mirrors src/app/api/ai/food/route.ts) ---
const CHECK_SYSTEM = `You are a nutrition intake checker. The client typed what they ate. Split it into distinct food ITEMS. For each item decide whether a SPECIFIC portion/quantity is stated — a count ("2 eggs"), a weight ("200 g"), a volume ("1 cup", "1 glass"), or a clear standard unit ("2 rotis", "1 bowl"). Vague amounts ("some", "a bit", "a plate of", "a little", "handful") are NOT specific enough.
Return JSON: {"items": [{"name": string, "portion_given": boolean, "question": string}]}`;

const SYSTEM = `You are a precision sports nutritionist. Estimate macros for the described portion.
- When a VERIFIED NUTRITION DATABASE block is provided, those numbers are per 100 g. Pick the closest item and prefer it over your own recall. Make sure calories ≈ protein×4 + carbs×4 + fat×9.
- COUNT-BASED ITEMS: when the client gives a count (e.g. "4 eggs", "3 rotis"), compute ONE unit at its normal size (1 large egg ≈ 50 g ≈ 72 kcal; 1 medium roti ≈ 40 g ≈ 110 kcal) and MULTIPLY by the count. NEVER invent a huge gram weight for the whole plate.
- Use the exact portions given. Do NOT invent portions.
Respond with JSON: {"calories": number, "protein_g": number, "carbs_g": number, "fat_g": number}`;

function computePrompt(food, grounding) {
  return `CLIENT:\n- Daily targets: {}\n- Eaten so far today: []\n${
    grounding ? `\nVERIFIED NUTRITION DATABASE (per 100 g unless noted — scale to the portion):\n${grounding}\n` : ""
  }\nFOOD TO ANALYZE: "${food}"`;
}

const macroIdentity = (r) =>
  Math.abs(r.calories - (r.protein_g * 4 + r.carbs_g * 4 + r.fat_g * 9)) <= Math.max(60, r.calories * 0.2);

console.log("\nFood calorie pipeline E2E\n");

// 1. Missing portions -> must ask
const chkVague = await gemini(CHECK_SYSTEM, `FOOD THE CLIENT TYPED: "rice and dal"`);
const missing = (chkVague.items ?? []).filter((i) => !i.portion_given);
check("vague 'rice and dal' flags missing portions", missing.length >= 1, JSON.stringify(chkVague.items));

// 2. Count given -> recognized, no question needed
const chkEggs = await gemini(CHECK_SYSTEM, `FOOD THE CLIENT TYPED: "4 eggs"`);
check(
  "'4 eggs' portion recognized (count)",
  (chkEggs.items ?? []).some((i) => /egg/i.test(i.name) && i.portion_given),
  JSON.stringify(chkEggs.items)
);

// 3. 4 eggs -> per-unit x count (~288), not a fabricated gram total
const eggGround = await lookupNutrition("egg");
const eggs = await gemini(SYSTEM, computePrompt("4 eggs", eggGround));
check(`4 eggs ≈ per-egg×4 (250–340 kcal)`, eggs.calories >= 250 && eggs.calories <= 340, `got ${eggs.calories}`);
check(`4 eggs not an absurd total (<500)`, eggs.calories < 500, `got ${eggs.calories}`);
check(`4 eggs macro identity holds`, macroIdentity(eggs), JSON.stringify(eggs));

// 4. Weight given -> matches DB (paneer ≈ 320/100g)
const panGround = await lookupNutrition("paneer");
const paneer = await gemini(SYSTEM, computePrompt("100 g paneer", panGround));
check(`100 g paneer ≈ DB (250–370 kcal)`, paneer.calories >= 250 && paneer.calories <= 370, `got ${paneer.calories}`);

// 5. Multi-item counts -> both scale sanely, no gram explosion
const combo = await gemini(SYSTEM, computePrompt("2 boiled eggs and 3 rotis", await lookupNutrition("egg roti")));
check(`'2 eggs + 3 rotis' total sane (350–650)`, combo.calories >= 350 && combo.calories <= 650, `got ${combo.calories}`);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
