"use client";

import { useState } from "react";
import { UtensilsCrossed, Loader2, Send, Camera, ChevronDown, Sparkles } from "lucide-react";

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
  verdict: string | null;
  ai_notes: string | null;
  breakdown?: { components: Component[] } | null;
  hunger_level?: string | null;
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

const HUNGER_LEVELS = ["🥵 Starving", "😋 Hungry", "🙂 Peckish", "😑 Just craving"];

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

export function FoodLog({
  initialItems,
  calorieTarget,
  proteinTarget,
}: {
  initialItems: FoodItem[];
  calorieTarget: number | null;
  proteinTarget: number | null;
}) {
  const [items, setItems] = useState<FoodItem[]>(initialItems);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flow, setFlow] = useState<PhotoFlow | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const calories = items.reduce((s, f) => s + (f.calories ?? 0), 0);
  const protein = items.reduce((s, f) => s + (f.protein_g ?? 0), 0);

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
        answer: f.answers[i]?.trim() || "not sure — estimate from the photo",
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
    <div className="glass p-6 fade-up" style={{ animationDelay: "0.15s" }}>
      <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
        <h3 className="font-semibold flex items-center gap-2">
          <UtensilsCrossed className="w-5 h-5 text-accent" /> Food — ask before you eat
        </h3>
        <div className="text-sm text-muted">
          <b className="text-foreground">{calories}</b>
          {calorieTarget ? ` / ${calorieTarget}` : ""} kcal ·{" "}
          <b className="text-foreground">{protein}g</b>
          {proteinTarget ? ` / ${proteinTarget}g` : ""} protein
        </div>
      </div>
      <p className="text-xs text-muted mb-4">
        Snap a photo or type it — AI dissects every ingredient (oil included) and tells you if it fits.
      </p>

      {!flow && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            analyzeText();
          }}
          className="flex gap-2 mb-4"
        >
          <label className="btn-ghost !px-3.5 !py-2.5 cursor-pointer shrink-0" title="Snap or upload a food photo">
            <Camera className="w-4 h-4" />
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
          <input
            className="input-field !py-2.5 text-sm"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="What did you eat (or want to eat)?"
            disabled={loading}
          />
          <button type="submit" disabled={loading || !input.trim()} className="btn-primary !px-4 !py-2.5">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </form>
      )}

      {flow?.stage === "analyzing" && (
        <div className="flex items-center gap-3 bg-surface-2 rounded-xl px-4 py-4 mb-4 text-sm text-muted">
          <Loader2 className="w-4 h-4 animate-spin text-accent" />
          Studying your plate — identifying every ingredient...
        </div>
      )}

      {flow?.stage === "finalizing" && (
        <div className="flex items-center gap-3 bg-surface-2 rounded-xl px-4 py-4 mb-4 text-sm text-muted">
          <Loader2 className="w-4 h-4 animate-spin text-accent" />
          Dissecting the meal — counting the hidden oil too...
        </div>
      )}

      {flow?.stage === "questions" && (
        <div className="bg-surface-2 rounded-xl p-4 mb-4 space-y-4 fade-up">
          <div>
            <p className="font-semibold text-sm flex items-center gap-1.5">
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
                placeholder="Not sure? Leave blank — I'll estimate"
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
              placeholder="e.g. it's from a street vendor / it's brown rice not white"
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
            <button onClick={finalizePhoto} className="btn-primary !py-2 text-sm">
              Analyze it
            </button>
            <button onClick={() => setFlow(null)} className="btn-ghost !py-2 text-sm">
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-red-400 mb-3">{error}</p>}

      {items.length > 0 && (
        <div className="space-y-2">
          {items.map((f) => {
            const hasBreakdown = !!f.breakdown?.components?.length;
            const isOpen = expanded === f.id;
            return (
              <div key={f.id} className="bg-surface-2 rounded-xl px-4 py-3">
                <button
                  className="w-full text-left"
                  onClick={() => hasBreakdown && setExpanded(isOpen ? null : f.id)}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium flex items-center gap-1.5">
                      {f.description}
                      {hasBreakdown && (
                        <ChevronDown
                          className={`w-3.5 h-3.5 text-muted transition-transform ${isOpen ? "rotate-180" : ""}`}
                        />
                      )}
                    </span>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-muted">
                        {f.calories ?? "?"} kcal · {f.protein_g ?? "?"}g P
                      </span>
                      {f.verdict && (
                        <span
                          className={`text-[10px] uppercase tracking-wide font-semibold border rounded-full px-2 py-0.5 ${
                            VERDICT_STYLE[f.verdict] ?? VERDICT_STYLE.okay
                          }`}
                        >
                          {f.verdict}
                        </span>
                      )}
                    </div>
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
                          {Math.round(c.calories)} kcal · {Math.round(c.protein_g)}P {Math.round(c.carbs_g)}C {Math.round(c.fat_g)}F
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
      )}
    </div>
  );
}
