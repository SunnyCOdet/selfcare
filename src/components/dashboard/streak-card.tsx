import { Flame, Trophy, CalendarCheck } from "lucide-react";
import type { Streak } from "@/lib/types";

export function StreakCard({ streak }: { streak: Streak | null }) {
  const current = streak?.current_streak ?? 0;
  const longest = streak?.longest_streak ?? 0;
  const total = streak?.total_checkins ?? 0;

  return (
    <div className="glass p-6 fade-up text-center" style={{ animationDelay: "0.1s" }}>
      <div
        className={`w-24 h-24 mx-auto rounded-full flex flex-col items-center justify-center ${
          current > 0
            ? "bg-gradient-to-br from-orange-500 to-rose-500 streak-glow"
            : "bg-surface-2 border border-white/10"
        }`}
      >
        <Flame className={`w-8 h-8 ${current > 0 ? "text-white" : "text-muted/40"}`} />
        <span className={`text-xl font-bold leading-none mt-0.5 ${current > 0 ? "text-white" : "text-muted/40"}`}>
          {current}
        </span>
      </div>
      <p className="font-semibold mt-3">
        {current > 0 ? `${current} day streak` : "Start your streak today"}
      </p>
      <p className="text-xs text-muted mt-1">
        Complete 70%+ of today&apos;s routine to keep the flame alive.
      </p>

      <div className="grid grid-cols-2 gap-3 mt-5">
        <div className="bg-surface-2 rounded-xl py-3">
          <Trophy className="w-4 h-4 text-warning mx-auto mb-1" />
          <p className="text-lg font-bold leading-none">{longest}</p>
          <p className="text-[10px] text-muted uppercase tracking-wide mt-1">Best streak</p>
        </div>
        <div className="bg-surface-2 rounded-xl py-3">
          <CalendarCheck className="w-4 h-4 text-success mx-auto mb-1" />
          <p className="text-lg font-bold leading-none">{total}</p>
          <p className="text-[10px] text-muted uppercase tracking-wide mt-1">Days done</p>
        </div>
      </div>
    </div>
  );
}
