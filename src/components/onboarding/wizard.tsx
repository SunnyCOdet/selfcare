"use client";

/**
 * Lovi-style onboarding (one question per screen, mascot speech bubbles,
 * big option cards, auto-advance) rebuilt on shadcn/ui for an all-in-one
 * life transformation app, not just fitness.
 */

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Activity } from "@/lib/types";
import { AiInterview } from "./ai-interview";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Label } from "@/components/ui/label";
import { ChevronLeft, Check, Upload, Sparkles } from "lucide-react";

export type WizardData = {
  full_name: string;
  age: string;
  gender: string;
  height_cm: string;
  weight_kg: string;
  target_weight_kg: string;
  goal_areas: string[];
  body_goal: string;
  inspiration: string;
  gym_days_per_week: string;
  activities: Activity[];
  protein_sources: string[];
  carb_sources: string[];
  avoid_foods: string[];
  avoid_foods_note: string;
  cooking: string;
  eating_out: string;
  diet_preference: string;
  wake_time: string;
  sleep_time: string;
  occupation_schedule: string;
  skin_type: string;
  skin_concerns: string;
};

const GOAL_AREAS = [
  { key: "Body & fitness", emoji: "01", desc: "Physique, strength, 20k steps" },
  { key: "Income & career", emoji: "02", desc: "Earn more, build the thing" },
  { key: "Skills & learning", emoji: "03", desc: "Master new abilities" },
  { key: "Style & grooming", emoji: "04", desc: "Skin, hair, presence" },
  { key: "Discipline & mind", emoji: "05", desc: "Routine, focus, sleep" },
];

const ACTIVITIES = ["Swimming", "Running", "Cycling", "Boxing", "Yoga", "Dance", "Football", "Basketball", "Badminton", "Trekking", "Skipping", "Martial arts"];
const PROFICIENCY = ["Complete beginner", "Know the basics", "Intermediate", "Advanced"];

const PROTEINS = [
  { key: "Eggs", emoji: "EG" },
  { key: "Chicken", emoji: "CH" },
  { key: "Fish", emoji: "FS" },
  { key: "Paneer", emoji: "PN" },
  { key: "Dal & legumes", emoji: "DL" },
  { key: "Whey protein", emoji: "WH" },
  { key: "Soya / tofu", emoji: "TF" },
  { key: "Curd / yogurt", emoji: "YG" },
  { key: "Red meat", emoji: "RM" },
];

const CARBS = [
  { key: "Rice", emoji: "RI" },
  { key: "Roti / chapati", emoji: "RO" },
  { key: "Oats", emoji: "OA" },
  { key: "Potato / sweet potato", emoji: "PT" },
  { key: "Bread", emoji: "BR" },
  { key: "Poha / upma", emoji: "PU" },
  { key: "Fruits", emoji: "FR" },
  { key: "Millets", emoji: "MI" },
  { key: "Pasta / noodles", emoji: "PA" },
];

const AVOIDS = ["No beef", "No pork", "No seafood", "No dairy", "No gluten", "Jain food only", "Nothing - I eat everything"];

const COOKING = [
  { key: "I cook myself", emoji: "CK", desc: "Full control of the kitchen" },
  { key: "Family cooks", emoji: "HM", desc: "I eat what's made at home" },
  { key: "Mess / tiffin", emoji: "TF", desc: "Fixed menu, limited choice" },
  { key: "Mostly order in", emoji: "OD", desc: "Swiggy/Zomato life" },
];

const EATING_OUT = ["Rarely (0-1x/week)", "Sometimes (2-3x/week)", "Often (4-6x/week)", "Almost daily"];

const DIETS = [
  { key: "Non-veg", emoji: "NV", desc: "Everything on the table" },
  { key: "Eggetarian", emoji: "EG", desc: "Veg + eggs" },
  { key: "Vegetarian", emoji: "VG", desc: "No meat, no eggs" },
  { key: "Vegan", emoji: "VN", desc: "No animal products" },
];

const SKIN_TYPES = [
  { key: "Oily", emoji: "OL", desc: "Shiny by midday" },
  { key: "Dry", emoji: "DR", desc: "Tight, flaky patches" },
  { key: "Combination", emoji: "CB", desc: "Oily T-zone, dry cheeks" },
  { key: "Normal", emoji: "NR", desc: "Rarely complains" },
  { key: "Not sure", emoji: "NS", desc: "Jarvis will figure it out" },
];

