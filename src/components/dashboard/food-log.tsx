"use client";

import { useState } from "react";
import { UtensilsCrossed, Loader2, Send } from "lucide-react";

type FoodItem = {
  id: string;
  description: string;
  calories: number | null;
  protein_g: number | null;
  verdict: string | null;
  ai_notes: string | null;
};

const VERDICT_STYLE: Record<string, string> = {
  good: "bg-success/15 text-success border-success/30",
  okay: "bg-warning/15 text-warning border-warning/30",
  avoid: "bg-red-500/15 text-red-400 border-red-500/30",
};

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

  const calories = items.reduce((s, f) => s + (f.calories ?? 0), 0);
  const protein = items.reduce((s, f) => s + (f.protein_g ?? 0), 0);

  async function analyze() {
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
        Type anything — &quot;2 rotis with dal&quot;, &quot;chicken biryani&quot;, &quot;a samosa?&quot; — AI logs it and tells you if it fits your goal.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          analyze();
        }}
        className="flex gap-2 mb-4"
      >
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

      {error && <p className="text-sm text-red-400 mb-3">{error}</p>}

      {items.length > 0 && (
        <div className="space-y-2">
          {items.map((f) => (
            <div key={f.id} className="bg-surface-2 rounded-xl px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium">{f.description}</span>
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
              {f.ai_notes && <p className="text-xs text-muted mt-1.5 leading-relaxed">{f.ai_notes}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
