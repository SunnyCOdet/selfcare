import { Flame, Trophy, CalendarCheck } from "lucide-react";
import type { Streak } from "@/lib/types";

export function StreakCard({ streak }: { streak: Streak | null }) {
  const current = streak?.current_streak ?? 0;
  const longest = streak?.longest_streak ?? 0;
  const total = streak?.total_checkins ?? 0;
  const lit = current > 0;
  const isRecord = lit && current >= longest;

  return (
    <div className="glass p-6 fade-up text-center" style={{ animationDelay: "0.1s" }}>
      {/* Numo-style flame with the number inside */}
      <div className="relative w-28 h-28 mx-auto">
        <Flame
          className={`w-28 h-28 ${lit ? "text-flame" : "text-white/10"}`}
          fill={lit ? "currentColor" : "none"}
          strokeWidth={lit ? 0 : 1.5}
          style={lit ? { filter: "drop-shadow(0 4px 18px rgba(255,92,31,0.45))" } : undefined}
        />
        <span
          className={`absolute inset-0 flex items-center justify-center pt-5 text-4xl font-extrabold tracking-tight ${
            lit ? "text-white" : "text-muted/40"
          }`}
        >
          {current}
        </span>
      </div>

      <p className={`text-2xl font-extrabold tracking-tight mt-2 ${lit ? "text-flame" : "text-muted"}`}>
        day streak
      </p>
      <p className="text-sm text-muted mt-1.5">
        {isRecord
          ? "It's your longest streak - don't stop."
          : lit
            ? `Record is ${longest}. Go take it.`
            : "Complete 70%+ of today to light the flame."}
      </p>

      <div className="grid grid-cols-2 gap-3 mt-5">
        <div className="metric-tile py-3.5">
          <Trophy className="w-4 h-4 text-warning mx-auto mb-1" />
          <p className="text-xl font-extrabold leading-none">{longest}</p>
          <p className="text-[10px] text-muted uppercase tracking-widest mt-1.5">Best</p>
        </div>
        <div className="metric-tile py-3.5">
          <CalendarCheck className="w-4 h-4 text-success mx-auto mb-1" />
          <p className="text-xl font-extrabold leading-none">{total}</p>
          <p className="text-[10px] text-muted uppercase tracking-widest mt-1.5">Days done</p>
        </div>
      </div>
    </div>
  );
}
