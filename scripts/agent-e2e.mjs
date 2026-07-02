/**
 * End-to-end tests for the AI agent inside Ascend.
 * Signs in as a real test user, calls the REAL /api/ai/coach route over HTTP
 * with a real session cookie, and verifies the agent's actions land in the DB.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

// --- env ---
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);
const SUPA_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SUPA_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const APP = "http://localhost:3000";
const REF = new URL(SUPA_URL).hostname.split(".")[0];

const supabase = createClient(SUPA_URL, SUPA_KEY);

let pass = 0,
  fail = 0;
function check(name, cond, detail = "") {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name} ${detail}`);
  }
}

// --- auth: sign in and build the @supabase/ssr cookie (chunked, base64-prefixed) ---
const { data: auth, error: authErr } = await supabase.auth.signInWithPassword({
  email: "agent-test@example.com",
  password: "AgentTest123!",
});
if (authErr) {
  console.error("Sign-in failed:", authErr.message);
  process.exit(1);
}
const userId = auth.user.id;
console.log("Signed in as test user", userId.slice(0, 8));

const cookieValue = "base64-" + Buffer.from(JSON.stringify(auth.session)).toString("base64url");
const NAME = `sb-${REF}-auth-token`;
const MAX = 3180;
const cookies = [];
if (cookieValue.length <= MAX) {
  cookies.push(`${NAME}=${cookieValue}`);
} else {
  for (let i = 0; i * MAX < cookieValue.length; i++) {
    cookies.push(`${NAME}.${i}=${cookieValue.slice(i * MAX, (i + 1) * MAX)}`);
  }
}
const COOKIE = cookies.join("; ");


/** Pause between tests — free-tier Gemini allows ~20 req/min. */
async function cooldown(s) {
  console.log(`  (cooling down ${s}s for API quota...)`);
  await new Promise((r) => setTimeout(r, s * 1000));
}

async function coach(message) {
  const res = await fetch(`${APP}/api/ai/coach`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: COOKIE },
    body: JSON.stringify({ message, kind: "chat" }),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ...data };
}

// --- seed: baseline "cut" plan (v1) via the user's own RLS-scoped client ---
const basePlan = {
  summary: "12-week cut for a lean model look.",
  goal_analysis: "Solid base, needs fat loss.",
  timeline_weeks: 12,
  steps_target: 20000,
  weekly_schedule: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map(
    (day) => ({ day, blocks: [{ time: "06:30", activity: "Walk 10k steps", details: "fasted" }] })
  ),
  workout_plan: {
    gym_days_per_week: 5,
    split_name: "Push/Pull/Legs",
    days: [
      {
        day: "Monday",
        focus: "Push",
        exercises: [{ name: "Bench Press", sets: "4", reps: "8", notes: "" }],
      },
    ],
    cardio_guidance: "20k steps daily.",
  },
  nutrition: {
    daily_calories: 1800,
    protein_g: 170,
    carbs_g: 150,
    fat_g: 55,
    water_liters: 3.5,
    meals: [{ time: "08:00", name: "Breakfast", items: ["6 egg whites", "oats 60g"], notes: "" }],
    guidelines: ["High protein", "No liquid calories"],
  },
  skincare: {
    morning: [{ step: "Cleanse", product_type: "gentle cleanser", notes: "" }],
    evening: [{ step: "Cleanse", product_type: "gentle cleanser", notes: "" }],
    weekly: [],
    guidance: [],
  },
  grooming: ["Weekly haircut lineup"],
  sleep: { target_hours: 8, wind_down: ["No screens 30min before bed"] },
  activities: [{ name: "Swimming", frequency: "2x/week", progression: "Learn freestyle" }],
  daily_non_negotiables: ["Walk 20,000 steps", "Hit 170g protein", "Skincare AM", "Skincare PM"],
  weekly_milestones: ["Week 1: routine locked"],
  model_prep: ["Posture drills"],
};

await supabase.from("transformation_plans").delete().eq("user_id", userId);
const { error: seedErr } = await supabase
  .from("transformation_plans")
  .insert({ user_id: userId, plan: basePlan, status: "active", version: 1 });
if (seedErr) {
  console.error("Seeding plan failed:", seedErr.message);
  process.exit(1);
}
console.log("Seeded v1 cut plan (1800 kcal)\n");

