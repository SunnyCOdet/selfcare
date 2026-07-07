/**
 * E2E: quick-log (/api/log) + calendar feed (/api/calendar/<token>.ics).
 *
 * Token-based endpoints — no session needed. Uses the service-role key only to
 * pick a test user, snapshot today's check-in, verify DB effects, and restore
 * the row afterwards (wrapped in finally, so state is left untouched).
 *
 * Run: node scripts/powers-e2e.mjs   (dev server must be up on APP, default :3000)
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);

const APP = process.env.APP || "http://localhost:3000";
if (!env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    "SKIP: SUPABASE_SERVICE_ROLE_KEY is not set in .env.local — needed to snapshot/verify/restore the\n" +
      "test user's check-in. Add it (Supabase dashboard -> Settings -> API -> service_role) and re-run."
  );
  process.exit(2);
}
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

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
const near = (a, b) => Math.abs(Number(a) - Number(b)) < 1e-6;
const IST = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());

async function getLog(qs) {
  const res = await fetch(`${APP}/api/log?${qs}`);
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

// --- pick a user with an active plan + non-negotiables ---
const { data: plans } = await admin
  .from("transformation_plans")
  .select("user_id, plan, created_at")
  .eq("status", "active")
  .order("created_at", { ascending: false });

let user = null;
for (const p of plans ?? []) {
  const nn = (p.plan?.daily_non_negotiables ?? []).filter((t) => !/step/i.test(t));
  if (nn.length === 0) continue;
  const { data: prof } = await admin
    .from("profiles")
    .select("id, sync_token")
    .eq("id", p.user_id)
    .maybeSingle();
  if (prof?.sync_token) {
    user = { id: prof.id, token: prof.sync_token, nn };
    break;
  }
}
if (!user) {
  console.error("No user with an active plan + sync_token + non-step non-negotiable found.");
  process.exit(1);
}

// A distinctive word from a non-negotiable that our matcher will hit as a substring
const searchWord = user.nn
  .flatMap((t) => t.toLowerCase().match(/[a-z]{4,}/g) ?? [])
  .find((w) => !["every", "complete", "morning", "evening", "daily"].includes(w));

const today = IST();
const { data: snapshot } = await admin
  .from("daily_checkins")
  .select("*")
  .eq("user_id", user.id)
  .eq("checkin_date", today)
  .maybeSingle();

console.log(`\nQuick-log + calendar E2E  (user ${user.id.slice(0, 8)}, word "${searchWord}")\n`);

try {
  // ---------- /api/log ----------
  const base = await admin
    .from("daily_checkins")
    .select("water_liters")
    .eq("user_id", user.id)
    .eq("checkin_date", today)
    .maybeSingle();
  const baseWater = Number(base.data?.water_liters ?? 0);

  const w1 = await getLog(`token=${user.token}&action=water&value=0.3`);
  check("water add #1 ok", w1.json.ok === true, JSON.stringify(w1.json));
  check("water add #1 value", near(w1.json.water_liters, baseWater + 0.3), `got ${w1.json.water_liters}`);

  const w2 = await getLog(`token=${user.token}&action=water&value=0.2`);
  check("water is additive", near(w2.json.water_liters, baseWater + 0.5), `got ${w2.json.water_liters}`);

  const weight = await getLog(`token=${user.token}&action=weight&value=77.7`);
  check("weight set", weight.json.ok && near(weight.json.weight_kg, 77.7), JSON.stringify(weight.json));

  const sleep = await getLog(`token=${user.token}&action=sleep&value=6.5`);
  check("sleep set", sleep.json.ok && near(sleep.json.sleep_hours, 6.5), JSON.stringify(sleep.json));

  const mood = await getLog(`token=${user.token}&action=mood&text=Radiant`);
  check("mood preserves case", mood.json.mood === "Radiant", `got ${mood.json.mood}`);

  const steps = await getLog(`token=${user.token}&action=steps&value=12345`);
  check("steps set", steps.json.ok && steps.json.steps === 12345, JSON.stringify(steps.json));

  const done = await getLog(`token=${user.token}&action=done&text=${encodeURIComponent(searchWord)}`);
  check("done matches a non-negotiable", !!done.json.matched, JSON.stringify(done.json));
  const pctAfterDone = done.json.completion_pct;

  const undone = await getLog(`token=${user.token}&action=undone&text=${encodeURIComponent(searchWord)}`);
  check("undone matches same habit", undone.json.matched === done.json.matched, JSON.stringify(undone.json));
  check("undone lowers completion", undone.json.completion_pct < pctAfterDone || pctAfterDone === 0,
    `${undone.json.completion_pct} vs ${pctAfterDone}`);

  const badAction = await getLog(`token=${user.token}&action=frobnicate`);
  check("unknown action rejected", badAction.json.ok === false, JSON.stringify(badAction.json));

  const badToken = await getLog(`token=00000000-0000-0000-0000-000000000000&action=water&value=1`);
  check("bad token -> 401", badToken.status === 401, `status ${badToken.status}`);

  const noAction = await getLog(`token=${user.token}`);
  check("missing action -> 400", noAction.status === 400, `status ${noAction.status}`);

  // ---------- /api/calendar ----------
  const cal = await fetch(`${APP}/api/calendar/${user.token}.ics`);
  const body = await cal.text();
  check("calendar 200", cal.status === 200, `status ${cal.status}`);
  check("calendar content-type", (cal.headers.get("content-type") || "").includes("text/calendar"));
  check("calendar has VCALENDAR", body.includes("BEGIN:VCALENDAR") && body.includes("END:VCALENDAR"));
  check("calendar has VTIMEZONE Asia/Kolkata", body.includes("TZID:Asia/Kolkata"));
  check("calendar has events", (body.match(/BEGIN:VEVENT/g) || []).length > 0);
  check("events have TZID start", body.includes("DTSTART;TZID=Asia/Kolkata:"));
  check("events have alarms", (body.match(/BEGIN:VALARM/g) || []).length > 0);

  const calBad = await fetch(`${APP}/api/calendar/not-a-uuid.ics`);
  check("calendar bad token -> 400", calBad.status === 400, `status ${calBad.status}`);

  const calMissing = await fetch(`${APP}/api/calendar/00000000-0000-0000-0000-000000000000.ics`);
  check("calendar unknown token -> 404", calMissing.status === 404, `status ${calMissing.status}`);
} finally {
  // ---------- restore today's row exactly ----------
  if (snapshot) {
    const { id, created_at, updated_at, ...cols } = snapshot;
    await admin.from("daily_checkins").update(cols).eq("id", id);
    console.log("\n  (restored today's check-in from snapshot)");
  } else {
    await admin.from("daily_checkins").delete().eq("user_id", user.id).eq("checkin_date", today);
    console.log("\n  (removed the check-in row created during the test)");
  }
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