/** Jarvis mark used in the interview header. */
function Orb({ size = "md" }: { size?: "md" | "lg" }) {
  return (
    <div
      className={`${size === "lg" ? "w-20 h-20" : "w-11 h-11"} flex shrink-0 items-center justify-center rounded-md bg-accent text-background shadow-[0_18px_42px_-30px_rgba(200,255,61,0.9)]`}
    >
      <Sparkles className={size === "lg" ? "w-9 h-9" : "w-5 h-5"} />
    </div>
  );
}

/** Speech-bubble question header (Lovi pattern). */
function Bubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 mb-6 fade-up">
      <Orb />
      <div className="rounded-lg border border-border bg-surface-2 px-4 py-3">
        <p className="text-lg font-bold leading-snug">{children}</p>
      </div>
    </div>
  );
}

/** Big option card (Lovi pattern). */
function OptionCard({
  emoji,
  title,
  desc,
  selected,
  onSelect,
}: {
  emoji: string;
  title: string;
  desc?: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full flex items-center gap-4 rounded-lg border px-5 py-4 text-left transition-all active:scale-[0.98] ${
        selected
          ? "border-accent/60 bg-accent/10 shadow-[0_18px_42px_-34px_rgba(200,255,61,0.8)]"
          : "border-border bg-surface-2 hover:border-white/20"
      }`}
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-white/[0.045] text-xs font-black text-muted-foreground">
        {emoji}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block font-semibold">{title}</span>
        {desc && <span className="block text-sm text-muted-foreground mt-0.5">{desc}</span>}
      </span>
      <span
        className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
          selected ? "bg-accent border-accent" : "border-white/20"
        }`}
      >
        {selected && <Check className="w-3.5 h-3.5 text-white" strokeWidth={3.5} />}
      </span>
    </button>
  );
}

