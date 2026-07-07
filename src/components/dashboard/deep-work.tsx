"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Brain, Play, Square, Check } from "lucide-react";

const DURATIONS = [25, 50, 90];

/**
 * Deep Work focus timer. Wall-clock based (stores an absolute end time) so it
 * stays accurate even when an installed PWA throttles background timers.
 * On completion it logs a focus_sessions row and marks the plan's deep-work
 * non-negotiable done via the quick-log endpoint.
 */
export function DeepWork({
  userId,
  syncToken,
  initialMinutesToday = 0,
  initialSessions = 0,
}: {
  userId: string;
  syncToken?: string | null;
  initialMinutesToday?: number;
  initialSessions?: number;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [selected, setSelected] = useState(50);
  const [running, setRunning] = useState(false);
  const [remaining, setRemaining] = useState(0); // seconds
  const [todayMinutes, setTodayMinutes] = useState(initialMinutesToday);
  const [sessions, setSessions] = useState(initialSessions);
  const [flash, setFlash] = useState<string | null>(null);

  const startedAtRef = useRef<number>(0);
  const endAtRef = useRef<number>(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTick = () => {
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = null;
  };
  useEffect(() => clearTick, []);

  async function complete(minutes: number) {
    clearTick();
    setRunning(false);
    setRemaining(0);
    if (minutes < 1) return;

    setTodayMinutes((m) => m + minutes);
    setSessions((s) => s + 1);
    setFlash(`Logged ${minutes} min of deep work`);
    setTimeout(() => setFlash(null), 3000);

    await supabase.from("focus_sessions").insert({
      user_id: userId,
      label: "Deep Work",
      minutes,
      target_minutes: selected,
      started_at: new Date(startedAtRef.current).toISOString(),
    });

    // Tie into today's score if the plan has a deep-work non-negotiable.
    if (syncToken) {
      fetch(`/api/log?token=${syncToken}&action=done&text=${encodeURIComponent("deep work")}`).catch(
        () => {}
      );
    }
  }

  function tick() {
    const secs = Math.max(0, Math.round((endAtRef.current - Date.now()) / 1000));
    setRemaining(secs);
    if (secs <= 0) complete(selected);
  }

  function start() {
    const now = Date.now();
    startedAtRef.current = now;
    endAtRef.current = now + selected * 60000;
    setRunning(true);
    setRemaining(selected * 60);
    clearTick();
    tickRef.current = setInterval(tick, 500);
  }

  function stop() {
    const elapsed = Math.round((Date.now() - startedAtRef.current) / 60000);
    complete(elapsed);
  }

  const mm = String(Math.floor(remaining / 60)).padStart(2, "0");
  const ss = String(remaining % 60).padStart(2, "0");
  const progress = running ? 1 - remaining / (selected * 60) : 0;

  return (
    <div className="glass p-5 fade-up" style={{ animationDelay: "0.2s" }}>
      <div className="flex items-center justify-between gap-2 mb-3">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <Brain className="w-4 h-4 text-accent" /> Deep Work
        </h3>
        <span className="text-xs text-muted">
          {todayMinutes} min today{sessions > 0 ? ` · ${sessions} session${sessions === 1 ? "" : "s"}` : ""}
        </span>
      </div>

      {running ? (
        <div className="space-y-3">
          <div className="text-center">
            <p className="text-5xl font-black tabular-nums tracking-tight">
              {mm}:{ss}
            </p>
            <p className="text-[11px] text-muted uppercase tracking-widest mt-1">focusing · {selected} min</p>
          </div>
          <div className="h-1.5 rounded-full bg-white/8 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-accent to-accent-2 transition-all duration-500"
              style={{ width: `${Math.min(100, progress * 100)}%` }}
            />
          </div>
          <button onClick={stop} className="btn-ghost w-full justify-center !py-2.5 text-sm">
            <Square className="w-4 h-4" /> Stop &amp; log
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex gap-2">
            {DURATIONS.map((d) => (
              <button
                key={d}
                onClick={() => setSelected(d)}
                className={`flex-1 rounded-xl border py-2 text-sm font-semibold transition-all ${
                  selected === d
                    ? "border-accent/50 bg-accent/10 text-accent"
                    : "border-white/10 bg-surface-2 text-muted hover:border-white/20"
                }`}
              >
                {d}m
              </button>
            ))}
          </div>
          <button onClick={start} className="btn-primary w-full justify-center !py-2.5">
            <Play className="w-4 h-4" /> Start focus
          </button>
          {flash && (
            <p className="text-xs text-success flex items-center gap-1.5 justify-center">
              <Check className="w-3.5 h-3.5" /> {flash}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
