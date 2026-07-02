import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { logIncome, celebrate } from "@/lib/income";

/**
 * Razorpay webhook — set the URL in Razorpay Dashboard → Webhooks:
 *   https://<your-app>/api/webhooks/razorpay?token=<your sync token>
 * with a webhook secret matching RAZORPAY_WEBHOOK_SECRET.
 * Listens for payment.captured; amounts arrive in paise.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");
  if (!token || !UUID_RE.test(token)) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "RAZORPAY_WEBHOOK_SECRET not configured" }, { status: 503 });
  }

  const raw = await req.text();
  const signature = req.headers.get("x-razorpay-signature") ?? "";
  const expected = crypto.createHmac("sha256", secret).update(raw).digest("hex");
  const sigOk =
    signature.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  if (!sigOk) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: {
    event?: string;
    payload?: { payment?: { entity?: { id?: string; amount?: number; currency?: string; description?: string; email?: string } } };
  };
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (event.event !== "payment.captured") {
    return NextResponse.json({ ok: true, ignored: event.event });
  }

  const p = event.payload?.payment?.entity;
  if (!p?.id || !p.amount) {
    return NextResponse.json({ error: "Malformed payment payload" }, { status: 400 });
  }

  try {
    const amount = p.amount / 100; // paise → rupees
    const currency = p.currency ?? "INR";
    const result = await logIncome({
      token,
      source: "razorpay",
      amount,
      currency,
      reference: `rzp_${p.id}`,
      note: p.description ?? p.email ?? null,
    });
    if (result.ok && !result.duplicate) {
      await celebrate(token, amount, currency, result.month_total, result.target);
    }
    return NextResponse.json(result);
  } catch (e) {
    console.error("razorpay webhook error:", e);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}
