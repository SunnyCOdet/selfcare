"use client";

import { useState } from "react";
import { Zap, Mic, CalendarPlus, Copy, Check, ChevronDown } from "lucide-react";

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <div className="space-y-1">
      <p className="text-[11px] font-semibold text-foreground/80">{label}</p>
      <button
        onClick={copy}
        className="w-full bg-surface-2 border border-white/10 rounded-xl px-3 py-2 text-[11px] font-mono text-left break-all hover:border-accent/40 transition-colors flex items-start gap-2"
      >
        {copied ? (
          <Check className="w-3.5 h-3.5 text-success shrink-0 mt-0.5" />
        ) : (
          <Copy className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        )}
        <span>{value}</span>
      </button>
    </div>
  );
}

export function PowersCard({ syncToken }: { syncToken: string }) {
  const [open, setOpen] = useState(false);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const host = typeof window !== "undefined" ? window.location.host : "";
  const log = (qs: string) => `${origin}/api/log?token=${syncToken}&${qs}`;
  const calendarWebcal = `webcal://${host}/api/calendar/${syncToken}.ics`;
  const calendarHttps = `${origin}/api/calendar/${syncToken}.ics`;

  return (
    <div className="glass p-5 fade-up" style={{ animationDelay: "0.3s" }}>
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <Zap className="w-4 h-4 text-accent" /> Voice logging &amp; calendar
        </h3>
        <ChevronDown className={`w-4 h-4 text-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="mt-4 space-y-5 text-sm text-muted">
          {/* Voice / Shortcuts quick-log */}
          <div className="space-y-3">
            <p className="flex items-center gap-2 text-xs font-semibold text-foreground/80">
              <Mic className="w-3.5 h-3.5 text-accent" /> Log by voice (Siri + Shortcuts)
            </p>
            <p className="text-xs leading-relaxed">
              Each link logs one thing when opened — no need to open the app. Put one in an iOS Shortcut
              (<b>Get Contents of URL</b>), then say <b>&quot;Hey Siri, log my weight&quot;</b> or tap it on your home screen.
            </p>
            <div className="space-y-2.5">
              <CopyRow label="Weight (replace [KG] in the Shortcut)" value={log("action=weight&value=[KG]")} />
              <CopyRow label="Add 0.5 L water" value={log("action=water&value=0.5")} />
              <CopyRow label="Sleep hours (replace [HRS])" value={log("action=sleep&value=[HRS]")} />
              <CopyRow label="Mood (replace [MOOD])" value={log("action=mood&text=[MOOD]")} />
              <CopyRow label="Mark a habit done (e.g. protein, skincare, workout)" value={log("action=done&text=protein")} />
            </div>
            <p className="text-[11px] text-muted/70 leading-relaxed">
              Actions: <code className="text-accent">weight</code>, <code className="text-accent">water</code> (adds),{" "}
              <code className="text-accent">sleep</code>, <code className="text-accent">mood</code>,{" "}
              <code className="text-accent">steps</code>, <code className="text-accent">done</code>/
              <code className="text-accent">undone</code>, <code className="text-accent">workout</code>,{" "}
              <code className="text-accent">skincare</code>. Everything updates your daily score instantly.
            </p>
          </div>

          {/* Calendar subscription */}
          <div className="space-y-3 pt-1 border-t border-white/5">
            <p className="flex items-center gap-2 text-xs font-semibold text-foreground/80 pt-3">
              <CalendarPlus className="w-3.5 h-3.5 text-accent" /> Subscribe to your plan calendar
            </p>
            <p className="text-xs leading-relaxed">
              Your daily schedule — workouts, meals, skincare — shows up in Apple/Google Calendar with a
              10-minute heads-up before each block. It refreshes automatically as your plan changes.
            </p>
            <a
              href={calendarWebcal}
              className="btn-primary !py-2.5 text-sm w-full justify-center"
            >
              <CalendarPlus className="w-4 h-4" /> Add to Apple Calendar
            </a>
            <CopyRow label="Or paste this into any calendar app (Subscribe)" value={calendarHttps} />
          </div>

          <p className="text-[11px] text-muted/70">
            Keep these URLs private — your sync token is a personal write/read key. Works once the app is
            deployed and reachable from your phone.
          </p>
        </div>
      )}
    </div>
  );
}
