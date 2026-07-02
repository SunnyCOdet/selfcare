"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { updateStreak } from "@/lib/streak";
import type { DailyCheckin, TransformationPlan } from "@/lib/types";
import { Footprints, Check, Droplets, Moon, Scale, Loader2, RefreshCw, ChevronDown } from "lucide-react";

/** Name your iOS Shortcut exactly this for the one-tap sync button. */
const SHORTCUT_NAME = "Ascend Sync";

const MOODS = ["🔥 Unstoppable", "😊 Good", "😐 Okay", "😮‍💨 Tired", "😞 Rough"];

/**
 * Apple Health-style hourly breakdown. Snapshots are cumulative day totals
 * keyed by IST hour ("06" → 3500), so per-hour steps are the diffs between
 * consecutive snapshots.
 */
function HourlyBars({ hourly }: { hourly: Record<string, number> }) {
  const entries = Object.entries(hourly)
    .map(([h, v]) => ({ hour: parseInt(h), total: Number(v) || 0 }))
    .sort((a, b) => a.hour - b.hour);

  const bars = entries.map((e, i) => ({
    hour: e.hour,
    gained: Math.max(0, e.total - (i > 0 ? entries[i - 1].total : 0)),
  }));
  const max = Math.max(...bars.map((b) => b.gained), 1);

  return (
    <div className="mt-4">
      <p className="text-[10px] text-muted uppercase tracking-wide mb-1.5">Hour by hour</p>
      <div className="flex items-end gap-1 h-14">
        {bars.map((b) => (
          <div key={b.hour} className="flex-1 flex flex-col items-center gap-1 group relative">
            <div
              className="w-full rounded-t bg-gradient-to-t from-[#fa2d6c] to-[#ff8fab] min-h-0.5 transition-all"
              style={{ height: `${Math.max(4, (b.gained / max) * 100)}%` }}
            />
            <span className="text-[9px] text-muted/60">{b.hour}</span>
            <span className="absolute -top-5 opacity-0 group-hover:opacity-100 transition-opacity text-[10px] bg-surface-2 border border-white/10 rounded px-1.5 py-0.5 whitespace-nowrap pointer-events-none">
              +{b.gained.toLocaleString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

type Tracker = {
  id: string;
  name: string;
  emoji: string;
  unit: string | null;
  target_value: number | null;
};

export function TodayPanel({
  userId,
  plan,
  initialCheckin,
  today,
  trackers = [],
  initialTrackerLogs = [],
}: {
  userId: string;
  plan: TransformationPlan;
  initialCheckin: DailyCheckin | null;
  today: string;
  trackers?: Tracker[];
  initialTrackerLogs?: { tracker_id: string; done: boolean }[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const [trackerDone, setTrackerDone] = useState<Record<string, boolean>>(
    Object.fromEntries(initialTrackerLogs.map((l) => [l.tracker_id, l.done]))
  );

  async function toggleTracker(t: Tracker) {
    const next = !trackerDone[t.id];
    setTrackerDone((prev) => ({ ...prev, [t.id]: next }));
    await supabase.from("tracker_logs").upsert(
      { tracker_id: t.id, user_id: userId, log_date: today, done: next, value: next ? 1 : 0 },
      { onConflict: "tracker_id,log_date" }
    );
  }

  const nonNegotiables = plan.daily_non_negotiables ?? [];
  const stepsTarget = plan.steps_target || 20000;
  const waterTarget = plan.nutrition?.water_liters || 3;

  const stepsTaskIndex = nonNegotiables.findIndex((t) => /step/i.test(t));

  const [steps, setSteps] = useState(initialCheckin?.steps ?? 0);
  const [stepsInput, setStepsInput] = useState(String(initialCheckin?.steps || ""));
  const [water, setWater] = useState(Number(initialCheckin?.water_liters ?? 0));
  const [sleep, setSleep] = useState(initialCheckin?.sleep_hours != null ? String(initialCheckin.sleep_hours) : "");
  const [weight, setWeight] = useState(initialCheckin?.weight_kg != null ? String(initialCheckin.weight_kg) : "");
  const [mood, setMood] = useState(initialCheckin?.mood ?? "");
  const [tasks, setTasks] = useState<Record<string, boolean>>(
    (initialCheckin?.tasks as Record<string, boolean>) ?? {}
  );
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isIos, setIsIos] = useState(false);

  useEffect(() => {
    setIsIos(/iPhone|iPad|iPod/i.test(navigator.userAgent));
  }, []);

  // When a phone sync lands and the page refreshes, adopt the fresher server
  // value (unless the user typed a bigger number locally).
  useEffect(() => {
    const serverSteps = initialCheckin?.steps ?? 0;
    if (serverSteps > 0) {
      setSteps((cur) => Math.max(cur, serverSteps));
    }
  }, [initialCheckin?.steps]);

  function runSyncShortcut() {
    const back = encodeURIComponent(window.location.href);
    window.location.href = `shortcuts://x-callback-url/run-shortcut?name=${encodeURIComponent(
      SHORTCUT_NAME
    )}&x-success=${back}`;
  }

  const hourlySteps = initialCheckin?.health?.hourly_steps ?? null;

  function isTaskDone(task: string, i: number): boolean {
    if (i === stepsTaskIndex) return steps >= stepsTarget;
    return !!tasks[task];
  }

  const doneCount = nonNegotiables.filter((t, i) => isTaskDone(t, i)).length;
  const completionPct =
    nonNegotiables.length > 0 ? Math.round((doneCount / nonNegotiables.length) * 100) : 0;

  async function save(overrides?: Partial<{ steps: number; tasks: Record<string, boolean> }>) {
    setSaving(true);
    setError(null);
    const effSteps = overrides?.steps ?? steps;
    const effTasks = overrides?.tasks ?? tasks;
    const effDone = nonNegotiables.filter((t, i) =>
      i === stepsTaskIndex ? effSteps >= stepsTarget : !!effTasks[t]
    ).length;
    const pct = nonNegotiables.length > 0 ? Math.round((effDone / nonNegotiables.length) * 100) : 0;

    try {
      const { error: dbErr } = await supabase.from("daily_checkins").upsert(
        {
          user_id: userId,
          checkin_date: today,
          steps: effSteps,
          workout_done: !!Object.entries(effTasks).find(([k, v]) => v && /gym|workout|train/i.test(k)),
          skincare_am: !!Object.entries(effTasks).find(([k, v]) => v && /skincare.*(am|morning)|morning.*skincare/i.test(k)),
          skincare_pm: !!Object.entries(effTasks).find(([k, v]) => v && /skincare.*(pm|night|evening)|night.*skincare/i.test(k)),
          water_liters: water,
          sleep_hours: sleep ? parseFloat(sleep) : null,
          mood: mood || null,
          weight_kg: weight ? parseFloat(weight) : null,
          tasks: effTasks,
          completion_pct: pct,
        },
        { onConflict: "user_id,checkin_date" }
      );
      if (dbErr) throw new Error(dbErr.message);
      await updateStreak(supabase, userId, pct);
      setSavedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function toggleTask(task: string) {
    const next = { ...tasks, [task]: !tasks[task] };
    setTasks(next);
    save({ tasks: next });
  }

  function commitSteps() {
    const n = Math.max(0, parseInt(stepsInput) || 0);
    setSteps(n);
    save({ steps: n });
  }

  const ring = 2 * Math.PI * 44;

  return (
    <div className="space-y-6">
      {/* Activity hero — Apple Fitness style ring */}
      <div className="glass p-5 md:p-6 fade-up flex items-center gap-5 md:gap-7">
        <div className="relative w-32 h-32 md:w-36 md:h-36 shrink-0">
          <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
            <circle cx="50" cy="50" r="44" fill="none" stroke="rgba(250,45,108,0.15)" strokeWidth="9" />
            <circle
              cx="50"
              cy="50"
              r="44"
              fill="none"
              stroke="url(#grad)"
              strokeWidth="9"
              strokeLinecap="round"
              strokeDasharray={ring}
              strokeDashoffset={ring - (ring * Math.min(100, (steps / stepsTarget) * 100)) / 100}
              className="transition-all duration-700"
              style={{ filter: "drop-shadow(0 0 6px rgba(250,45,108,0.5))" }}
            />
            <defs>
              <linearGradient id="grad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#fa2d6c" />
                <stop offset="100%" stopColor="#ff8fab" />
              </linearGradient>
            </defs>
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <Footprints className="w-4 h-4 text-move mb-0.5" />
            <span className="text-xl md:text-2xl font-extrabold tracking-tight leading-none">
              {Math.round((steps / stepsTarget) * 100)}%
            </span>
            <span className="text-[9px] text-muted uppercase tracking-widest mt-0.5">steps</span>
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <h2 className="text-[11px] font-semibold uppercase tracking-widest text-muted mb-1">
            Move — non-negotiable
          </h2>
          <p className="text-3xl md:text-4xl font-extrabold tracking-tight text-move leading-none">
            {steps.toLocaleString()}
          </p>
          <p className="text-sm text-muted mt-1">/ {stepsTarget.toLocaleString()} steps</p>
          <p className="text-xs mt-1.5">
            <span className={completionPct >= 70 ? "text-success" : "text-muted"}>
              {completionPct}% of today&apos;s routine done
            </span>
          </p>
          <div className="flex gap-2 mt-3">
            <input
              className="input-field !py-2 text-sm min-w-0"
              type="number"
              placeholder="Today's steps..."
              value={stepsInput}
              onChange={(e) => setStepsInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && commitSteps()}
            />
            <button onClick={commitSteps} disabled={saving} className="btn-ghost !py-2 text-sm shrink-0">
              Update
            </button>
            {isIos && (
              <button
                onClick={runSyncShortcut}
                className="btn-primary !py-2 !px-3.5 text-sm shrink-0"
                title={`Runs your "${SHORTCUT_NAME}" Shortcut and comes right back`}
              >
                <RefreshCw className="w-4 h-4" /> Sync
              </button>
            )}
          </div>
          {hourlySteps && Object.keys(hourlySteps).length > 1 && (
            <HourlyBars hourly={hourlySteps} />
          )}
        </div>
      </div>

      {/* Non-negotiables checklist */}
      <div className="glass p-6 fade-up" style={{ animationDelay: "0.05s" }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">Daily non-negotiables</h3>
          <span className="text-sm text-muted">
            {doneCount}/{nonNegotiables.length}
          </span>
        </div>
        <div className="space-y-2">
          {nonNegotiables.map((task, i) => {
            const done = isTaskDone(task, i);
            const isSteps = i === stepsTaskIndex;
            return (
              <button
                key={task}
                onClick={() => !isSteps && toggleTask(task)}
                disabled={isSteps}
                className={`w-full flex items-center gap-3 rounded-xl px-4 py-3.5 text-left transition-all border ${
                  done
                    ? "bg-success/10 border-success/25"
                    : "bg-surface-2 border-white/5 hover:border-white/15"
                } ${isSteps ? "cursor-default" : "cursor-pointer"}`}
              >
                <span
                  className={`w-6 h-6 rounded-full flex items-center justify-center border shrink-0 transition-all ${
                    done ? "bg-success border-success text-black" : "border-white/20"
                  }`}
                >
                  {done && <Check className="w-3.5 h-3.5" strokeWidth={3} />}
                </span>
                <span className={`text-sm ${done ? "line-through text-muted" : ""}`}>{task}</span>
                {isSteps && !done && (
                  <span className="ml-auto text-xs text-muted shrink-0">auto — hit {stepsTarget.toLocaleString()}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Agent-created custom habits */}
        {trackers.length > 0 && (
          <div className="mt-4 pt-3 border-t border-white/5">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted mb-2">
              Your habits
            </p>
            <div className="space-y-2">
              {trackers.map((t) => {
                const done = !!trackerDone[t.id];
                return (
                  <button
                    key={t.id}
                    onClick={() => toggleTracker(t)}
                    className={`w-full flex items-center gap-3 rounded-xl px-4 py-3 text-left transition-all border ${
                      done
                        ? "bg-success/10 border-success/25"
                        : "bg-surface-2 border-white/5 hover:border-white/15"
                    }`}
                  >
                    <span
                      className={`w-6 h-6 rounded-full flex items-center justify-center border shrink-0 transition-all ${
                        done ? "bg-success border-success text-black" : "border-white/20"
                      }`}
                    >
                      {done && <Check className="w-3.5 h-3.5" strokeWidth={3} />}
                    </span>
                    <span className={`text-sm ${done ? "line-through text-muted" : ""}`}>
                      {t.emoji} {t.name}
                      {t.target_value != null && (
                        <span className="text-muted text-xs ml-1.5">
                          {t.target_value}
                          {t.unit ?? ""}
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Metrics — collapsed by default to keep the screen calm */}
      <details className="glass fade-up group" style={{ animationDelay: "0.1s" }}>
        <summary className="list-none cursor-pointer p-5 md:p-6 flex items-center justify-between">
          <h3 className="text-[11px] font-semibold uppercase tracking-widest text-muted">
            Log water · sleep · weight · mood
          </h3>
          <ChevronDown className="w-4 h-4 text-muted transition-transform group-open:rotate-180" />
        </summary>
        <div className="px-5 md:px-6 pb-5 md:pb-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="text-xs text-muted uppercase tracking-wide mb-1.5 flex items-center gap-1">
              <Droplets className="w-3.5 h-3.5" /> Water ({waterTarget}L goal)
            </label>
            <div className="flex items-center gap-2">
              <button onClick={() => setWater((w) => Math.max(0, Math.round((w - 0.5) * 10) / 10))} className="btn-ghost !p-2 !px-3.5 text-sm">
                −
              </button>
              <span className="font-semibold min-w-12 text-center">{water}L</span>
              <button onClick={() => setWater((w) => Math.round((w + 0.5) * 10) / 10)} className="btn-ghost !p-2 !px-3.5 text-sm">
                +
              </button>
            </div>
          </div>
          <div>
            <label className="text-xs text-muted uppercase tracking-wide mb-1.5 flex items-center gap-1">
              <Moon className="w-3.5 h-3.5" /> Sleep (hrs)
            </label>
            <input className="input-field !py-2" type="number" step="0.5" value={sleep} onChange={(e) => setSleep(e.target.value)} placeholder="8" />
          </div>
          <div>
            <label className="text-xs text-muted uppercase tracking-wide mb-1.5 flex items-center gap-1">
              <Scale className="w-3.5 h-3.5" /> Weight (kg)
            </label>
            <input className="input-field !py-2" type="number" step="0.1" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="72.5" />
          </div>
        </div>

        <div className="mt-4">
          <label className="text-xs text-muted uppercase tracking-wide mb-2 block">Mood</label>
          <div className="flex flex-wrap gap-2">
            {MOODS.map((m) => (
              <button key={m} onClick={() => setMood(m)} className={`chip ${mood === m ? "chip-active" : ""}`}>
                {m}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3 mt-5">
          <button onClick={() => save()} disabled={saving} className="btn-primary">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Save check-in
          </button>
          {savedAt && !saving && <span className="text-xs text-success">Saved at {savedAt} ✓</span>}
          {error && <span className="text-xs text-red-400">{error}</span>}
        </div>
        </div>
      </details>
    </div>
  );
}
