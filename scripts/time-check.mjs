/** Quick check: does the coach know the actual current IST time? */
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

const { data: auth } = await supabase.auth.signInWithPassword({
  email: "agent-test@example.com",
  password: "AgentTest123!",
});
const cookieValue = "base64-" + Buffer.from(JSON.stringify(auth.session)).toString("base64url");
const NAME = `sb-${REF}-auth-token`;
const MAX = 3180;
const cookies = [];
if (cookieValue.length <= MAX) cookies.push(`${NAME}=${cookieValue}`);
else
  for (let i = 0; i * MAX < cookieValue.length; i++)
    cookies.push(`${NAME}.${i}=${cookieValue.slice(i * MAX, (i + 1) * MAX)}`);

const res = await fetch("http://localhost:3000/api/ai/coach", {
  method: "POST",
  headers: { "Content-Type": "application/json", Cookie: cookies.join("; ") },
  body: JSON.stringify({ message: "Quick question — what's the exact current time and day right now?", kind: "chat" }),
});
const data = await res.json();

const istNow = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
}).format(new Date());

console.log("ACTUAL IST TIME:", istNow);
console.log("COACH SAYS:", data.reply);

// hour must appear in the reply (allow minute drift)
const hourToken = istNow.split(":")[0];
const ok = (data.reply ?? "").includes(hourToken);
console.log(ok ? "\nPASS — coach knows the real time" : "\nFAIL — time mismatch");
process.exit(ok ? 0 : 1);
