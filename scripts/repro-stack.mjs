/** Reproduce the "Maximum call stack size exceeded" during a streamed plan update. */
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
const userId = auth.user.id;
const cookieValue = "base64-" + Buffer.from(JSON.stringify(auth.session)).toString("base64url");
const NAME = `sb-${REF}-auth-token`;
const MAX = 3180;
const cookies = [];
if (cookieValue.length <= MAX) cookies.push(`${NAME}=${cookieValue}`);
else
  for (let i = 0; i * MAX < cookieValue.length; i++)
    cookies.push(`${NAME}.${i}=${cookieValue.slice(i * MAX, (i + 1) * MAX)}`);

// seed active plan
const mkPlan = (cal) => ({
  summary: `Plan ${cal}`,
  goal_analysis: "t",
  timeline_weeks: 12,
  steps_target: 20000,
  weekly_schedule: ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"].map((day) => ({
    day, blocks: [{ time: "06:30", activity: "Walk", details: "" }],
  })),
  workout_plan: { gym_days_per_week: 5, split_name: "PPL", days: [{ day: "Monday", focus: "Push", exercises: [{ name: "Bench", sets: "4", reps: "8", notes: "" }] }], cardio_guidance: "walk" },
  nutrition: { daily_calories: cal, protein_g: 170, carbs_g: 200, fat_g: 60, water_liters: 3, meals: [{ time: "08:00", name: "B", items: ["eggs"], notes: "" }], guidelines: [] },
  skincare: { morning: [], evening: [], weekly: [], guidance: [] },
  grooming: [], sleep: { target_hours: 8, wind_down: [] }, activities: [],
  daily_non_negotiables: ["Walk 20,000 steps"], weekly_milestones: [], model_prep: [],
});
await supabase.from("transformation_plans").delete().eq("user_id", userId);
await supabase.from("transformation_plans").insert({ user_id: userId, plan: mkPlan(2400), status: "active", version: 1 });
console.log("Seeded plan. Sending the exact failing message (streamed)...\n");

const res = await fetch("http://localhost:3000/api/ai/coach", {
  method: "POST",
  headers: { "Content-Type": "application/json", Cookie: cookies.join("; ") },
  body: JSON.stringify({
    message: "hey can you change the meal plans for me i can use only rice as carb source and eggs and whey protein as protein source and oil as fat source and structure it accordingly please",
    kind: "chat",
    stream: true,
  }),
});
console.log("status:", res.status, "| content-type:", res.headers.get("content-type"));

const reader = res.body.getReader();
const decoder = new TextDecoder();
let buf = "";
let deltas = 0, statusEvents = [], errEvent = null, doneEvent = null;
for (;;) {
  const { done, value } = await reader.read();
  if (done) break;
  buf += decoder.decode(value, { stream: true });
  const lines = buf.split("\n");
  buf = lines.pop() ?? "";
  for (const line of lines) {
    const t = line.trim();
    if (!t.startsWith("data:")) continue;
    try {
      const ev = JSON.parse(t.slice(5).trim());
      if (ev.t === "d") deltas++;
      else if (ev.t === "s") statusEvents.push(ev.s);
      else if (ev.t === "err") errEvent = ev;
      else if (ev.t === "done") doneEvent = ev;
    } catch {}
  }
}
console.log("deltas:", deltas);
console.log("status events:", statusEvents);
console.log("ERR event:", errEvent);
console.log("DONE event:", doneEvent ? { plan_updated: doneEvent.plan_updated, conv: !!doneEvent.conversation_id } : null);
