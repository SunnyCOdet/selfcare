"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Sparkles, Send, Loader2, Map, Palette } from "lucide-react";

type Msg = { role: string; content: string; kind?: string; planUpdated?: boolean; themeUpdated?: boolean };

const QUICK_ACTIONS = [
  { label: "🍽️ What should I eat right now?", message: "What should I eat right now? Consider what I've already eaten today and my remaining macros." },
  { label: "📊 Review my week", message: "", kind: "weekly_review" },
  { label: "🔧 Adjust my plan", message: "I want to adjust my plan. Ask me what I want to change." },
  { label: "🎨 Change the app's look", message: "I want to change the app's template. What presets do you have, and can you make custom ones?" },
  { label: "😮‍💨 Feeling lazy today", message: "I'm feeling lazy and unmotivated today. Get me moving." },
  { label: "🏋️ What's my workout today?", message: "What's my workout today? Give me the exact session." },
];

export function CoachChat({
  initialMessages,
  needsDailyCheckin,
}: {
  initialMessages: Msg[];
  needsDailyCheckin: boolean;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<Msg[]>(initialMessages);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const checkinFired = useRef(false);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Coach proactively opens the day
  useEffect(() => {
    if (needsDailyCheckin && !checkinFired.current) {
      checkinFired.current = true;
      send("", "daily_checkin");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsDailyCheckin]);

  async function send(message: string, kind: string = "chat") {
    if (kind === "chat" && !message.trim()) return;
    setError(null);
    setLoading(true);
    if (message.trim()) {
      setMessages((m) => [...m, { role: "user", content: message.trim() }]);
      setInput("");
    }
    try {
      const res = await fetch("/api/ai/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, kind }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Coach unavailable");
      setMessages((m) => [
        ...m,
        {
          role: "coach",
          content: data.reply,
          kind,
          planUpdated: !!data.plan_updated,
          themeUpdated: !!data.theme_updated,
        },
      ]);
      // Theme/plan changes affect server-rendered UI — refresh so they apply live
      if (data.theme_updated || data.plan_updated) router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col max-w-3xl w-full mx-auto px-4 h-[calc(100dvh-3.5rem-env(safe-area-inset-top))] md:h-[calc(100dvh-4rem)]">
      <div className="flex-1 min-h-0 overflow-y-auto py-5 space-y-4">
        {messages.length === 0 && !loading && (
          <div className="text-center py-16">
            <div className="w-16 h-16 mx-auto rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center mb-4">
              <Sparkles className="w-7 h-7 text-white" />
            </div>
            <h2 className="text-xl font-bold">Your coach is here 24/7</h2>
            <p className="text-muted text-sm mt-2 max-w-sm mx-auto">
              Ask anything — food calls, workout tweaks, motivation, skincare. He knows your plan and your numbers.
            </p>
          </div>
        )}

        {messages.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="flex justify-end">
              <div className="bg-accent/15 border border-accent/25 rounded-2xl rounded-br-sm px-4 py-3 text-sm max-w-[85%] whitespace-pre-wrap">
                {m.content}
              </div>
            </div>
          ) : (
            <div key={i} className="flex gap-2.5 items-start">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center shrink-0 mt-1">
                <Sparkles className="w-3.5 h-3.5 text-white" />
              </div>
              <div
                className={`rounded-2xl rounded-bl-sm px-4 py-3 text-sm max-w-[85%] whitespace-pre-wrap leading-relaxed ${
                  m.kind === "daily_checkin"
                    ? "bg-gradient-to-br from-violet-500/15 to-fuchsia-500/10 border border-accent/20"
                    : "bg-surface-2"
                }`}
              >
                {m.kind === "daily_checkin" && (
                  <p className="text-[10px] uppercase tracking-wide text-accent mb-1.5 font-semibold">
                    Daily check-in
                  </p>
                )}
                {m.kind === "weekly_review" && (
                  <p className="text-[10px] uppercase tracking-wide text-accent mb-1.5 font-semibold">
                    Weekly review
                  </p>
                )}
                {m.content}
                {m.planUpdated && (
                  <Link
                    href="/plan"
                    className="mt-2.5 flex items-center gap-1.5 text-xs font-semibold text-success bg-success/10 border border-success/25 rounded-full px-3 py-1.5 w-fit"
                  >
                    <Map className="w-3.5 h-3.5" /> Plan updated — view it
                  </Link>
                )}
                {m.themeUpdated && (
                  <span className="mt-2.5 flex items-center gap-1.5 text-xs font-semibold text-accent bg-accent/10 border border-accent/25 rounded-full px-3 py-1.5 w-fit">
                    <Palette className="w-3.5 h-3.5" /> New template applied
                  </span>
                )}
              </div>
            </div>
          )
        )}

        {loading && (
          <div className="flex items-center gap-2 text-muted text-sm px-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Coach is typing...
          </div>
        )}
        {error && (
          <p className="text-sm text-red-400 px-2">
            {error}{" "}
            <button className="underline" onClick={() => send(input || "Hey coach", "chat")}>
              Retry
            </button>
          </p>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="space-y-3 pt-2 border-t border-white/5 pb-[calc(4.75rem+env(safe-area-inset-bottom))] md:pb-4">
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          {QUICK_ACTIONS.map((a) => (
            <button
              key={a.label}
              onClick={() => send(a.message, a.kind ?? "chat")}
              disabled={loading}
              className="chip whitespace-nowrap shrink-0"
            >
              {a.label}
            </button>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="flex gap-2"
        >
          <input
            className="input-field"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Message your coach..."
            disabled={loading}
          />
          <button type="submit" disabled={loading || !input.trim()} className="btn-ai !px-4">
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
