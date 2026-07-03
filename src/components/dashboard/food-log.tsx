"use client";

import { useState } from "react";
import { Loader2, Send, Camera, ChevronDown, Sparkles, Flame, Beef, Wheat, Droplet, Utensils } from "lucide-react";

type Component = {
  name: string;
  quantity: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
};

type FoodItem = {
  id: string;
  description: string;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  verdict: string | null;
  ai_notes: string | null;
  breakdown?: { components: Component[] } | null;
  hunger_level?: string | null;
  photo_url?: string | null;
};

type PhotoFlow =
  | { stage: "analyzing" }
  | {
      stage: "questions";
      photoPath: string;
      dishName: string;
      componentsSeen: string[];
      questions: string[];
      answers: Record<number, string>;
      hunger: string;
      extraInfo: string;
    }
  | { stage: "finalizing" };

const VERDICT_STYLE: Record<string, string> = {
  good: "bg-success/15 text-success border-success/30",
  okay: "bg-warning/15 text-warning border-warning/30",
  avoid: "bg-red-500/15 text-red-400 border-red-500/30",
};

const HUNGER_LEVELS = ["Starving", "Hungry", "Peckish", "Just craving"];

async function resizeToJpegB64(file: File, maxDim = 1280): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
  return dataUrl.split(",")[1];
}

/** Cal AI-style mini macro ring. */
function MacroRing({
  icon: Icon,
  left,
  unit,
  label,
  pct,
  colorVar,
}: {
  icon: React.ElementType;
  left: number;
  unit: string;
  label: string;
  pct: number;
  colorVar: string;
}) {
  const r = 15.5;
  const c = 2 * Math.PI * r;
  return (
    <div className="flex items-center gap-2.5">
      <div className="relative w-10 h-10 shrink-0">
        <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
          <circle cx="18" cy="18" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="3.5" />
          <circle
            cx="18"
            cy="18"
            r={r}
            fill="none"
            stroke={`var(${colorVar})`}
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c - (c * Math.min(100, pct)) / 100}
            className="transition-all duration-700"
          />
        </svg>
        <Icon className="absolute inset-0 m-auto w-3.5 h-3.5" style={{ color: `var(${colorVar})` }} />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-extrabold leading-none">
          {Math.max(0, Math.round(left))}
          {unit}
        </p>
        <p className="text-[10px] text-muted mt-0.5">{label} left</p>
      </div>
    </div>
  );
}

