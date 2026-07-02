import { Check } from "lucide-react";
import { STREAK_THRESHOLD } from "@/lib/streak";

/** Numo/Apple Fitness-style week row: a check circle per day. */
export function WeekStrip({
  checkins,
}: {
  checkins: { checkin_date: string; completion_pct: number }[];
}) {
  const byDate = new Map(checkins.map((c) => [c.checkin_date, c.completion_pct]));
  const days: { label: string; date: string; isToday: boolean }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    days.push({
      label: d.toLocaleDateString("en-US", { weekday: "narrow" }),
      date: d.toISOString().slice(0, 10),
      isToday: i === 0,
    });
  }

  return (
    <div className="glass px-4 py-4 md:p-5 fade-up" style={{ animationDelay: "0.15s" }}>
      <div className="flex justify-between">
        {days.map((d) => {
          const pct = byDate.get(d.date);
          const done = pct !== undefined && pct >= STREAK_THRESHOLD;
          const partial = pct !== undefined && pct > 0 && pct < STREAK_THRESHOLD;
          return (
            <div key={d.date} className="flex flex-col items-center gap-1.5">
              <span
                className={`text-[10px] font-semibold uppercase ${
                  d.isToday ? "text-flame" : "text-muted/70"
                }`}
              >
                {d.label}
              </span>
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center border-2 transition-all ${
                  done
                    ? "bg-flame border-flame text-white"
                    : partial
                      ? "border-flame/50 text-flame"
                      : d.isToday
                        ? "border-white/30 text-muted"
                        : "border-white/10 text-muted/30"
                }`}
              >
                {done ? (
                  <Check className="w-4.5 h-4.5" strokeWidth={3.5} />
                ) : partial ? (
                  <span className="text-[10px] font-bold">{Math.round(pct!)}</span>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
