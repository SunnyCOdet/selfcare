"use client";

import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend } from "recharts";
import { Wallet } from "lucide-react";

export type IncomeEvent = {
  source: string;
  amount: number;
  currency: string;
  received_at: string;
};

const INR_PER_USD = 84;

function istDate(ts: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(ts));
}

function symbol(currency: string): string {
  return currency === "INR" ? "₹" : currency === "USD" ? "$" : `${currency} `;
}

/** "₹84,000" or "₹84,000 + $200" when a source received multiple currencies. */
function nativeSum(events: IncomeEvent[]): string {
  const byCur = new Map<string, number>();
  for (const e of events) byCur.set(e.currency, (byCur.get(e.currency) ?? 0) + Number(e.amount));
  if (byCur.size === 0) return "—";
  return [...byCur.entries()]
    .map(([cur, amt]) => `${symbol(cur)}${Math.round(amt).toLocaleString()}`)
    .join(" + ");
}

function toUsd(e: IncomeEvent): number {
  return e.currency === "INR" ? Number(e.amount) / INR_PER_USD : Number(e.amount);
}
function toInr(e: IncomeEvent): number {
  return e.currency === "USD" ? Number(e.amount) * INR_PER_USD : Number(e.amount);
}

export function RevenueCard({
  events,
  targetValue,
  targetMetric,
}: {
  events: IncomeEvent[];
  targetValue: number | null;
  targetMetric: string | null;
}) {
  if (events.length === 0) return null;

  const usdGoal =
    !targetMetric ||
    targetMetric.toLowerCase().includes("usd") ||
    targetMetric.includes("$") ||
    targetMetric.toLowerCase().includes("dollar");
  const convert = usdGoal ? toUsd : toInr;
  const goalSym = usdGoal ? "$" : "₹";

  const thisMonth = istDate(new Date().toISOString()).slice(0, 7);

  const monthEvents = events.filter((e) => istDate(e.received_at).startsWith(thisMonth));
  const razorpayMonth = monthEvents.filter((e) => e.source === "razorpay");
  const paypalMonth = monthEvents.filter((e) => e.source === "paypal");
  const monthTotal = Math.round(monthEvents.reduce((s, e) => s + convert(e), 0));
  const pct =
    targetValue && targetValue > 0 ? Math.min(100, Math.round((monthTotal / targetValue) * 100)) : null;

  // Daily stacked bars for the current month (goal currency)
  const daily = new Map<string, { razorpay: number; paypal: number }>();
  for (const e of monthEvents) {
    const day = istDate(e.received_at).slice(8); // DD
    const row = daily.get(day) ?? { razorpay: 0, paypal: 0 };
    if (e.source === "paypal") row.paypal += convert(e);
    else row.razorpay += convert(e);
    daily.set(day, row);
  }
  const chartData = [...daily.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, v]) => ({
      day,
      Razorpay: Math.round(v.razorpay),
      PayPal: Math.round(v.paypal),
    }));

  // Month-by-month history (up to 6 months, newest first)
  const byMonth = new Map<string, IncomeEvent[]>();
  for (const e of events) {
    const m = istDate(e.received_at).slice(0, 7);
    byMonth.set(m, [...(byMonth.get(m) ?? []), e]);
  }
  const history = [...byMonth.entries()].sort(([a], [b]) => b.localeCompare(a)).slice(0, 6);

  return (
    <section className="glass p-6 fade-up" style={{ animationDelay: "0.04s" }}>
      <h2 className="font-semibold flex items-center gap-2 mb-4">
        <Wallet className="w-5 h-5 text-warning" /> Revenue — auto-tracked
      </h2>

      {/* This month, per source */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-surface-2 rounded-2xl p-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-sky-300">Razorpay</p>
          <p className="text-xl font-extrabold mt-1">{nativeSum(razorpayMonth)}</p>
          <p className="text-[11px] text-muted mt-0.5">
            {razorpayMonth.length} payment{razorpayMonth.length === 1 ? "" : "s"} this month
          </p>
        </div>
        <div className="bg-surface-2 rounded-2xl p-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-blue-300">PayPal</p>
          <p className="text-xl font-extrabold mt-1">{nativeSum(paypalMonth)}</p>
          <p className="text-[11px] text-muted mt-0.5">
            {paypalMonth.length} payment{paypalMonth.length === 1 ? "" : "s"} this month
          </p>
        </div>
      </div>

      {/* Combined month total vs goal */}
      <div className="mt-3 bg-surface-2 rounded-2xl p-4">
        <div className="flex items-baseline justify-between flex-wrap gap-1">
          <p className="text-sm text-muted">This month combined</p>
          <p className="text-2xl font-extrabold text-warning">
            {goalSym}
            {monthTotal.toLocaleString()}
            {targetValue != null && (
              <span className="text-sm text-muted font-normal">
                {" "}
                / {goalSym}
                {Number(targetValue).toLocaleString()}
              </span>
            )}
          </p>
        </div>
        {pct != null && (
          <div className="h-1.5 rounded-full bg-white/8 overflow-hidden mt-2">
            <div
              className="h-full rounded-full bg-gradient-to-r from-amber-500 to-orange-500 transition-all duration-700"
              style={{ width: `${pct}%` }}
            />
          </div>
        )}
      </div>

      {/* Daily bars this month */}
      {chartData.length > 0 && (
        <div className="h-44 mt-4">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
              <XAxis dataKey="day" tick={{ fill: "#98989f", fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#98989f", fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{
                  background: "#16161c",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: "12px",
                  color: "#f5f5f7",
                  fontSize: 12,
                }}
                formatter={(v, name) => [`${goalSym}${Number(v ?? 0).toLocaleString()}`, name]}
                labelFormatter={(d) => `Day ${d}`}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="Razorpay" stackId="rev" fill="#38bdf8" radius={[0, 0, 0, 0]} />
              <Bar dataKey="PayPal" stackId="rev" fill="#818cf8" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Month history */}
      {history.length > 1 && (
        <div className="mt-4 border-t border-white/5 pt-3">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted mb-2">
            Month by month
          </p>
          <div className="space-y-1.5">
            {history.map(([month, evs]) => {
              const rz = evs.filter((e) => e.source === "razorpay");
              const pp = evs.filter((e) => e.source === "paypal");
              const total = Math.round(evs.reduce((s, e) => s + convert(e), 0));
              const label = new Date(`${month}-01T00:00:00`).toLocaleDateString("en-IN", {
                month: "short",
                year: "numeric",
              });
              return (
                <div key={month} className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-muted w-20 shrink-0">{label}</span>
                  <span className="text-xs text-muted truncate">
                    RZP {nativeSum(rz)} · PP {nativeSum(pp)}
                  </span>
                  <span className="font-bold shrink-0">
                    {goalSym}
                    {total.toLocaleString()}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
