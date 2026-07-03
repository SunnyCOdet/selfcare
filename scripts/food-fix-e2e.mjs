/**
 * E2E: Jarvis can actually CORRECT and DELETE food log entries via chat
 * (the "it said updated but didn't" bug), and totals reflect the change.
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

async function coach(message) {
  const res = await fetch("http://localhost:3000/api/ai/coach", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookies.join("; ") },
    body: JSON.stringify({ message, kind: "chat" }),
  });
  return { status: res.status, ...(await res.json().catch(() => ({}))) };
}

// seed: the wrongly-scanned dessert + a second entry
await supabase.from("food_logs").delete().eq("user_id", userId);
await supabase.from("food_logs").insert([
  {
    user_id: userId,
    description: "Death by Chocolate sundae",
    calories: 650,
    protein_g: 8,
    carbs_g: 70,
    fat_g: 35,
    verdict: "avoid",
  },
  {
    user_id: userId,
    description: "Grilled chicken bowl",
    calories: 420,
    protein_g: 40,
    carbs_g: 35,
    fat_g: 12,
    verdict: "good",
  },
]);
console.log("Seeded: DBC sundae (wrong: 650 kcal) + chicken bowl\n");

// ============ TEST 1: correct the entry via chat ============
console.log("TEST 1: 'that Death by Chocolate entry is wrong — 450 kcal, fix it'");
const t1 = await coach(
  "The Death by Chocolate sundae you logged today is wrong — it was actually 450 calories, 6g protein, 55g carbs, 22g fat. Fix the entry."
);
check("route returns 200", t1.status === 200, `got ${t1.status}: ${t1.error ?? ""}`);
check("agent executed update_food_log", t1.food_updated === true, JSON.stringify(t1).slice(0, 250));

const { data: fixed } = await supabase
  .from("food_logs")
  .select("calories, protein_g, carbs_g, fat_g")
  .eq("user_id", userId)
  .ilike("description", "%Death by Chocolate%")
  .single();
check("calories corrected to 450", fixed?.calories === 450, `cal=${fixed?.calories}`);
check("macros corrected", fixed?.protein_g === 6 && fixed?.carbs_g === 55 && fixed?.fat_g === 22, JSON.stringify(fixed));

// day total now reflects the fix
const { data: all1 } = await supabase.from("food_logs").select("calories").eq("user_id", userId);
const total1 = (all1 ?? []).reduce((s, f) => s + (f.calories ?? 0), 0);
check("day total reflects correction (870)", total1 === 870, `total=${total1}`);

// ============ TEST 2: reply doesn't falsely claim without acting ============
check(
  "reply confirms the concrete correction",
  /450/.test(t1.reply ?? ""),
  (t1.reply ?? "").slice(0, 150)
);

// ============ TEST 3: delete an entry via chat ============
console.log("\nTEST 3: 'remove the sundae from my log'");
const t3 = await coach("Actually remove the Death by Chocolate sundae from today's log entirely.");
check("route returns 200", t3.status === 200, `got ${t3.status}: ${t3.error ?? ""}`);
check("agent executed delete_food_log", t3.food_updated === true, JSON.stringify(t3).slice(0, 250));

const { count } = await supabase
  .from("food_logs")
  .select("*", { count: "exact", head: true })
  .eq("user_id", userId);
check("only chicken bowl remains", count === 1, `count=${count}`);

console.log(`\n========== FOOD FIX: ${pass} passed, ${fail} failed ==========`);
process.exit(fail > 0 ? 1 : 0);
