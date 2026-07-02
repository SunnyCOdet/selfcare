"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Sparkles, ArrowUp, Map, Palette, Target } from "lucide-react";

type Msg = {
  role: string;
  content: string;
  kind?: string;
  planUpdated?: boolean;
  themeUpdated?: boolean;
  goalUpdated?: boolean;
};

const QUICK_ACTIONS = [
  { label: "🎯 Set a goal", message: "I want to set a new life goal. Interview me properly — one question at a time — then build me a milestone roadmap." },
  { label: "🍽️ What should I eat?", message: "What should I eat right now? Consider what I've already eaten today and my remaining macros." },
  { label: "📊 Review my week", message: "", kind: "weekly_review" },
  { label: "🔧 Adjust my plan", message: "I want to adjust my plan. Ask me what I want to change." },
  { label: "🎨 Change the look", message: "I want to change the app's template. What presets do you have, and can you make custom ones?" },
  { label: "😮‍💨 Feeling lazy", message: "I'm feeling lazy and unmotivated today. Get me moving." },
  { label: "🏋️ Today's workout", message: "What's my workout today? Give me the exact session." },
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
          goalUpdated: !!data.goal_updated,
        },
      ]);
      if (data.theme_updated || data.plan_updated || data.goal_updated) router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col max-w-3xl w-full mx-auto h-[calc(100dvh-3.5rem-env(safe-area-inset-top))] md:h-[calc(100dvh-4rem)]">
      {/* Messages — ChatGPT style: user pills right, coach plain text */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-6 space-y-6">
        {messages.length === 0 && !loading && (
          <div className="h-full flex flex-col items-center justify-center text-center">
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center mb-5">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <h2 className="text-2xl font-bold tracking-tight">Ready when you are.</h2>
            <p className="text-muted text-sm mt-2 max-w-xs mx-auto">
              Plans, food calls, goals, the app itself — just say it, I&apos;ll do it.
            </p>
          </div>
        )}

        {messages.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="flex justify-end">
              <div className="bg-surface-2 border border-white/5 rounded-3xl rounded-br-lg px-4 py-2.5 text-[15px] max-w-[80%] whitespace-pre-wrap">
                {m.content}
              </div>
            </div>
          ) : (
            <div key={i} className="max-w-none">
              {m.kind === "daily_checkin" && (
                <p className="text-[10px] uppercase tracking-widest text-accent mb-1.5 font-bold">
                  Daily check-in
                </p>
              )}
              {m.kind === "weekly_review" && (
                <p className="text-[10px] uppercase tracking-widest text-accent mb-1.5 font-bold">
                  Weekly review
                </p>
              )}
              <div className="text-[15px] leading-relaxed whitespace-pre-wrap">{m.content}</div>
              <div className="flex flex-wrap gap-2 mt-2">
                {m.planUpdated && (
                  <Link
                    href="/plan"
                    className="flex items-center gap-1.5 text-xs font-semibold text-success bg-success/10 border border-success/25 rounded-full px-3 py-1.5"
                  >
                    <Map className="w-3.5 h-3.5" /> Plan updated — view it
                  </Link>
                )}
                {m.themeUpdated && (
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-accent bg-accent/10 border border-accent/25 rounded-full px-3 py-1.5">
                    <Palette className="w-3.5 h-3.5" /> New template applied
                  </span>
                )}
                {m.goalUpdated && (
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-warning bg-warning/10 border border-warning/25 rounded-full px-3 py-1.5">
                    <Target className="w-3.5 h-3.5" /> Goal updated
                  </span>
                )}
              </div>
            </div>
          )
        )}

        {loading && (
          <div className="flex items-center gap-1.5 px-1">
            <span className="w-2 h-2 rounded-full bg-muted/60 animate-bounce" style={{ animationDelay: "0ms" }} />
            <span className="w-2 h-2 rounded-full bg-muted/60 animate-bounce" style={{ animationDelay: "150ms" }} />
            <span className="w-2 h-2 rounded-full bg-muted/60 animate-bounce" style={{ animationDelay: "300ms" }} />
          </div>
        )}

        {error && (
          <p className="text-sm text-red-400">
            {error}{" "}
            <button className="underline" onClick={() => send(input || "Hey coach", "chat")}>
              Retry
            </button>
          </p>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Composer — ChatGPT-style floating pill */}
      <div className="px-3 pb-[calc(4.75rem+env(safe-area-inset-bottom))] md:pb-4 pt-1">
        <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {QUICK_ACTIONS.map((a) => (
            <button
              key={a.label}
              onClick={() => send(a.message, a.kind ?? "chat")}
              disabled={loading}
              className="shrink-0 text-xs font-medium text-muted border border-white/10 rounded-full px-3.5 py-2 hover:border-accent/40 hover:text-foreground transition-colors whitespace-nowrap active:scale-95"
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
          className="flex items-end gap-2 bg-surface-2 border border-white/10 rounded-[26px] pl-5 pr-2 py-2 shadow-[0_8px_32px_-12px_rgba(0,0,0,0.8)]"
        >
          <input
            className="flex-1 bg-transparent outline-none text-[15px] py-1.5 placeholder:text-muted/60 min-w-0"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask your coach"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="w-9 h-9 rounded-full bg-foreground text-background flex items-center justify-center shrink-0 transition-all disabled:opacity-25 active:scale-90"
            aria-label="Send"
          >
            <ArrowUp className="w-4.5 h-4.5" strokeWidth={2.5} />
          </button>
        </form>
      </div>
    </div>
  );
}
