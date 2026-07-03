/** PayPal live-API helpers for the agent: transaction history + balance. */

function base() {
  return (process.env.PAYPAL_ENV ?? "live") === "sandbox"
    ? "https://api-m.sandbox.paypal.com"
    : "https://api-m.paypal.com";
}

export function paypalConfigured(): boolean {
  return !!process.env.PAYPAL_CLIENT_ID && !!process.env.PAYPAL_CLIENT_SECRET;
}

export async function paypalToken(): Promise<string> {
  const res = await fetch(`${base()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(
        `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`
      ).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error(`PayPal auth failed (${res.status})`);
  const data = await res.json();
  return data.access_token;
}

export type PayPalTx = {
  id: string;
  status: string; // S = success, P = pending, D = denied, V = reversed
  amount: number;
  currency: string;
  date: string;
  payer: string | null;
  event_code: string;
};

/**
 * Transactions for the last N days (max 31 per PayPal window).
 * Throws "PERMISSION_PENDING" while Transaction Search is still propagating.
 */
export async function paypalTransactions(days: number): Promise<PayPalTx[]> {
  const token = await paypalToken();
  const end = new Date();
  const start = new Date(end.getTime() - Math.min(31, Math.max(1, days)) * 86400000);
  const fmt = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, "-0000");

  const res = await fetch(
    `${base()}/v1/reporting/transactions?start_date=${encodeURIComponent(fmt(start))}&end_date=${encodeURIComponent(fmt(end))}&fields=transaction_info,payer_info&page_size=100`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const data = await res.json();
  if (!res.ok) {
    if (data?.name === "NOT_AUTHORIZED") {
      throw new Error(
        "PERMISSION_PENDING: Transaction Search was enabled but PayPal is still propagating access (can take a few hours)."
      );
    }
    throw new Error(`PayPal transactions error ${res.status}: ${JSON.stringify(data).slice(0, 200)}`);
  }

  type RawTx = {
    transaction_info?: {
      transaction_id?: string;
      transaction_status?: string;
      transaction_amount?: { value?: string; currency_code?: string };
      transaction_initiation_date?: string;
      transaction_event_code?: string;
    };
    payer_info?: { payer_name?: { alternate_full_name?: string; given_name?: string } };
  };

  return ((data.transaction_details ?? []) as RawTx[])
    .map((t) => {
      const ti = t.transaction_info ?? {};
      return {
        id: ti.transaction_id ?? "",
        status: ti.transaction_status ?? "",
        amount: parseFloat(ti.transaction_amount?.value ?? "0"),
        currency: ti.transaction_amount?.currency_code ?? "USD",
        date: ti.transaction_initiation_date ?? "",
        payer:
          t.payer_info?.payer_name?.alternate_full_name ??
          t.payer_info?.payer_name?.given_name ??
          null,
        event_code: ti.transaction_event_code ?? "",
      };
    })
    .filter((t) => t.id);
}

/**
 * Incoming completed CLIENT payments only. Requires a payer name — PayPal's
 * internal currency conversions and balance transfers are positive
 * same-account rows with no payer, and must never count as revenue.
 */
export function incomingPayments(txs: PayPalTx[]): PayPalTx[] {
  return txs.filter((t) => t.status === "S" && t.amount > 0 && !!t.payer);
}
