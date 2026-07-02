"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { updateStreak } from "@/lib/streak";
import type { DailyCheckin, TransformationPlan } from "@/lib/types";
import { Footprints, Check, Droplets, Moon, Scale, Loader2, RefreshCw } from "lucide-react";

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
              className="w-full rounded-t bg-gradient-to-t from-violet-500 to-fuchsia-400 min-h-0.5 transition-all"
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

export function TodayPanel({
  userId,
  plan,
  initialCheckin,
  today,
}: {
  userId: string;
  plan: TransformationPlan;
  initialCheckin: DailyCheckin | null;
  today: string;
}) {
  const supabase = useMemo(() => createClient(), []);

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
      {/* Completion + steps hero */}
      <div className="glass p-5 md:p-6 fade-up flex items-center gap-4 md:gap-6">
        <div className="relative w-24 h-24 md:w-28 md:h-28 shrink-0">
          <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
            <circle cx="50" cy="50" r="44" fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="8" />
            <circle
              cx="50"
              cy="50"
              r="44"
              fill="none"
              stroke="url(#grad)"
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={ring}
              strokeDashoffset={ring - (ring * completionPct) / 100}
              className="transition-all duration-700"
            />
            <defs>
              <linearGradient id="grad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#8b5cf6" />
                <stop offset="100%" stopColor="#ec4899" />
              </linearGradient>
            </defs>
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-bold">{completionPct}%</span>
            <span className="text-[10px] text-muted uppercase tracking-wide">today</span>
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Footprints className="w-5 h-5 text-accent shrink-0" />
            <h2 className="font-semibold text-sm md:text-base">Steps — the non-negotiable</h2>
          </div>
          <p className="text-2xl md:text-3xl font-bold">
            {steps.toLocaleString()}{" "}
            <span className="text-base font-normal text-muted">/ {stepsTarget.toLocaleString()}</span>
          </p>
          <div className="h-2 rounded-full bg-white/5 mt-2 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 transition-all duration-700"
              style={{ width: `${Math.min(100, (steps / stepsTarget) * 100)}%` }}
            />
          </div>
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
      </div>

      {/* Metrics */}
      <div className="glass p-6 fade-up" style={{ animationDelay: "0.1s" }}>
        <h3 className="font-semibold mb-4">Log today</h3>
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
    </div>
  );
}
