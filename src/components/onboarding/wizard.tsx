"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Activity } from "@/lib/types";
import { AiInterview } from "./ai-interview";
import {
  ChevronRight,
  ChevronLeft,
  Upload,
  Check,
  User,
  Target,
  Bike,
  Moon,
  Camera,
  MessageSquareText,
} from "lucide-react";

const STEPS = [
  { key: "basics", label: "Basics", icon: User },
  { key: "goal", label: "Goal", icon: Target },
  { key: "activities", label: "Activities", icon: Bike },
  { key: "lifestyle", label: "Lifestyle", icon: Moon },
  { key: "photos", label: "Photos", icon: Camera },
  { key: "interview", label: "AI Coach", icon: MessageSquareText },
] as const;

const ACTIVITY_OPTIONS = [
  "Swimming",
  "Running",
  "Cycling",
  "Boxing",
  "Yoga",
  "Dance",
  "Football",
  "Basketball",
  "Badminton",
  "Trekking",
  "Skipping",
  "Martial arts",
];

const PROFICIENCY = ["Complete beginner", "Know the basics", "Intermediate", "Advanced"];

export type WizardData = {
  full_name: string;
  age: string;
  gender: string;
  height_cm: string;
  weight_kg: string;
  target_weight_kg: string;
  body_goal: string;
  inspiration: string;
  gym_days_per_week: string;
  activities: Activity[];
  wake_time: string;
  sleep_time: string;
  diet_preference: string;
  occupation_schedule: string;
  skin_type: string;
  skin_concerns: string;
};

