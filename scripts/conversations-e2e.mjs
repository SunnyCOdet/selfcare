/**
 * E2E tests for ChatGPT-style conversation threads:
 * new chat -> auto-created + AI-titled thread; follow-up stays in the same
 * thread with history; second new chat -> separate thread.
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

async function coach(message, conversation_id = null) {
  const res = await fetch(`${APP}/api/ai/coach`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: COOKIE },
    body: JSON.stringify({ message, kind: "chat", conversation_id }),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ...data };
}

await supabase.from("coach_conversations").delete().eq("user_id", userId);
console.log("Clean slate. Testing conversation threads...\n");

// TEST 1: first message creates a titled thread
console.log("TEST 1: new chat creates an AI-titled conversation");
const t1 = await coach("My favorite number is 47. Just acknowledge it briefly.");
check("route returns 200", t1.status === 200, `got ${t1.status}: ${t1.error ?? ""}`);
check("conversation_id returned", typeof t1.conversation_id === "string", JSON.stringify(t1).slice(0, 200));
check(
  "AI generated a title",
  typeof t1.conversation_title === "string" && t1.conversation_title.length > 2,
  `title=${t1.conversation_title}`
);

const { data: convRow } = await supabase
  .from("coach_conversations")
  .select("id, title")
  .eq("id", t1.conversation_id)
  .maybeSingle();
check("conversation row saved", !!convRow, "missing");

const { count: msgCount1 } = await supabase
  .from("coach_messages")
  .select("*", { count: "exact", head: true })
  .eq("conversation_id", t1.conversation_id);
check("2 messages in thread", msgCount1 === 2, `count=${msgCount1}`);

// TEST 2: follow-up in the same thread uses history
console.log("\nTEST 2: follow-up remembers thread context");
const t2 = await coach("What did I just tell you my favorite number was? Answer with the number.", t1.conversation_id);
check("route returns 200", t2.status === 200, `got ${t2.status}: ${t2.error ?? ""}`);
check("same conversation kept", t2.conversation_id === t1.conversation_id, `got ${t2.conversation_id}`);
check("history recalled (says 47)", /47/.test(t2.reply ?? ""), `reply=${(t2.reply ?? "").slice(0, 120)}`);

const { count: msgCount2 } = await supabase
  .from("coach_messages")
  .select("*", { count: "exact", head: true })
  .eq("conversation_id", t1.conversation_id);
check("4 messages in thread", msgCount2 === 4, `count=${msgCount2}`);

// TEST 3: new chat is a separate thread with no bleed-over of thread history
console.log("\nTEST 3: new chat starts a fresh thread");
const t3 = await coach("Say hello in exactly three words.");
check("route returns 200", t3.status === 200, `got ${t3.status}: ${t3.error ?? ""}`);
check(
  "different conversation created",
  t3.conversation_id && t3.conversation_id !== t1.conversation_id,
  `got ${t3.conversation_id}`
);

const { count: convCount } = await supabase
  .from("coach_conversations")
  .select("*", { count: "exact", head: true })
  .eq("user_id", userId);
check("2 conversations exist", convCount === 2, `count=${convCount}`);

console.log(`\n========== CONVERSATIONS: ${pass} passed, ${fail} failed ==========`);
process.exit(fail > 0 ? 1 : 0);
