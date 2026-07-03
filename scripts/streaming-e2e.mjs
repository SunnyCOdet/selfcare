/** E2E: verify /api/ai/coach streams SSE token deltas + a done event. */
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
const cookieValue = "base64-" + Buffer.from(JSON.stringify(auth.session)).toString("base64url");
const NAME = `sb-${REF}-auth-token`;
const MAX = 3180;
const cookies = [];
if (cookieValue.length <= MAX) cookies.push(`${NAME}=${cookieValue}`);
else
  for (let i = 0; i * MAX < cookieValue.length; i++)
    cookies.push(`${NAME}.${i}=${cookieValue.slice(i * MAX, (i + 1) * MAX)}`);

console.log("TEST: streamed reply arrives as many small deltas");
const res = await fetch("http://localhost:3000/api/ai/coach", {
  method: "POST",
  headers: { "Content-Type": "application/json", Cookie: cookies.join("; ") },
  body: JSON.stringify({
    message: "In about 60 words, give me a pep talk about consistency.",
    kind: "chat",
    stream: true,
  }),
});

check("SSE content type", res.headers.get("content-type")?.includes("text/event-stream") === true, res.headers.get("content-type"));

const reader = res.body.getReader();
const decoder = new TextDecoder();
let buf = "";
let deltas = 0;
let text = "";
let done = null;
let firstDeltaAt = null;
const t0 = Date.now();

for (;;) {
  const { done: end, value } = await reader.read();
  if (end) break;
  buf += decoder.decode(value, { stream: true });
  const lines = buf.split("\n");
  buf = lines.pop() ?? "";
  for (const line of lines) {
    const t = line.trim();
    if (!t.startsWith("data:")) continue;
    try {
      const ev = JSON.parse(t.slice(5).trim());
      if (ev.t === "d") {
        deltas++;
        text += ev.d;
        if (!firstDeltaAt) firstDeltaAt = Date.now() - t0;
      } else if (ev.t === "done") done = ev;
    } catch {}
  }
}

check("many deltas (true streaming)", deltas >= 5, `deltas=${deltas}`);
check("first token arrived before completion", firstDeltaAt !== null && firstDeltaAt < 20000, `firstDelta=${firstDeltaAt}ms`);
check("assembled text is substantive", text.length > 100, `len=${text.length}`);
check("done event received", !!done, "missing");
check("done carries conversation_id", typeof done?.conversation_id === "string", JSON.stringify(done).slice(0, 150));
check("streamed text matches saved reply", typeof done?.reply === "string" && done.reply === text, `match=${done?.reply === text}`);
console.log(`  (deltas=${deltas}, first token at ${firstDeltaAt}ms, total ${Date.now() - t0}ms)`);

// JSON fallback still works (test suites depend on it)
console.log("\nTEST: non-streaming JSON mode unchanged");
const res2 = await fetch("http://localhost:3000/api/ai/coach", {
  method: "POST",
  headers: { "Content-Type": "application/json", Cookie: cookies.join("; ") },
  body: JSON.stringify({ message: "Say OK in one word.", kind: "chat" }),
});
const data2 = await res2.json();
check("json 200", res2.status === 200, `got ${res2.status}`);
check("json reply present", typeof data2.reply === "string" && data2.reply.length > 0, JSON.stringify(data2).slice(0, 120));

console.log(`\n========== STREAMING: ${pass} passed, ${fail} failed ==========`);
process.exit(fail > 0 ? 1 : 0);
