/**
 * Focused E2E tests for the Goals Engine + agent memory (tests 5-7 of the
 * full suite in agent-e2e.mjs, runnable standalone to conserve API quota).
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
async function cooldown(s) {
  console.log(`  (cooling ${s}s...)`);
  await new Promise((r) => setTimeout(r, s * 1000));
}

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

// clean slate
await supabase.from("goals").delete().eq("user_id", userId);
await supabase.from("agent_memories").delete().eq("user_id", userId);
console.log("Signed in, cleaned goals/memories. Letting API quota settle...");
await cooldown(5);

// ============ TEST A: goal creation ============
console.log("\nTEST A: create a $10k/month goal with milestone roadmap");
const t5 = await coach(
  "I want to hit $10,000 a month from freelance video editing by June 2027. Right now I make about $800 a month, and I can put in 15 hours a week. You have everything you need - set this up as a goal with a milestone roadmap right now, no more questions."
);
check("route returns 200", t5.status === 200, `got ${t5.status}: ${t5.error ?? ""}`);
check("agent executed create_goal", t5.goal_updated === true, JSON.stringify(t5).slice(0, 250));

const { data: goalRow } = await supabase
  .from("goals")
  .select("*")
  .eq("user_id", userId)
  .order("created_at", { ascending: false })
  .limit(1)
  .maybeSingle();
check("goal saved", !!goalRow, "no goal row");
check("target value 10000", Number(goalRow?.target_value) === 10000, `target=${goalRow?.target_value}`);
check(
  "milestone roadmap generated (3+)",
  Array.isArray(goalRow?.milestones) && goalRow.milestones.length >= 3,
  `milestones=${goalRow?.milestones?.length}`
);
check("category income", goalRow?.category === "income", `cat=${goalRow?.category}`);

await cooldown(5);

// ============ TEST B: progress tracked from chat ============
console.log("\nTEST B: 'closed a client, now at $1200/month'");
const t6 = await coach(
  "Progress update on my video editing income goal: I closed a new retainer client today. I am now at $1200 a month total. Log it."
);
check("route returns 200", t6.status === 200, `got ${t6.status}: ${t6.error ?? ""}`);
check("agent executed update_goal", t6.goal_updated === true, JSON.stringify(t6).slice(0, 250));

const { data: goalAfter } = goalRow
  ? await supabase.from("goals").select("current_value").eq("id", goalRow.id).single()
  : { data: null };
check("current_value updated to 1200", Number(goalAfter?.current_value) === 1200, `value=${goalAfter?.current_value}`);

const { count: progressCount } = await supabase
  .from("goal_progress")
  .select("*", { count: "exact", head: true })
  .eq("user_id", userId);
check("progress log row created", (progressCount ?? 0) >= 1, `rows=${progressCount}`);

await cooldown(5);

// ============ TEST C: persistent memory ============
console.log("\nTEST C: 'remember my left knee clicks on heavy squats'");
const t7 = await coach(
  "Important, remember this permanently: my left knee clicks on heavy squats, so my leg work should stay knee-friendly."
);
check("route returns 200", t7.status === 200, `got ${t7.status}: ${t7.error ?? ""}`);
check("agent saved a memory", t7.memory_saved === true, JSON.stringify(t7).slice(0, 250));

const { data: mems } = await supabase
  .from("agent_memories")
  .select("content, category")
  .eq("user_id", userId);
check(
  "memory content mentions knee",
  (mems ?? []).some((m) => /knee/i.test(m.content)),
  JSON.stringify(mems).slice(0, 200)
);

console.log(`\n========== GOALS/MEMORY RESULTS: ${pass} passed, ${fail} failed ==========`);
process.exit(fail > 0 ? 1 : 0);