export function OnboardingWizard({ userId, initialName }: { userId: string; initialName: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [facePhoto, setFacePhoto] = useState<File | null>(null);
  const [bodyPhoto, setBodyPhoto] = useState<File | null>(null);

  const [d, setD] = useState<WizardData>({
    full_name: initialName,
    age: "",
    gender: "",
    height_cm: "",
    weight_kg: "",
    target_weight_kg: "",
    goal_areas: [],
    body_goal: "",
    inspiration: "",
    gym_days_per_week: "5",
    activities: [],
    protein_sources: [],
    carb_sources: [],
    avoid_foods: [],
    avoid_foods_note: "",
    cooking: "",
    eating_out: "",
    diet_preference: "",
    wake_time: "06:30",
    sleep_time: "22:30",
    occupation_schedule: "",
    skin_type: "",
    skin_concerns: "",
  });

  function set<K extends keyof WizardData>(key: K, value: WizardData[K]) {
    setD((prev) => ({ ...prev, [key]: value }));
  }
  function toggle(key: "goal_areas" | "protein_sources" | "carb_sources" | "avoid_foods", value: string) {
    setD((prev) => {
      const list = prev[key];
      const nothing = value.startsWith("Nothing");
      let next: string[];
      if (nothing) next = list.includes(value) ? [] : [value];
      else next = list.includes(value) ? list.filter((x) => x !== value) : [...list.filter((x) => !x.startsWith("Nothing")), value];
      return { ...prev, [key]: next };
    });
  }
  function toggleActivity(name: string) {
    setD((prev) => {
      const exists = prev.activities.find((a) => a.name === name);
      return {
        ...prev,
        activities: exists
          ? prev.activities.filter((a) => a.name !== name)
          : [...prev.activities, { name, proficiency: "Know the basics" }],
      };
    });
  }

  const TOTAL = 17;
  const next = () => setStep((s) => Math.min(TOTAL - 1, s + 1));
  const back = () => setStep((s) => Math.max(0, s - 1));
  const pick = <K extends keyof WizardData>(key: K, value: WizardData[K]) => {
    set(key, value);
    setTimeout(next, 250);
  };

  async function uploadPhoto(file: File, type: "face" | "front") {
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${userId}/${Date.now()}-${type}.${ext}`;
    const { error: upErr } = await supabase.storage.from("photos").upload(path, file);
    if (upErr) throw new Error(`Photo upload failed: ${upErr.message}`);
    await supabase.from("progress_photos").insert({ user_id: userId, storage_path: path, photo_type: type });
  }

  async function saveAndContinue() {
    setSaving(true);
    setError(null);
    try {
      if (facePhoto) await uploadPhoto(facePhoto, "face");
      if (bodyPhoto) await uploadPhoto(bodyPhoto, "front");
      const { error: dbErr } = await supabase
        .from("profiles")
        .update({
          full_name: d.full_name,
          age: parseInt(d.age) || null,
          gender: d.gender || null,
          height_cm: parseFloat(d.height_cm) || null,
          weight_kg: parseFloat(d.weight_kg) || null,
          target_weight_kg: parseFloat(d.target_weight_kg) || null,
          body_goal: d.body_goal || null,
          inspiration: d.inspiration || null,
          gym_days_per_week: parseInt(d.gym_days_per_week) || null,
          activities: d.activities,
          diet_preference: d.diet_preference || null,
          wake_time: d.wake_time || null,
          sleep_time: d.sleep_time || null,
          occupation_schedule: d.occupation_schedule || null,
          skin_type: d.skin_type || null,
          skin_concerns: d.skin_concerns || null,
          extra: {
            goal_areas: d.goal_areas,
            protein_sources: d.protein_sources,
            carb_sources: d.carb_sources,
            avoid_foods: [...d.avoid_foods, d.avoid_foods_note].filter(Boolean),
            cooking: d.cooking,
            eating_out: d.eating_out,
          },
        })
        .eq("id", userId);
      if (dbErr) throw new Error(dbErr.message);
      next(); // -> interview
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  const canNext = (() => {
    switch (step) {
      case 1: return d.full_name.trim().length > 0;
      case 2: return !!(d.age && d.height_cm && d.weight_kg && d.gender);
      case 3: return d.goal_areas.length > 0;
      case 4: return d.body_goal.trim().length > 3;
      case 7: return d.protein_sources.length > 0;
      case 8: return d.carb_sources.length > 0;
      default: return true;
    }
  })();

  return (
    <div className="w-full max-w-xl mx-auto flex flex-col min-h-[calc(100dvh-5rem)]">
      {/* Top bar: back + progress (Lovi) */}
      {step > 0 && step < TOTAL - 1 && (
        <div className="flex items-center gap-3 mb-8">
          <Button variant="ghost" size="icon-sm" onClick={back} aria-label="Back">
            <ChevronLeft className="size-5" />
          </Button>
          <Progress value={(step / (TOTAL - 1)) * 100} className="flex-1" />
          <span className="text-xs text-muted-foreground tabular-nums">{step}/{TOTAL - 1}</span>
        </div>
      )}

      <div className="flex-1 fade-up" key={step}>
        {step === 0 && (
          <div className="flex flex-col items-center justify-center text-center h-full min-h-[60vh]">
            <Orb size="lg" />
            <h1 className="text-3xl font-extrabold tracking-tight mt-8">
              Hi, I&apos;m <span className="gradient-text">Jarvis</span>.
            </h1>
            <p className="text-muted-foreground mt-3 max-w-sm">
              Body, money, skills, discipline - one plan, engineered around your real life. A few questions and I&apos;ll build yours.
            </p>
            <Button size="lg" className="mt-10 w-full max-w-xs" onClick={next}>
              Let&apos;s go
            </Button>
            <p className="text-[11px] text-muted-foreground/60 mt-6 max-w-xs">
              Personalized plans beat generic ones on adherence - that&apos;s the whole game.
            </p>
          </div>
        )}

        {step === 1 && (
          <>
            <Bubble>What should I call you?</Bubble>
            <Input
              autoFocus
              value={d.full_name}
              onChange={(e) => set("full_name", e.target.value)}
              placeholder="Your name"
              onKeyDown={(e) => e.key === "Enter" && canNext && next()}
            />
          </>
        )}

        {step === 2 && (
          <>
            <Bubble>The numbers I&apos;m working with{d.full_name ? `, ${d.full_name.split(" ")[0]}` : ""}?</Bubble>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Age</Label>
                  <Input type="number" value={d.age} onChange={(e) => set("age", e.target.value)} placeholder="22" />
                </div>
                <div className="space-y-1.5">
                  <Label>Gender</Label>
                  <div className="flex gap-2">
                    {["Male", "Female", "Other"].map((g) => (
                      <button
                        key={g}
                        type="button"
                        onClick={() => set("gender", g)}
                        className={`flex-1 h-12 rounded-md border text-sm font-medium transition-all active:scale-95 ${
                          d.gender === g ? "border-accent/60 bg-accent/10 text-accent" : "border-border bg-surface-2 text-muted-foreground"
                        }`}
                      >
                        {g}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label>Height cm</Label>
                  <Input type="number" value={d.height_cm} onChange={(e) => set("height_cm", e.target.value)} placeholder="175" />
                </div>
                <div className="space-y-1.5">
                  <Label>Weight kg</Label>
                  <Input type="number" value={d.weight_kg} onChange={(e) => set("weight_kg", e.target.value)} placeholder="72" />
                </div>
                <div className="space-y-1.5">
                  <Label>Target kg</Label>
                  <Input type="number" value={d.target_weight_kg} onChange={(e) => set("target_weight_kg", e.target.value)} placeholder="78" />
                </div>
              </div>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <Bubble>What are we transforming? Pick everything that matters.</Bubble>
            <div className="space-y-3">
              {GOAL_AREAS.map((g) => (
                <OptionCard
                  key={g.key}
                  emoji={g.emoji}
                  title={g.key}
                  desc={g.desc}
                  selected={d.goal_areas.includes(g.key)}
                  onSelect={() => toggle("goal_areas", g.key)}
                />
              ))}
            </div>
          </>
        )}

        {step === 4 && (
          <>
            <Bubble>Describe the body &amp; presence you want. Dream big.</Bubble>
            <div className="space-y-4">
              <Textarea
                value={d.body_goal}
                onChange={(e) => set("body_goal", e.target.value)}
                placeholder="Lean, sharp jawline, visible abs, broad shoulders - model-ready..."
                className="min-h-28"
              />
              <div className="space-y-1.5">
                <Label>Who inspires you? (actor, athlete, anyone)</Label>
                <Input value={d.inspiration} onChange={(e) => set("inspiration", e.target.value)} placeholder="Hrithik Roshan" />
              </div>
            </div>
          </>
        )}

        {step === 5 && (
          <>
            <Bubble>How many gym days can you actually commit to?</Bubble>
            <div className="grid grid-cols-2 gap-3">
              {["3", "4", "5", "6"].map((n) => (
                <OptionCard
                  key={n}
                  emoji="GY"
                  title={`${n} days / week`}
                  selected={d.gym_days_per_week === n}
                  onSelect={() => pick("gym_days_per_week", n)}
                />
              ))}
            </div>
          </>
        )}

        {step === 6 && (
          <>
            <Bubble>What do you enjoy? Consistency is easier when it&apos;s fun.</Bubble>
            <div className="space-y-2.5">
              {ACTIVITIES.map((a) => {
                const sel = d.activities.find((x) => x.name === a);
                return (
                  <div key={a}>
                    <OptionCard emoji="AC" title={a} selected={!!sel} onSelect={() => toggleActivity(a)} />
                    {sel && (
                      <div className="flex gap-2 mt-2 mb-1 pl-2 flex-wrap">
                        {PROFICIENCY.map((p) => (
                          <button
                            key={p}
                            type="button"
                            onClick={() =>
                              set(
                                "activities",
                                d.activities.map((x) => (x.name === a ? { ...x, proficiency: p } : x))
                              )
                            }
                            className={`text-xs rounded-full border px-3 py-1.5 transition-all ${
                              sel.proficiency === p ? "border-accent/60 bg-accent/10 text-accent" : "border-white/10 text-muted-foreground"
                            }`}
                          >
                            {p}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {step === 7 && (
          <>
            <Bubble>Which protein sources can you eat? Your meals get built from these.</Bubble>
            <div className="grid grid-cols-2 gap-3">
              {PROTEINS.map((p) => (
                <OptionCard
                  key={p.key}
                  emoji={p.emoji}
                  title={p.key}
                  selected={d.protein_sources.includes(p.key)}
                  onSelect={() => toggle("protein_sources", p.key)}
                />
              ))}
            </div>
          </>
        )}

        {step === 8 && (
          <>
            <Bubble>And your carb sources?</Bubble>
            <div className="grid grid-cols-2 gap-3">
              {CARBS.map((c) => (
                <OptionCard
                  key={c.key}
                  emoji={c.emoji}
                  title={c.key}
                  selected={d.carb_sources.includes(c.key)}
                  onSelect={() => toggle("carb_sources", c.key)}
                />
              ))}
            </div>
          </>
        )}

        {step === 9 && (
          <>
            <Bubble>Anything you avoid or can&apos;t stand?</Bubble>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                {AVOIDS.map((a) => (
                  <OptionCard
                    key={a}
                    emoji={a.startsWith("Nothing") ? "OK" : "NO"}
                    title={a}
                    selected={d.avoid_foods.includes(a)}
                    onSelect={() => toggle("avoid_foods", a)}
                  />
                ))}
              </div>
              <Input
                value={d.avoid_foods_note}
                onChange={(e) => set("avoid_foods_note", e.target.value)}
                placeholder="Anything else? e.g. hate mushrooms, allergic to peanuts..."
              />
            </div>
          </>
        )}

        {step === 10 && (
          <>
            <Bubble>Who makes your food? Be honest - the plan has to survive reality.</Bubble>
            <div className="space-y-3">
              {COOKING.map((c) => (
                <OptionCard
                  key={c.key}
                  emoji={c.emoji}
                  title={c.key}
                  desc={c.desc}
                  selected={d.cooking === c.key}
                  onSelect={() => pick("cooking", c.key)}
                />
              ))}
            </div>
          </>
        )}

        {step === 11 && (
          <>
            <Bubble>How often do you eat out or order in?</Bubble>
            <div className="space-y-3">
              {EATING_OUT.map((e) => (
                <OptionCard
                  key={e}
                  emoji="EO"
                  title={e}
                  selected={d.eating_out === e}
                  onSelect={() => pick("eating_out", e)}
                />
              ))}
            </div>
          </>
        )}

        {step === 12 && (
          <>
            <Bubble>Diet style?</Bubble>
            <div className="space-y-3">
              {DIETS.map((diet) => (
                <OptionCard
                  key={diet.key}
                  emoji={diet.emoji}
                  title={diet.key}
                  desc={diet.desc}
                  selected={d.diet_preference === diet.key}
                  onSelect={() => pick("diet_preference", diet.key)}
                />
              ))}
            </div>
          </>
        )}

        {step === 13 && (
          <>
            <Bubble>Your day&apos;s shape - when do you wake, sleep, and work?</Bubble>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Wake up</Label>
                  <Input type="time" value={d.wake_time} onChange={(e) => set("wake_time", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Sleep</Label>
                  <Input type="time" value={d.sleep_time} onChange={(e) => set("sleep_time", e.target.value)} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Work / study schedule</Label>
                <Input
                  value={d.occupation_schedule}
                  onChange={(e) => set("occupation_schedule", e.target.value)}
                  placeholder="College 9-4, evenings free / remote job, flexible..."
                />
              </div>
            </div>
          </>
        )}

        {step === 14 && (
          <>
            <Bubble>Your skin - what am I working with?</Bubble>
            <div className="space-y-3">
              {SKIN_TYPES.map((s) => (
                <OptionCard
                  key={s.key}
                  emoji={s.emoji}
                  title={s.key}
                  desc={s.desc}
                  selected={d.skin_type === s.key}
                  onSelect={() => set("skin_type", s.key)}
                />
              ))}
              <Input
                value={d.skin_concerns}
                onChange={(e) => set("skin_concerns", e.target.value)}
                placeholder="Concerns? Acne, dark circles, tanning..."
              />
            </div>
          </>
        )}

        {step === 15 && (
          <>
            <Bubble>Day-1 photos. Private - future you will thank you.</Bubble>
            <div className="grid grid-cols-2 gap-3">
              <PhotoDrop label="Face" file={facePhoto} onFile={setFacePhoto} />
              <PhotoDrop label="Body" file={bodyPhoto} onFile={setBodyPhoto} />
            </div>
            <p className="text-xs text-muted-foreground/60 mt-3">Skippable - you can add them later from Progress.</p>
          </>
        )}

        {step === 16 && <AiInterview userId={userId} profile={d} />}
      </div>

      {/* Bottom CTA (Lovi pill, pinned) */}
      {step > 0 && step < 16 && (
        <div className="sticky bottom-0 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))] bg-gradient-to-t from-background via-background/90 to-transparent">
          {error && <p className="text-sm text-red-400 mb-2">{error}</p>}
          {step === 15 ? (
            <Button size="lg" className="w-full" variant="ai" disabled={saving} onClick={saveAndContinue}>
              {saving ? "Saving..." : "Meet Jarvis"} <Sparkles className="size-4" />
            </Button>
          ) : (
            <Button size="lg" className="w-full" disabled={!canNext} onClick={next}>
              Continue
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function PhotoDrop({ label, file, onFile }: { label: string; file: File | null; onFile: (f: File | null) => void }) {
  return (
    <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-surface-2 py-10 text-center transition-colors hover:border-accent/40 active:scale-[0.98]">
      <Upload className="w-6 h-6 text-accent" />
      <span className="text-sm font-medium">{file ? file.name.slice(0, 18) : label}</span>
      <span className="text-xs text-muted-foreground">{file ? "Tap to change" : "Tap to upload"}</span>
      <input type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
    </label>
  );
}
