import { NextResponse } from "next/server";
import { logIncome, celebrate } from "@/lib/income";

/**
 * PayPal webhook — create it in developer.paypal.com → Webhooks with the URL:
 *   https://<your-app>/api/webhooks/paypal?token=<your sync token>
 * subscribed to PAYMENT.CAPTURE.COMPLETED. Requires PAYPAL_CLIENT_ID,
 * PAYPAL_CLIENT_SECRET, PAYPAL_WEBHOOK_ID (+ PAYPAL_ENV=live|sandbox) for
 * signature verification via PayPal's verify API.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function paypalBase() {
  return (process.env.PAYPAL_ENV ?? "live") === "sandbox"
    ? "https://api-m.sandbox.paypal.com"
    : "https://api-m.paypal.com";
}

async function verifySignature(req: Request, rawBody: string): Promise<boolean> {
  const id = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!id || !secret || !webhookId) {
    // Dev/test escape hatch only — NEVER set in production
    return process.env.ALLOW_UNVERIFIED_WEBHOOKS === "1";
  }

  const tokenRes = await fetch(`${paypalBase()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!tokenRes.ok) return false;
  const { access_token } = await tokenRes.json();

  const verifyRes = await fetch(`${paypalBase()}/v1/notifications/verify-webhook-signature`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${access_token}`,
    },
    body: JSON.stringify({
      transmission_id: req.headers.get("paypal-transmission-id"),
      transmission_time: req.headers.get("paypal-transmission-time"),
      cert_url: req.headers.get("paypal-cert-url"),
      auth_algo: req.headers.get("paypal-auth-algo"),
      transmission_sig: req.headers.get("paypal-transmission-sig"),
      webhook_id: webhookId,
      webhook_event: JSON.parse(rawBody),
    }),
  });
  if (!verifyRes.ok) return false;
  const { verification_status } = await verifyRes.json();
  return verification_status === "SUCCESS";
}

export async function POST(req: Request) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");
  if (!token || !UUID_RE.test(token)) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  const raw = await req.text();

  if (!(await verifySignature(req, raw))) {
    return NextResponse.json({ error: "Signature verification failed" }, { status: 401 });
  }

  let event: {
    event_type?: string;
    resource?: { id?: string; amount?: { value?: string; currency_code?: string }; note_to_payer?: string };
  };
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (event.event_type !== "PAYMENT.CAPTURE.COMPLETED") {
    return NextResponse.json({ ok: true, ignored: event.event_type });
  }

  const r = event.resource;
  const amount = parseFloat(r?.amount?.value ?? "");
  if (!r?.id || !Number.isFinite(amount)) {
    return NextResponse.json({ error: "Malformed capture payload" }, { status: 400 });
  }

  try {
    const currency = r.amount?.currency_code ?? "USD";
    const result = await logIncome({
      token,
      source: "paypal",
      amount,
      currency,
      reference: `pp_${r.id}`,
      note: r.note_to_payer ?? null,
    });
    if (result.ok && !result.duplicate) {
      await celebrate(token, amount, currency, result.month_total, result.target);
    }
    return NextResponse.json(result);
  } catch (e) {
    console.error("paypal webhook error:", e);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}
