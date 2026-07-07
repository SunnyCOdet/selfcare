import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { paypalConfigured, paypalTransactions, incomingPayments } from "@/lib/paypal";
import { todayStr } from "@/lib/dates";

/**
 * Import this month's incoming PayPal payments into the income ledger.
 * Same logic as the coach's "paypal_sync" action, exposed as a button-friendly
 * endpoint. Already-tracked payments are skipped (idempotent).
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });
  }
  if (!paypalConfigured()) {
    return NextResponse.json({ ok: false, error: "PayPal isn't connected on the server yet." }, { status: 400 });
  }

  try {
    const txs = incomingPayments(await paypalTransactions(31));
    const month = todayStr().slice(0, 7);
    const thisMonth = txs.filter((t) => (t.date ?? "").slice(0, 7) === month);

    if (thisMonth.length === 0) {
      return NextResponse.json({ ok: true, added: 0, skipped: 0, message: "No incoming PayPal payments this month." });
    }

    const { data: prof } = await supabase
      .from("profiles")
      .select("sync_token")
      .eq("id", user.id)
      .single();

    const { data: result, error } = await supabase.rpc("backfill_income", {
      p_token: prof?.sync_token,
      p_events: thisMonth.map((t) => ({
        source: "paypal",
        amount: t.amount,
        currency: t.currency,
        reference: `pp_${t.id}`,
        note: t.payer,
        received_at: t.date,
      })),
    });
    if (error) throw new Error(error.message);

    return NextResponse.json({
      ok: true,
      added: result?.added ?? 0,
      skipped: result?.skipped ?? 0,
      month_total: result?.month_total ?? null,
      goal_updated: !!result?.goal_updated,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "sync failed";
    const pending = msg.includes("PERMISSION_PENDING");
    return NextResponse.json(
      {
        ok: false,
        error: pending
          ? "PayPal history access is still propagating on PayPal's side (can take a few hours). Try again later."
          : `PayPal sync failed (${msg.slice(0, 140)}).`,
      },
      { status: pending ? 503 : 500 }
    );
  }
}
