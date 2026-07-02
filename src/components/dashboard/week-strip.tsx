import { STREAK_THRESHOLD } from "@/lib/streak";

export function WeekStrip({
  checkins,
}: {
  checkins: { checkin_date: string; completion_pct: number }[];
}) {
  const byDate = new Map(checkins.map((c) => [c.checkin_date, c.completion_pct]));
  const days: { label: string; date: string }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    days.push({
      label: d.toLocaleDateString("en-US", { weekday: "narrow" }),
      date: d.toISOString().slice(0, 10),
    });
  }

  return (
    <div className="glass p-5 fade-up" style={{ animationDelay: "0.15s" }}>
      <h3 className="font-semibold mb-3 text-sm uppercase tracking-wide text-muted">Last 7 days</h3>
      <div className="flex justify-between">
        {days.map((d) => {
          const pct = byDate.get(d.date);
          const done = pct !== undefined && pct >= STREAK_THRESHOLD;
          const partial = pct !== undefined && pct > 0 && pct < STREAK_THRESHOLD;
          return (
            <div key={d.date} className="flex flex-col items-center gap-1.5">
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-semibold ${
                  done
                    ? "bg-gradient-to-br from-emerald-500 to-teal-500 text-white"
                    : partial
                      ? "bg-warning/20 text-warning border border-warning/30"
                      : "bg-surface-2 text-muted/40 border border-white/5"
                }`}
              >
                {pct !== undefined ? `${Math.round(pct)}` : "·"}
              </div>
              <span className="text-[10px] text-muted">{d.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
