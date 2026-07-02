/**
 * E2E tests for payment webhooks: Razorpay (HMAC-verified) + PayPal
 * (dev unverified mode) auto-logging income to the active income goal.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import crypto from "node:crypto";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const APP = "http://localhost:3000";
const SECRET = env.RAZORPAY_WEBHOOK_SECRET;

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

const { data: profile } = await supabase
  .from("profiles")
  .select("sync_token")
  .eq("id", userId)
  .single();
const TOKEN = profile.sync_token;

// clean slate + income goal ($10k/month)
await supabase.from("goals").delete().eq("user_id", userId);
const { data: goal } = await supabase
  .from("goals")
  .insert({
    user_id: userId,
    title: "Hit $10k/month from video editing",
    category: "income",
    target_metric: "USD/month",
    target_value: 10000,
    current_value: 0,
    milestones: [{ title: "First client", status: "done" }],
  })
  .select("id")
  .single();
console.log("Seeded income goal ($10k/month)\n");

function razorpayBody(paymentId, amountPaise) {
  return JSON.stringify({
    event: "payment.captured",
    payload: {
      payment: {
        entity: {
          id: paymentId,
          amount: amountPaise,
          currency: "INR",
          description: "Video editing retainer",
          email: "client@example.com",
        },
      },
    },
  });
}

async function postRazorpay(body, sig) {
  const res = await fetch(`${APP}/api/webhooks/razorpay?token=${TOKEN}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-razorpay-signature": sig },
    body,
  });
  return { status: res.status, ...(await res.json().catch(() => ({}))) };
}

// ============ TEST 1: Razorpay payment.captured -> goal updated ============
console.log("TEST 1: Razorpay ₹84,000 payment lands on the goal");
const body1 = razorpayBody("pay_TEST111", 8400000); // ₹84,000 in paise
const sig1 = crypto.createHmac("sha256", SECRET).update(body1).digest("hex");
const t1 = await postRazorpay(body1, sig1);
check("route returns 200", t1.status === 200, `got ${t1.status}: ${JSON.stringify(t1).slice(0, 200)}`);
check("goal updated", t1.goal_updated === true, JSON.stringify(t1).slice(0, 200));
check("month total = $840 (84000/100)", Math.abs((t1.month_total ?? 0) - 840) < 1, `total=${t1.month_total}`);

const { data: g1 } = await supabase.from("goals").select("current_value").eq("id", goal.id).single();
check("goal current_value = 840", Math.abs(Number(g1.current_value) - 840) < 1, `value=${g1.current_value}`);

// ============ TEST 2: retry (same payment id) doesn't double-count ============
console.log("\nTEST 2: webhook retry is idempotent");
const t2 = await postRazorpay(body1, sig1);
check("duplicate flagged", t2.duplicate === true, JSON.stringify(t2).slice(0, 200));
const { data: g2 } = await supabase.from("goals").select("current_value").eq("id", goal.id).single();
check("value unchanged", Math.abs(Number(g2.current_value) - 840) < 1, `value=${g2.current_value}`);

// ============ TEST 3: bad signature rejected ============
console.log("\nTEST 3: tampered payload rejected");
const t3 = await postRazorpay(razorpayBody("pay_TEST999", 99900000), "deadbeef".repeat(8));
check("401 on bad signature", t3.status === 401, `got ${t3.status}`);

// ============ TEST 4: PayPal capture adds on top ============
console.log("\nTEST 4: PayPal $500 capture stacks the month");
const ppBody = JSON.stringify({
  event_type: "PAYMENT.CAPTURE.COMPLETED",
  resource: { id: "CAP-TEST-222", amount: { value: "500.00", currency_code: "USD" } },
});
const t4res = await fetch(`${APP}/api/webhooks/paypal?token=${TOKEN}`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: ppBody,
});
const t4 = { status: t4res.status, ...(await t4res.json().catch(() => ({}))) };
check("route returns 200", t4.status === 200, `got ${t4.status}: ${JSON.stringify(t4).slice(0, 200)}`);
check("month total = $1340", Math.abs((t4.month_total ?? 0) - 1340) < 1, `total=${t4.month_total}`);

// ============ TEST 5: everything landed in the right places ============
console.log("\nTEST 5: trail — events, progress log, coach message");
const { count: events } = await supabase
  .from("income_events")
  .select("*", { count: "exact", head: true })
  .eq("user_id", userId);
check("2 income events", events === 2, `events=${events}`);

const { count: progress } = await supabase
  .from("goal_progress")
  .select("*", { count: "exact", head: true })
  .eq("user_id", userId);
check("2 progress points (chart data)", progress === 2, `progress=${progress}`);

const { data: conv } = await supabase
  .from("coach_conversations")
  .select("id, title")
  .eq("user_id", userId)
  .eq("title", "💰 Income")
  .maybeSingle();
check("💰 Income thread exists", !!conv, "missing");
const { data: msgs } = await supabase
  .from("coach_messages")
  .select("content")
  .eq("conversation_id", conv?.id ?? "00000000-0000-0000-0000-000000000000");
check("2 coach messages", (msgs ?? []).length === 2, `msgs=${msgs?.length}`);
check(
  "message references month total",
  (msgs ?? []).some((m) => m.content.includes("1340")),
  JSON.stringify(msgs).slice(0, 200)
);

console.log(`\n========== WEBHOOKS: ${pass} passed, ${fail} failed ==========`);
process.exit(fail > 0 ? 1 : 0);
