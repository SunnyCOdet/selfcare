/**
 * Structured nutrition lookup from free databases: Open Food Facts (branded /
 * packaged / regional products) + USDA FoodData Central (whole & generic
 * foods). Returns a condensed block of per-100g macros for the best matches so
 * the model scales to the stated portion instead of guessing from memory.
 * Returns null when nothing matches or both sources fail.
 */
export type NutritionHit = {
  name: string;
  per: string; // "100 g" etc.
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  source: "Open Food Facts" | "USDA";
};

const UA = "Ascend/1.0 (personal transformation app)";

function n(v: unknown): number {
  const x = Number(v);
  return Number.isFinite(x) ? Math.round(x * 10) / 10 : 0;
}

/** Time-boxed fetch so a slow database never stalls a food log. */
async function getJson(url: string, ms = 4500): Promise<unknown | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(ms),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function fromOpenFoodFacts(query: string): Promise<NutritionHit[]> {
  const url =
    "https://world.openfoodfacts.org/cgi/search.pl?search_simple=1&action=process&json=1&page_size=4" +
    "&fields=product_name,brands,nutriments,serving_size&search_terms=" +
    encodeURIComponent(query);
  const data = (await getJson(url)) as { products?: Record<string, unknown>[] } | null;
  const products = data?.products ?? [];
  const hits: NutritionHit[] = [];
  for (const p of products) {
    const nut = (p.nutriments ?? {}) as Record<string, unknown>;
    const kcal = n(nut["energy-kcal_100g"]);
    if (kcal <= 0) continue; // skip products without usable data
    const brand = (p.brands ?? "").toString().split(",")[0]?.trim();
    const name = [(p.product_name ?? "").toString().trim(), brand ? `(${brand})` : ""]
      .filter(Boolean)
      .join(" ");
    if (!name) continue;
    hits.push({
      name: name.slice(0, 80),
      per: "100 g",
      kcal,
      protein: n(nut["proteins_100g"]),
      carbs: n(nut["carbohydrates_100g"]),
      fat: n(nut["fat_100g"]),
      source: "Open Food Facts",
    });
    if (hits.length >= 3) break;
  }
  return hits;
}

async function fromUSDA(query: string): Promise<NutritionHit[]> {
  const key = process.env.USDA_API_KEY || "DEMO_KEY";
  // Foundation + SR Legacy = reliable whole/generic foods. Branded/packaged
  // items are better covered by Open Food Facts, so we skip USDA Branded here.
  const url =
    "https://api.nal.usda.gov/fdc/v1/foods/search?pageSize=4&dataType=Foundation,SR%20Legacy" +
    `&api_key=${key}&query=${encodeURIComponent(query)}`;
  const data = (await getJson(url)) as
    | { foods?: { description?: string; foodNutrients?: Record<string, unknown>[] }[] }
    | null;
  const foods = data?.foods ?? [];
  const hits: NutritionHit[] = [];
  for (const f of foods) {
    const byNum: Record<string, number> = {};
    for (const nu of f.foodNutrients ?? []) {
      const num = String(nu["nutrientNumber"] ?? "");
      if (num) byNum[num] = n(nu["value"]);
    }
    const kcal = byNum["208"]; // Energy, kcal (per 100 g)
    if (!kcal || kcal <= 0) continue;
    hits.push({
      name: (f.description ?? "").toString().slice(0, 80),
      per: "100 g",
      kcal,
      protein: byNum["203"] ?? 0,
      carbs: byNum["205"] ?? 0,
      fat: byNum["204"] ?? 0,
      source: "USDA",
    });
  }
  return hits;
}

export async function lookupNutrition(query: string): Promise<string | null> {
  const q = query.trim();
  if (!q) return null;
  const [off, usda] = await Promise.all([fromOpenFoodFacts(q), fromUSDA(q)]);
  const hits = [...off, ...usda].slice(0, 6);
  if (hits.length === 0) return null;
  return hits
    .map(
      (h) =>
        `- ${h.name} [${h.source}], per ${h.per}: ${h.kcal} kcal, ${h.protein}g protein, ${h.carbs}g carbs, ${h.fat}g fat`
    )
    .join("\n");
}

/**
 * Web-verified nutrition lookup (Tavily). Returns condensed search findings
 * to ground calorie/macro estimates for branded and prepared foods.
 * Returns null when no key is configured or the search fails — callers
 * should degrade gracefully to model knowledge.
 */
export async function searchNutrition(query: string): Promise<string | null> {
  if (!process.env.TAVILY_API_KEY) return null;
  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: process.env.TAVILY_API_KEY,
        query: `${query} calories nutrition facts per serving`,
        max_results: 4,
        include_answer: true,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const results = (data.results ?? [])
      .map(
        (r: { title: string; content: string }) =>
          `- ${r.title}: ${(r.content ?? "").slice(0, 250)}`
      )
      .join("\n");
    const out = [data.answer ? `Answer: ${data.answer}` : null, results].filter(Boolean).join("\n");
    return out || null;
  } catch (e) {
    console.error("nutrition search failed:", e);
    return null;
  }
}