export function OnboardingWizard({
  userId,
  initialName,
}: {
  userId: string;
  initialName: string;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [facePhoto, setFacePhoto] = useState<File | null>(null);
  const [bodyPhoto, setBodyPhoto] = useState<File | null>(null);

  const [data, setData] = useState<WizardData>({
    full_name: initialName,
    age: "",
    gender: "",
    height_cm: "",
    weight_kg: "",
    target_weight_kg: "",
    body_goal: "",
    inspiration: "",
    gym_days_per_week: "5",
    activities: [],
    wake_time: "06:30",
    sleep_time: "22:30",
    diet_preference: "",
    occupation_schedule: "",
    skin_type: "",
    skin_concerns: "",
  });

  function set<K extends keyof WizardData>(key: K, value: WizardData[K]) {
    setData((d) => ({ ...d, [key]: value }));
  }

  function toggleActivity(name: string) {
    setData((d) => {
      const exists = d.activities.find((a) => a.name === name);
      return {
        ...d,
        activities: exists
          ? d.activities.filter((a) => a.name !== name)
          : [...d.activities, { name, proficiency: "Know the basics" }],
      };
    });
  }

  function setProficiency(name: string, proficiency: string) {
    setData((d) => ({
      ...d,
      activities: d.activities.map((a) => (a.name === name ? { ...a, proficiency } : a)),
    }));
  }

  const canNext = (() => {
    if (step === 0) return data.full_name && data.age && data.height_cm && data.weight_kg && data.gender;
    if (step === 1) return data.body_goal.length > 3;
    return true;
  })();

  async function uploadPhoto(file: File, type: "face" | "front") {
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${userId}/${Date.now()}-${type}.${ext}`;
    const { error: upErr } = await supabase.storage.from("photos").upload(path, file);
    if (upErr) throw new Error(`Photo upload failed: ${upErr.message}`);
    await supabase.from("progress_photos").insert({
      user_id: userId,
      storage_path: path,
      photo_type: type,
    });
  }

  async function saveProfileAndContinue() {
    setSaving(true);
    setError(null);
    try {
      if (facePhoto) await uploadPhoto(facePhoto, "face");
      if (bodyPhoto) await uploadPhoto(bodyPhoto, "front");

      const { error: dbErr } = await supabase
        .from("profiles")
        .update({
          full_name: data.full_name,
          age: parseInt(data.age) || null,
          gender: data.gender || null,
          height_cm: parseFloat(data.height_cm) || null,
          weight_kg: parseFloat(data.weight_kg) || null,
          target_weight_kg: parseFloat(data.target_weight_kg) || null,
          body_goal: data.body_goal || null,
          inspiration: data.inspiration || null,
          gym_days_per_week: parseInt(data.gym_days_per_week) || null,
          activities: data.activities,
          wake_time: data.wake_time || null,
          sleep_time: data.sleep_time || null,
          diet_preference: data.diet_preference || null,
          occupation_schedule: data.occupation_schedule || null,
          skin_type: data.skin_type || null,
          skin_concerns: data.skin_concerns || null,
        })
        .eq("id", userId);
      if (dbErr) throw new Error(dbErr.message);
      setStep(5);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="w-full max-w-2xl">
      {/* Mobile: Tonal-style thin progress bar */}
      <div className="md:hidden mb-8">
        <div className="flex items-center justify-between mb-2 px-0.5">
          <span className="text-[11px] font-semibold uppercase tracking-widest text-muted">
            {STEPS[step].label}
          </span>
          <span className="text-[11px] text-muted/60">
            {step + 1} / {STEPS.length}
          </span>
        </div>
        <div className="h-1 rounded-full bg-white/10 overflow-hidden">
          <div
            className="h-full rounded-full bg-foreground transition-all duration-500"
            style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Desktop: icon stepper */}
      <div className="hidden md:flex items-center justify-between mb-10 px-2">
        {STEPS.map((s, i) => (
          <div key={s.key} className="flex flex-col items-center gap-1.5 flex-1">
            <div
              className={`w-9 h-9 rounded-full flex items-center justify-center border transition-all ${
                i < step
                  ? "bg-accent/20 border-accent/60 text-accent"
                  : i === step
                    ? "bg-accent border-accent text-white shadow-[0_0_20px_-4px_rgba(139,92,246,0.7)]"
                    : "border-white/10 text-muted/50"
              }`}
            >
              {i < step ? <Check className="w-4 h-4" /> : <s.icon className="w-4 h-4" />}
            </div>
            <span className={`text-[10px] uppercase tracking-wide ${i === step ? "text-foreground" : "text-muted/50"}`}>
              {s.label}
            </span>
          </div>
        ))}
      </div>

      <div className="glass p-5 md:p-8 fade-up" key={step}>
        {step === 0 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight mb-1.5">Let&apos;s get the basics</h2>
              <p className="text-muted text-sm">Your coach needs your starting point.</p>
            </div>
            <div>
              <label className="text-sm text-muted mb-1.5 block">Your name</label>
              <input className="input-field" value={data.full_name} onChange={(e) => set("full_name", e.target.value)} placeholder="Sunny" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-muted mb-1.5 block">Age</label>
                <input className="input-field" type="number" value={data.age} onChange={(e) => set("age", e.target.value)} placeholder="22" />
              </div>
              <div>
                <label className="text-sm text-muted mb-1.5 block">Gender</label>
                <div className="flex gap-2">
                  {["Male", "Female", "Other"].map((g) => (
                    <button key={g} type="button" onClick={() => set("gender", g)} className={`chip ${data.gender === g ? "chip-active" : ""}`}>
                      {g}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="text-sm text-muted mb-1.5 block">Height (cm)</label>
                <input className="input-field" type="number" value={data.height_cm} onChange={(e) => set("height_cm", e.target.value)} placeholder="175" />
              </div>
              <div>
                <label className="text-sm text-muted mb-1.5 block">Weight (kg)</label>
                <input className="input-field" type="number" value={data.weight_kg} onChange={(e) => set("weight_kg", e.target.value)} placeholder="72" />
              </div>
              <div>
                <label className="text-sm text-muted mb-1.5 block">Target (kg)</label>
                <input className="input-field" type="number" value={data.target_weight_kg} onChange={(e) => set("target_weight_kg", e.target.value)} placeholder="78" />
              </div>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight mb-1.5">Your dream physique</h2>
              <p className="text-muted text-sm">
                Doesn&apos;t matter where you start — overweight, underweight, skinny-fat. Describe where you&apos;re going.
              </p>
            </div>
            <div>
              <label className="text-sm text-muted mb-1.5 block">Describe the body & face you want</label>
              <textarea
                className="input-field min-h-28 resize-y"
                value={data.body_goal}
                onChange={(e) => set("body_goal", e.target.value)}
                placeholder="Lean, sharp jawline, visible abs, broad shoulders — model-ready for a portfolio shoot..."
              />
            </div>
            <div>
              <label className="text-sm text-muted mb-1.5 block">
                Who inspires you? (actor, athlete, model — anyone)
              </label>
              <input
                className="input-field"
                value={data.inspiration}
                onChange={(e) => set("inspiration", e.target.value)}
                placeholder="Hrithik Roshan"
              />
            </div>
            <div>
              <label className="text-sm text-muted mb-1.5 block">Gym days per week</label>
              <div className="flex gap-2 flex-wrap">
                {["3", "4", "5", "6"].map((n) => (
                  <button key={n} type="button" onClick={() => set("gym_days_per_week", n)} className={`chip ${data.gym_days_per_week === n ? "chip-active" : ""}`}>
                    {n} days
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight mb-1.5">What do you enjoy?</h2>
              <p className="text-muted text-sm">
                Pick activities you love (or want to learn). Your plan will include them — consistency is easier when it&apos;s fun.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {ACTIVITY_OPTIONS.map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => toggleActivity(a)}
                  className={`chip ${data.activities.find((x) => x.name === a) ? "chip-active" : ""}`}
                >
                  {a}
                </button>
              ))}
            </div>
            {data.activities.length > 0 && (
              <div className="space-y-3 pt-2">
                <p className="text-sm text-muted">How good are you at each?</p>
                {data.activities.map((a) => (
                  <div key={a.name} className="flex items-center justify-between gap-3 bg-surface-2 rounded-xl px-4 py-3">
                    <span className="font-medium text-sm">{a.name}</span>
                    <select
                      className="input-field !w-auto !py-1.5 text-sm"
                      value={a.proficiency}
                      onChange={(e) => setProficiency(a.name, e.target.value)}
                    >
                      {PROFICIENCY.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight mb-1.5">Your lifestyle</h2>
              <p className="text-muted text-sm">The plan has to survive contact with your real life.</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-muted mb-1.5 block">Wake up</label>
                <input className="input-field" type="time" value={data.wake_time} onChange={(e) => set("wake_time", e.target.value)} />
              </div>
              <div>
                <label className="text-sm text-muted mb-1.5 block">Sleep</label>
                <input className="input-field" type="time" value={data.sleep_time} onChange={(e) => set("sleep_time", e.target.value)} />
              </div>
            </div>
            <div>
              <label className="text-sm text-muted mb-1.5 block">Diet preference</label>
              <div className="flex gap-2 flex-wrap">
                {["Vegetarian", "Eggetarian", "Non-veg", "Vegan"].map((d) => (
                  <button key={d} type="button" onClick={() => set("diet_preference", d)} className={`chip ${data.diet_preference === d ? "chip-active" : ""}`}>
                    {d}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-sm text-muted mb-1.5 block">Work / study schedule</label>
              <input
                className="input-field"
                value={data.occupation_schedule}
                onChange={(e) => set("occupation_schedule", e.target.value)}
                placeholder="College 9-4, free evenings / Remote job, flexible..."
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-muted mb-1.5 block">Skin type</label>
                <select className="input-field" value={data.skin_type} onChange={(e) => set("skin_type", e.target.value)}>
                  <option value="">Not sure</option>
                  <option>Oily</option>
                  <option>Dry</option>
                  <option>Combination</option>
                  <option>Normal</option>
                  <option>Sensitive</option>
                </select>
              </div>
              <div>
                <label className="text-sm text-muted mb-1.5 block">Skin concerns</label>
                <input className="input-field" value={data.skin_concerns} onChange={(e) => set("skin_concerns", e.target.value)} placeholder="Acne, dark circles, tanning..." />
              </div>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight mb-1.5">Starting photos</h2>
              <p className="text-muted text-sm">
                Private — only you can see them. Day 1 photos are what future-you will thank you for.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <PhotoDrop label="Face photo" file={facePhoto} onFile={setFacePhoto} />
              <PhotoDrop label="Body photo" file={bodyPhoto} onFile={setBodyPhoto} />
            </div>
            <p className="text-xs text-muted/60">You can skip this and add photos later from the Progress page.</p>
          </div>
        )}

        {step === 5 && <AiInterview userId={userId} profile={data} />}

        {error && <p className="text-sm text-red-400 mt-4">{error}</p>}

        {step < 5 && (
          <div className="flex justify-between mt-8">
            <button type="button" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0} className="btn-ghost">
              <ChevronLeft className="w-4 h-4" /> Back
            </button>
            {step < 4 ? (
              <button type="button" onClick={() => setStep((s) => s + 1)} disabled={!canNext} className="btn-primary">
                Next <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button type="button" onClick={saveProfileAndContinue} disabled={saving} className="btn-ai">
                {saving ? "Saving..." : "Meet your AI coach"} <ChevronRight className="w-4 h-4" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function PhotoDrop({
  label,
  file,
  onFile,
}: {
  label: string;
  file: File | null;
  onFile: (f: File | null) => void;
}) {
  return (
    <label className="glass glass-hover cursor-pointer flex flex-col items-center justify-center gap-2 py-10 text-center">
      <Upload className="w-6 h-6 text-accent" />
      <span className="text-sm font-medium">{file ? file.name : label}</span>
      <span className="text-xs text-muted">{file ? "Tap to change" : "Tap to upload"}</span>
      <input
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => onFile(e.target.files?.[0] ?? null)}
      />
    </label>
  );
}
