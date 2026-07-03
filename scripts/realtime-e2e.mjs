/**
 * E2E: Supabase Realtime delivers this user's row changes (the live-UI
 * pipeline): INSERT, UPDATE, and DELETE on food_logs must each produce an
 * event on an RLS-scoped subscription.
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
await supabase.realtime.setAuth(auth.session.access_token);

const events = [];
const channel = supabase
  .channel("live-ui-test")
  .on("postgres_changes", { event: "*", schema: "public", table: "food_logs" }, (payload) => {
    events.push(payload.eventType);
  })
  .subscribe();

// wait for subscription to join
let joined = false;
for (let i = 0; i < 40 && !joined; i++) {
  joined = channel.state === "joined";
  await sleep(250);
}
check("realtime channel joined", joined, `state=${channel.state}`);
await sleep(2500); // let the postgres_changes registration settle server-side

console.log("Mutating a food_logs row (insert -> update -> delete)...");
const { data: row, error: insErr } = await supabase
  .from("food_logs")
  .insert({ user_id: userId, description: "Realtime test meal", calories: 100 })
  .select("id")
  .single();
check("insert ok", !insErr && !!row, insErr?.message ?? "");
await sleep(2500);

await supabase.from("food_logs").update({ calories: 200 }).eq("id", row.id);
await sleep(2500);

await supabase.from("food_logs").delete().eq("id", row.id);
await sleep(2500);

check("INSERT event received", events.includes("INSERT"), JSON.stringify(events));
check("UPDATE event received", events.includes("UPDATE"), JSON.stringify(events));
check("DELETE event received", events.includes("DELETE"), JSON.stringify(events));
console.log("  events:", events.join(", ") || "(none)");

await supabase.removeChannel(channel);
console.log(`\n========== REALTIME: ${pass} passed, ${fail} failed ==========`);
process.exit(fail > 0 ? 1 : 0);