export function FoodLog({
  initialItems,
  calorieTarget,
  proteinTarget,
  carbsTarget,
  fatTarget,
}: {
  initialItems: FoodItem[];
  calorieTarget: number | null;
  proteinTarget: number | null;
  carbsTarget: number | null;
  fatTarget: number | null;
}) {
  const [items, setItems] = useState<FoodItem[]>(initialItems);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flow, setFlow] = useState<PhotoFlow | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const calories = items.reduce((s, f) => s + (f.calories ?? 0), 0);
  const protein = items.reduce((s, f) => s + (f.protein_g ?? 0), 0);
  const carbs = items.reduce((s, f) => s + (f.carbs_g ?? 0), 0);
  const fat = items.reduce((s, f) => s + (f.fat_g ?? 0), 0);

  const calTarget = calorieTarget ?? 2400;
  const calLeft = calTarget - calories;
  const calRingR = 34;
  const calRingC = 2 * Math.PI * calRingR;
  const calPct = Math.min(100, (calories / calTarget) * 100);

  async function analyzeText() {
    if (!input.trim() || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/food", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: input.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Analysis failed");
      setItems((prev) => [...prev, data.log]);
      setInput("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function onPhoto(file: File) {
    setError(null);
    setFlow({ stage: "analyzing" });
    try {
      const b64 = await resizeToJpegB64(file);
      const res = await fetch("/api/ai/food-photo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phase: "identify", photo_b64: b64 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Photo analysis failed");
      setFlow({
        stage: "questions",
        photoPath: data.photo_path,
        dishName: data.dish_name || "Your meal",
        componentsSeen: data.components_seen || [],
        questions: data.questions || [],
        answers: {},
        hunger: "",
        extraInfo: "",
      });
    } catch (e) {
      setFlow(null);
      setError(e instanceof Error ? e.message : "Photo analysis failed");
    }
  }

  async function finalizePhoto() {
    if (flow?.stage !== "questions") return;
    const f = flow;
    setFlow({ stage: "finalizing" });
    try {
      const answers = f.questions.map((q, i) => ({
        question: q,
        answer: f.answers[i]?.trim() || "not sure - estimate from the photo",
      }));
      if (f.extraInfo.trim()) {
        answers.push({ question: "Anything else about this food?", answer: f.extraInfo.trim() });
      }
      const res = await fetch("/api/ai/food-photo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phase: "finalize",
          photo_path: f.photoPath,
          dish_name: f.dishName,
          answers,
          hunger_level: f.hunger,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Analysis failed");
      setItems((prev) => [...prev, data.log]);
      setExpanded(data.log.id);
      setFlow(null);
    } catch (e) {
      setFlow(null);
      setError(e instanceof Error ? e.message : "Analysis failed");
    }
  }

  return (
    <div className="space-y-4">
      {/* Cal AI-style hero: calories left + macro rings */}
      <div className="glass p-5 md:p-6 fade-up" style={{ animationDelay: "0.12s" }}>
        <div className="flex items-center gap-5">
          <div className="relative w-24 h-24 md:w-28 md:h-28 shrink-0">
            <svg viewBox="0 0 80 80" className="w-full h-full -rotate-90">
              <circle cx="40" cy="40" r={calRingR} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="6" />
              <circle
                cx="40"
                cy="40"
                r={calRingR}
                fill="none"
                stroke={calLeft < 0 ? "#f87171" : "#f5f5f7"}
                strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray={calRingC}
                strokeDashoffset={calRingC - (calRingC * calPct) / 100}
                className="transition-all duration-700"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className={`text-xl md:text-2xl font-extrabold tracking-tight leading-none ${calLeft < 0 ? "text-red-400" : ""}`}>
                {Math.abs(Math.round(calLeft)).toLocaleString()}
              </span>
              <span className="text-[9px] text-muted uppercase tracking-widest mt-1">
                {calLeft < 0 ? "kcal over" : "kcal left"}
              </span>
            </div>
          </div>

          <div className="flex-1 grid grid-cols-1 gap-2.5 min-w-0">
            <MacroRing
              icon={Beef}
              left={(proteinTarget ?? 150) - protein}
              unit="g"
              label="Protein"
              pct={(protein / (proteinTarget ?? 150)) * 100}
              colorVar="--protein"
            />
            <MacroRing
              icon={Wheat}
              left={(carbsTarget ?? 250) - carbs}
              unit="g"
              label="Carbs"
              pct={(carbs / (carbsTarget ?? 250)) * 100}
              colorVar="--carbs"
            />
            <MacroRing
              icon={Droplet}
              left={(fatTarget ?? 70) - fat}
              unit="g"
              label="Fat"
              pct={(fat / (fatTarget ?? 70)) * 100}
              colorVar="--fat"
            />
          </div>
        </div>

        {!flow && (
          <div className="flex gap-2 mt-5">
            <label className="btn-primary !py-2.5 !px-4 text-sm cursor-pointer shrink-0">
              <Camera className="w-4 h-4" /> Scan food
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onPhoto(f);
                  e.target.value = "";
                }}
              />
            </label>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                analyzeText();
              }}
              className="flex gap-2 flex-1 min-w-0"
            >
              <input
                className="input-field !py-2.5 text-sm min-w-0"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="or type it..."
                disabled={loading}
              />
              <button type="submit" disabled={loading || !input.trim()} className="btn-ai !px-3.5 !py-2.5 shrink-0">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </form>
          </div>
        )}

        {flow?.stage === "analyzing" && (
          <div className="flex items-center gap-3 rounded-md bg-surface-2 px-4 py-4 mt-5 text-sm text-muted">
            <Loader2 className="w-4 h-4 animate-spin text-accent" />
            Studying your plate - identifying every ingredient...
          </div>
        )}

        {flow?.stage === "finalizing" && (
          <div className="flex items-center gap-3 rounded-md bg-surface-2 px-4 py-4 mt-5 text-sm text-muted">
            <Loader2 className="w-4 h-4 animate-spin text-accent" />
            Dissecting the meal - counting the hidden oil too...
          </div>
        )}

        {flow?.stage === "questions" && (
          <div className="mt-5 space-y-4 rounded-lg bg-surface-2 p-4 fade-up">
            <div>
              <p className="font-bold text-sm flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-accent" /> {flow.dishName}
              </p>
              {flow.componentsSeen.length > 0 && (
                <p className="text-xs text-muted mt-1">I can see: {flow.componentsSeen.join(", ")}</p>
              )}
            </div>

            {flow.questions.map((q, i) => (
              <div key={i}>
                <label className="text-xs text-muted mb-1 block">{q}</label>
                <input
                  className="input-field !py-2 text-sm"
                  value={flow.answers[i] ?? ""}
                  onChange={(e) =>
                    setFlow({ ...flow, answers: { ...flow.answers, [i]: e.target.value } })
                  }
                  placeholder="Not sure? Leave blank - I will estimate"
                />
              </div>
            ))}

            <div>
              <label className="text-xs text-muted mb-1 block">
                Anything I got wrong or should know? (optional)
              </label>
              <input
                className="input-field !py-2 text-sm"
                value={flow.extraInfo}
                onChange={(e) => setFlow({ ...flow, extraInfo: e.target.value })}
                placeholder="e.g. street vendor / brown rice not white"
              />
            </div>

            <div>
              <label className="text-xs text-muted mb-1.5 block">How hungry are you right now?</label>
              <div className="flex flex-wrap gap-2">
                {HUNGER_LEVELS.map((h) => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => setFlow({ ...flow, hunger: h })}
                    className={`chip !py-1.5 !px-3 text-xs ${flow.hunger === h ? "chip-active" : ""}`}
                  >
                    {h}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-2">
              <button onClick={finalizePhoto} className="btn-ai !py-2 text-sm">
                <Sparkles className="w-4 h-4" /> Analyze it
              </button>
              <button onClick={() => setFlow(null)} className="btn-ghost !py-2 text-sm">
                Cancel
              </button>
            </div>
          </div>
        )}

        {error && <p className="text-sm text-red-400 mt-3">{error}</p>}
      </div>

      {/* Recently logged - Cal AI style cards with thumbnails */}
      {items.length > 0 && (
        <div className="fade-up" style={{ animationDelay: "0.16s" }}>
          <h3 className="font-bold text-base mb-2.5 px-1">Recently logged</h3>
          <div className="space-y-2">
            {items.map((f) => {
              const hasBreakdown = !!f.breakdown?.components?.length;
              const isOpen = expanded === f.id;
              return (
                <div key={f.id} className="glass px-3.5 py-3">
                  <button
                    className="w-full text-left"
                    onClick={() => hasBreakdown && setExpanded(isOpen ? null : f.id)}
                  >
                    <div className="flex items-center gap-3">
                      {f.photo_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={f.photo_url}
                          alt={f.description}
                          className="w-12 h-12 rounded-md object-cover shrink-0 border border-border"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-md bg-surface-2 flex items-center justify-center shrink-0 text-lg">
                          <Utensils className="size-5 text-muted-foreground" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold truncate">{f.description}</p>
                          {hasBreakdown && (
                            <ChevronDown
                              className={`w-3.5 h-3.5 text-muted shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}
                            />
                          )}
                        </div>
                        <div className="flex items-center gap-2.5 mt-1 text-[11px] text-muted">
                          <span className="flex items-center gap-0.5">
                            <Flame className="w-3 h-3 text-flame" /> {f.calories ?? "?"}
                          </span>
                          <span className="flex items-center gap-0.5">
                            <Beef className="w-3 h-3 text-protein" /> {f.protein_g ?? "?"}g
                          </span>
                          <span className="flex items-center gap-0.5">
                            <Wheat className="w-3 h-3 text-carbs" /> {f.carbs_g ?? "?"}g
                          </span>
                          <span className="flex items-center gap-0.5">
                            <Droplet className="w-3 h-3 text-fat" /> {f.fat_g ?? "?"}g
                          </span>
                        </div>
                      </div>
                      {f.verdict && (
                        <span
                          className={`text-[9px] uppercase tracking-wide font-bold border rounded-full px-2 py-0.5 shrink-0 ${
                            VERDICT_STYLE[f.verdict] ?? VERDICT_STYLE.okay
                          }`}
                        >
                          {f.verdict}
                        </span>
                      )}
                    </div>
                  </button>
                  {isOpen && hasBreakdown && (
                    <div className="mt-2.5 border-t border-white/5 pt-2.5 space-y-1">
                      {f.breakdown!.components.map((c, i) => (
                        <div key={i} className="flex justify-between text-xs text-muted">
                          <span>
                            {c.name} <span className="text-muted/60">({c.quantity})</span>
                          </span>
                          <span className="font-mono shrink-0">
                            {Math.round(c.calories)} kcal / {Math.round(c.protein_g)}P {Math.round(c.carbs_g)}C {Math.round(c.fat_g)}F
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  {f.ai_notes && <p className="text-xs text-muted mt-1.5 leading-relaxed">{f.ai_notes}</p>}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
