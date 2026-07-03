"use client";

import { useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";

type Result = {
  verdict: string;
  improvements: string[];
  unchanged_or_worse: string[];
  focus_areas: string[];
  photo_tips: string;
  from: string;
  to: string;
};

export function PhotoCompare({ photoCount }: { photoCount: number }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function compare() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/photo-compare", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Comparison failed");
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Comparison failed");
    } finally {
      setLoading(false);
    }
  }

  if (photoCount < 2) return null;

  return (
    <div className="glass p-5 fade-up" style={{ animationDelay: "0.08s" }}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="font-semibold text-sm flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-accent" /> AI progress review
          </p>
          <p className="text-xs text-muted mt-0.5">
            Jarvis compares your earliest photo against your latest — honest verdict.
          </p>
        </div>
        <button onClick={compare} disabled={loading} className="btn-ai !py-2 !px-4 text-sm shrink-0">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          Compare
        </button>
      </div>

      {error && <p className="text-xs text-red-400 mt-3">{error}</p>}

      {result && (
        <div className="mt-4 space-y-3 text-sm fade-up">
          <p className="font-bold">
            {result.from} → {result.to}: <span className="gradient-text">{result.verdict}</span>
          </p>
          {result.improvements.length > 0 && (
            <div>
              <p className="text-xs uppercase tracking-widest text-success font-semibold mb-1">Improved</p>
              {result.improvements.map((x, i) => (
                <p key={i} className="text-muted text-sm">• {x}</p>
              ))}
            </div>
          )}
          {result.unchanged_or_worse.length > 0 && (
            <div>
              <p className="text-xs uppercase tracking-widest text-warning font-semibold mb-1">Needs work</p>
              {result.unchanged_or_worse.map((x, i) => (
                <p key={i} className="text-muted text-sm">• {x}</p>
              ))}
            </div>
          )}
          <div>
            <p className="text-xs uppercase tracking-widest text-accent font-semibold mb-1">Focus next</p>
            {result.focus_areas.map((x, i) => (
              <p key={i} className="text-muted text-sm">• {x}</p>
            ))}
          </div>
          <p className="text-xs text-muted/60">{result.photo_tips}</p>
        </div>
      )}
    </div>
  );
}
