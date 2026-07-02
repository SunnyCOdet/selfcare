"use client";

import { useState } from "react";
import { Apple, Copy, Check, ChevronDown } from "lucide-react";

export function StepsSyncCard({ syncToken }: { syncToken: string }) {
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);

  const url =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/steps?token=${syncToken}&steps=[STEPS]`
      : "";

  function copy() {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="glass p-5 fade-up" style={{ animationDelay: "0.25s" }}>
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <Apple className="w-4 h-4 text-accent" /> Auto-sync Apple Health steps
        </h3>
        <ChevronDown className={`w-4 h-4 text-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="mt-4 space-y-3 text-sm text-muted">
          <p>
            Your phone can push steps here automatically — no typing. Copy your
            private sync URL:
          </p>
          <button
            onClick={copy}
            className="w-full bg-surface-2 border border-white/10 rounded-xl px-3 py-2.5 text-xs font-mono text-left break-all hover:border-accent/40 transition-colors flex items-start gap-2"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-success shrink-0 mt-0.5" />
            ) : (
              <Copy className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            )}
            <span>{url}</span>
          </button>
          <p className="text-xs font-semibold text-foreground/80">Option A — free (iOS Shortcuts):</p>
          <ol className="space-y-1.5 list-decimal list-inside text-xs leading-relaxed">
            <li>iPhone → <b>Shortcuts</b> app → new Shortcut, name it exactly <b>&quot;Ascend Sync&quot;</b></li>
            <li>Add <b>&quot;Find Health Samples&quot;</b> → type: Steps, today, group by day → Sum</li>
            <li>Add <b>&quot;Get Contents of URL&quot;</b> → paste the URL, replace <code className="text-accent">[STEPS]</code> with the Health Samples variable</li>
            <li>Done — the <b>Sync button</b> on this dashboard (visible on iPhone) runs it with one tap and brings you right back</li>
            <li>Optional backup: Automation tab → <b>Time of Day</b> 9 PM daily → run &quot;Ascend Sync&quot; → turn off &quot;Ask Before Running&quot;</li>
          </ol>
          <p className="text-xs text-muted/70">
            Every sync sends the full day total and <b>replaces</b> the stored value — sync as often as you
            like, nothing double-counts. Each hour&apos;s snapshot builds your hour-by-hour chart.
          </p>
          <p className="text-xs font-semibold text-foreground/80 pt-1">
            Option B — hands-off (Health Auto Export app, hourly, includes distance + sleep + heart rate):
          </p>
          <ol className="space-y-1.5 list-decimal list-inside text-xs leading-relaxed">
            <li>Install <b>Health Auto Export</b> from the App Store</li>
            <li>New automation → type: <b>REST API</b> → URL: your sync URL <em>without</em> <code className="text-accent">&amp;steps=[STEPS]</code></li>
            <li>Format: JSON · select metrics: Steps, Walking + Running Distance, Sleep Analysis, Heart Rate</li>
            <li>Schedule: hourly (or whatever you like) → enable</li>
          </ol>
          <p className="text-xs text-muted/70">
            Keep this URL private — it&apos;s your personal write key. Works once the app is deployed on Vercel (your phone must be able to reach the URL).
          </p>
        </div>
      )}
    </div>
  );
}
