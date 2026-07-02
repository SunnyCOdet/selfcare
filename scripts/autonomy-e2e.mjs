/**
 * E2E tests for the autonomy powers: workout logging + PR detection,
 * custom tracker creation, self-scheduled pings, and plan rollback.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const APP = "http://localhost:3000";
const REF = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];

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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const { data: auth, error: authErr } = await supabase.auth.signInWithPassword({
  email: "agent-test@example.com",
  password: "AgentTest123!",
});
if (authErr) {
  console.error("Sign-in failed:", authErr.message);
  process.exit(1);
}
const userId = auth.user.id;

const cookieValue = "base64-" + Buffer.from(JSON.stringify(auth.session)).toString("base64url");
const NAME = `sb-${REF}-auth-token`;
const MAX = 3180;
const cookies = [];
if (cookieValue.length <= MAX) cookies.push(`${NAME}=${cookieValue}`);
else
  for (let i = 0; i * MAX < cookieValue.length; i++)
    cookies.push(`${NAME}.${i}=${cookieValue.slice(i * MAX, (i + 1) * MAX)}`);
const COOKIE = cookies.join("; ");

async function coach(message) {
  const res = await fetch(`${APP}/api/ai/coach`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: COOKIE },
    body: JSON.stringify({ message, kind: "chat" }),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ...data };
}

// seed a small active plan (needed for revert test)
const mkPlan = (calories) => ({
  summary: `Plan at ${calories} kcal.`,
  goal_analysis: "test",
  timeline_weeks: 12,
  steps_target: 20000,
  weekly_schedule: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map(
    (day) => ({ day, blocks: [{ time: "06:30", activity: "Walk", details: "" }] })
  ),
  workout_plan: {
    gym_days_per_week: 5,
    split_name: "PPL",
    days: [{ day: "Monday", focus: "Push", exercises: [{ name: "Bench", sets: "4", reps: "8", notes: "" }] }],
    cardio_guidance: "walk",
  },
  nutrition: {
    daily_calories: calories,
    protein_g: 170,
    carbs_g: 200,
    fat_g: 60,
    water_liters: 3,
    meals: [{ time: "08:00", name: "B", items: ["eggs"], notes: "" }],
    guidelines: [],
  },
  skincare: { morning: [], evening: [], weekly: [], guidance: [] },
  grooming: [],
  sleep: { target_hours: 8, wind_down: [] },
  activities: [],
  daily_non_negotiables: ["Walk 20,000 steps"],
  weekly_milestones: [],
  model_prep: [],
});

await supabase.from("transformation_plans").delete().eq("user_id", userId);
await supabase.from("workouts").delete().eq("user_id", userId);
await supabase.from("custom_trackers").delete().eq("user_id", userId);
await supabase.from("scheduled_pings").delete().eq("user_id", userId);
await supabase
  .from("transformation_plans")
  .insert({ user_id: userId, plan: mkPlan(1800), status: "archived", version: 1 });
await supabase
  .from("transformation_plans")
  .insert({ user_id: userId, plan: mkPlan(2400), status: "active", version: 2 });
console.log("Seeded plans v1 (archived, 1800) + v2 (active, 2400)\n");

// ============ TEST 1: workout logging + PR detection ============
console.log("TEST 1: 'bench 60kg 4x8, squats 80kg 5x5' gets logged");
const t1 = await coach("Just finished the gym. Log this: bench press 60kg 4 sets of 8, squats 80kg 5 sets of 5.");
check("route returns 200", t1.status === 200, `got ${t1.status}: ${t1.error ?? ""}`);
check("agent executed log_workout", t1.workout_logged === true, JSON.stringify(t1).slice(0, 250));

const { data: wRows } = await supabase.from("workouts").select("*").eq("user_id", userId);
check("2 workout rows", (wRows ?? []).length === 2, `rows=${wRows?.length}`);
check("both are PRs (first ever)", (wRows ?? []).every((w) => w.is_pr), JSON.stringify(wRows?.map((w) => w.is_pr)));
check(
  "e1RM computed",
  (wRows ?? []).every((w) => Number(w.est_1rm) > Number(w.weight_kg)),
  JSON.stringify(wRows?.map((w) => w.est_1rm))
);

await sleep(3000);

// ============ TEST 2: heavier bench = new PR ============
console.log("\nTEST 2: heavier bench flags a new PR");
const t2 = await coach("Log: bench press 70kg 3 sets of 6.");
check("route returns 200", t2.status === 200, `got ${t2.status}: ${t2.error ?? ""}`);
const { data: benches } = await supabase
  .from("workouts")
  .select("weight_kg, is_pr")
  .eq("user_id", userId)
  .ilike("exercise", "%bench%")
  .order("created_at", { ascending: false });
check("new bench logged", (benches ?? []).length >= 2, `count=${benches?.length}`);
check("70kg set is PR", benches?.[0]?.is_pr === true, JSON.stringify(benches?.[0]));

await sleep(3000);

// ============ TEST 3: custom tracker via chat ============
console.log("\nTEST 3: 'track my pages read daily, target 20'");
const t3 = await coach("I want to track pages read daily, target 20 pages. Add it as a tracker.");
check("route returns 200", t3.status === 200, `got ${t3.status}: ${t3.error ?? ""}`);
check("agent executed create_tracker", t3.tracker_updated === true, JSON.stringify(t3).slice(0, 250));
const { data: trackers } = await supabase.from("custom_trackers").select("*").eq("user_id", userId);
check("tracker row exists", (trackers ?? []).length === 1, `count=${trackers?.length}`);
check("target 20 saved", Number(trackers?.[0]?.target_value) === 20, `target=${trackers?.[0]?.target_value}`);

await sleep(3000);

// ============ TEST 4: self-scheduled follow-up ============
console.log("\nTEST 4: 'remind me to walk in 2 hours'");
const t4 = await coach("I'll do my evening walk after my meeting. Ping me in exactly 2 hours to get me moving.");
check("route returns 200", t4.status === 200, `got ${t4.status}: ${t4.error ?? ""}`);
check("agent executed schedule_ping", t4.ping_scheduled === true, JSON.stringify(t4).slice(0, 250));
const { data: pings } = await supabase.from("scheduled_pings").select("*").eq("user_id", userId);
check("ping row exists", (pings ?? []).length === 1, `count=${pings?.length}`);
const mins = pings?.[0] ? (new Date(pings[0].send_at).getTime() - Date.now()) / 60000 : 0;
check("scheduled ~2h out", mins > 100 && mins < 140, `minutes=${Math.round(mins)}`);

await sleep(3000);

// ============ TEST 5: plan rollback ============
console.log("\nTEST 5: 'revert to my previous plan'");
const t5 = await coach("Actually the new plan isn't working for me. Revert to my previous plan version.");
check("route returns 200", t5.status === 200, `got ${t5.status}: ${t5.error ?? ""}`);
check("agent executed revert_plan", t5.plan_updated === true, JSON.stringify(t5).slice(0, 250));
const { data: active } = await supabase
  .from("transformation_plans")
  .select("plan, version")
  .eq("user_id", userId)
  .eq("status", "active")
  .order("created_at", { ascending: false })
  .limit(1)
  .maybeSingle();
check("new version created (v3)", active?.version === 3, `version=${active?.version}`);
check(
  "restored the 1800 kcal plan",
  active?.plan?.nutrition?.daily_calories === 1800,
  `calories=${active?.plan?.nutrition?.daily_calories}`
);

console.log(`\n========== AUTONOMY: ${pass} passed, ${fail} failed ==========`);
process.exit(fail > 0 ? 1 : 0);
