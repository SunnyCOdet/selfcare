import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import webpush from "web-push";

/** FX used everywhere income is converted (matches the log_income SQL). */
export const INR_PER_USD = 100;

/** Shared helper for payment webhooks: log via RPC, then celebrate via push. */

export function anonClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

export async function logIncome(params: {
  token: string;
  source: "razorpay" | "paypal";
  amount: number;
  currency: string;
  reference: string;
  note?: string | null;
}) {
  const supabase = anonClient();
  const { data, error } = await supabase.rpc("log_income", {
    p_token: params.token,
    p_source: params.source,
    p_amount: params.amount,
    p_currency: params.currency,
    p_reference: params.reference,
    p_note: params.note ?? null,
  });
  if (error) throw new Error(error.message);
  return data as {
    ok: boolean;
    duplicate?: boolean;
    goal_updated?: boolean;
    month_total?: number;
    target?: number;
    error?: string;
  };
}

/** Push a celebration to the user's devices (best-effort, needs service key). */
export async function celebrate(
  token: string,
  amount: number,
  currency: string,
  monthTotal?: number,
  target?: number
) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.VAPID_PRIVATE_KEY) return;
  try {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || "mailto:coach@ascend.app",
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
      process.env.VAPID_PRIVATE_KEY!
    );
    const admin = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    );
    const { data: prof } = await admin
      .from("profiles")
      .select("id")
      .eq("sync_token", token)
      .maybeSingle();
    if (!prof) return;
    const { data: subs } = await admin
      .from("push_subscriptions")
      .select("endpoint, keys")
      .eq("user_id", prof.id);
    const body =
      monthTotal != null && target != null
        ? `${amount.toLocaleString()} ${currency} in. Month: ${monthTotal.toLocaleString()} / ${Number(target).toLocaleString()} 📈`
        : `${amount.toLocaleString()} ${currency} landed.`;
    for (const s of subs ?? []) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: s.keys as { p256dh: string; auth: string } },
          JSON.stringify({ title: "Payment received 💰", body, url: "/plan#goals", tag: "income" })
        );
      } catch {
        /* stale sub — cron cleans these */
      }
    }
  } catch (e) {
    console.error("celebrate failed:", e);
  }
}