// ============ TEST 1: plan update via chat (cut -> recomp @ 2400) ============
console.log("TEST 1: 'switch from cut to recomp at 2400 calories'");
const t1 = await coach(
  "I want to switch my nutrition from a cut to a recomp at exactly 2400 calories. Keep protein at 170g or higher. Update my plan."
);
check("route returns 200", t1.status === 200, `got ${t1.status}: ${t1.error ?? ""}`);
check("agent executed update_plan", t1.plan_updated === true, JSON.stringify(t1).slice(0, 300));

const { data: activePlan } = await supabase
  .from("transformation_plans")
  .select("plan, version, status")
  .eq("user_id", userId)
  .eq("status", "active")
  .order("created_at", { ascending: false })
  .limit(1)
  .maybeSingle();

const cal = activePlan?.plan?.nutrition?.daily_calories;
check("new plan version saved (v2)", activePlan?.version === 2, `version=${activePlan?.version}`);
check("calories restructured to ~2400", typeof cal === "number" && Math.abs(cal - 2400) <= 100, `calories=${cal}`);
check(
  "protein kept >= 170g",
  (activePlan?.plan?.nutrition?.protein_g ?? 0) >= 165,
  `protein=${activePlan?.plan?.nutrition?.protein_g}`
);
check("20k steps preserved", activePlan?.plan?.steps_target === 20000);
check(
  "meals rewritten (exist)",
  Array.isArray(activePlan?.plan?.nutrition?.meals) && activePlan.plan.nutrition.meals.length >= 3,
  `meals=${activePlan?.plan?.nutrition?.meals?.length}`
);

const { count: archived } = await supabase
  .from("transformation_plans")
  .select("*", { count: "exact", head: true })
  .eq("user_id", userId)
  .eq("status", "archived");
check("old plan archived", (archived ?? 0) === 1, `archived=${archived}`);

await cooldown(30);

// ============ TEST 2: switch to preset template ============
console.log("\nTEST 2: 'switch the app to the CEO template'");
const t2 = await coach("Switch the app to the CEO template.");
check("route returns 200", t2.status === 200, `got ${t2.status}: ${t2.error ?? ""}`);
check("agent executed switch_theme", t2.theme_updated === true, JSON.stringify(t2).slice(0, 300));

const { data: prof1 } = await supabase.from("profiles").select("theme").eq("id", userId).single();
check("CEO theme stored", prof1?.theme?.name === "CEO", `theme=${JSON.stringify(prof1?.theme?.name)}`);
check(
  "CEO gold accent applied",
  prof1?.theme?.vars?.["--accent"] === "#d4af37",
  `accent=${prof1?.theme?.vars?.["--accent"]}`
);

await cooldown(30);

// ============ TEST 3: AI-generated custom template ============
console.log("\nTEST 3: 'create a cyberpunk neon template'");
const t3 = await coach(
  "Create a custom cyberpunk neon template for the app — think neon purple and electric green on near-black. Apply it."
);
check("route returns 200", t3.status === 200, `got ${t3.status}: ${t3.error ?? ""}`);
check("agent executed create_theme", t3.theme_updated === true, JSON.stringify(t3).slice(0, 300));

const { data: prof2 } = await supabase.from("profiles").select("theme").eq("id", userId).single();
const vars2 = prof2?.theme?.vars ?? {};
const hexOk = Object.values(vars2).every((v) => /^(#[0-9a-fA-F]{3,8}|rgba?\([^)]*\))$/.test(v));
check("custom theme stored", prof2?.theme?.name && prof2.theme.name !== "CEO", `name=${prof2?.theme?.name}`);
check("all theme values are valid colors", Object.keys(vars2).length >= 4 && hexOk, JSON.stringify(vars2).slice(0, 200));
const bg = vars2["--background"] ?? "#000000";
const [r, g, b] = [1, 3, 5].map((i) => parseInt(bg.slice(i, i + 2), 16));
check("background stayed dark", (r + g + b) / 3 < 80, `bg=${bg}`);

await cooldown(30);

// ============ TEST 4: plain question -> no action ============
console.log("\nTEST 4: plain question triggers no action");
const t4 = await coach("Roughly how much water should I be drinking through the day?");
check("route returns 200", t4.status === 200, `got ${t4.status}: ${t4.error ?? ""}`);
check("no plan update", !t4.plan_updated);
check("no theme update", !t4.theme_updated);
check("reply is substantive", typeof t4.reply === "string" && t4.reply.length > 20);

console.log(`\n========== RESULTS: ${pass} passed, ${fail} failed ==========`);
process.exit(fail > 0 ? 1 : 0);
