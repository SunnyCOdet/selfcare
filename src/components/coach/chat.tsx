"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  Sparkles,
  ArrowUp,
  Map,
  Palette,
  Target,
  Menu,
  SquarePen,
  Search,
  Trash2,
  X,
  MessageSquare,
  Mic,
  Dumbbell,
  ListChecks,
  AlarmClock,
} from "lucide-react";

type Msg = {
  role: string;
  content: string;
  kind?: string;
  planUpdated?: boolean;
  themeUpdated?: boolean;
  goalUpdated?: boolean;
  workoutLogged?: boolean;
  trackerUpdated?: boolean;
  pingScheduled?: boolean;
};

/** Inline markdown: **bold**, *italic*, `code`. */
function inline(text: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /(\*\*(.+?)\*\*|`([^`]+)`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[2] !== undefined) out.push(<strong key={k++}>{m[2]}</strong>);
    else if (m[3] !== undefined)
      out.push(
        <code key={k++} className="bg-white/10 rounded px-1 py-0.5 text-[13px]">
          {m[3]}
        </code>
      );
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Minimal markdown block renderer for Jarvis replies (bold, lists, headers). */
function Md({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <>
      {lines.map((line, i) => {
        const h = line.match(/^#{1,4}\s+(.*)/);
        if (h) {
          return (
            <p key={i} className="font-bold mt-2 mb-0.5">
              {inline(h[1])}
            </p>
          );
        }
        const li = line.match(/^\s*[-*]\s+(.*)/);
        if (li) {
          return (
            <p key={i} className="pl-4 relative">
              <span className="absolute left-0.5 text-muted">-</span>
              {inline(li[1])}
            </p>
          );
        }
        const ol = line.match(/^\s*(\d+)[.)]\s+(.*)/);
        if (ol) {
          return (
            <p key={i} className="pl-5 relative">
              <span className="absolute left-0 text-muted">{ol[1]}.</span>
              {inline(ol[2])}
            </p>
          );
        }
        if (line.trim() === "") return <div key={i} className="h-2.5" />;
        return <p key={i}>{inline(line)}</p>;
      })}
    </>
  );
}

/** Render streamed coach replies with the same markdown treatment as static replies. */
function Typewriter({ text, animate }: { text: string; animate: boolean }) {
  const visibleText = animate ? text : text;
  return <Md text={visibleText} />;
}

type Conversation = { id: string; title: string; updated_at: string };

const QUICK_ACTIONS = [
  { label: "Set a goal", message: "I want to set a new life goal. Interview me properly - one question at a time - then build me a milestone roadmap." },
  { label: "What should I eat?", message: "What should I eat right now? Consider what I've already eaten today and my remaining macros." },
  { label: "Review my week", message: "", kind: "weekly_review" },
  { label: "Adjust my plan", message: "I want to adjust my plan. Ask me what I want to change." },
  { label: "Change the look", message: "I want to change the app's template. What presets do you have, and can you make custom ones?" },
  { label: "Feeling lazy", message: "I'm feeling lazy and unmotivated today. Get me moving." },
  { label: "Today's workout", message: "What's my workout today? Give me the exact session." },
];

function groupLabel(dateStr: string): string {
  const d = new Date(dateStr);
  const today = new Date();
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOfDay(today) - startOfDay(d)) / 86400000);
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays <= 7) return "Previous 7 days";
  if (diffDays <= 30) return "Previous 30 days";
  return "Older";
}

export function CoachChat({
  conversations: initialConversations,
  initialConversationId,
  initialMessages,
  needsDailyCheckin,
}: {
  conversations: Conversation[];
  initialConversationId: string | null;
  initialMessages: Msg[];
  needsDailyCheckin: boolean;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [conversations, setConversations] = useState<Conversation[]>(initialConversations);
  const [activeId, setActiveId] = useState<string | null>(initialConversationId);
  const [messages, setMessages] = useState<Msg[]>(initialMessages);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [animateLast, setAnimateLast] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const checkinFired = useRef(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);

  function toggleMic() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      setError("Voice input isn't supported in this browser");
      return;
    }
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    const rec = new SR();
    rec.lang = "en-IN";
    rec.interimResults = true;
    rec.continuous = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      let transcript = "";
      for (const r of e.results) transcript += r[0].transcript;
      setInput(transcript);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recognitionRef.current = rec;
    rec.start();
    setListening(true);
  }

  const activeTitle = conversations.find((c) => c.id === activeId)?.title ?? "New chat";

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Coach proactively opens the day in a fresh thread
  useEffect(() => {
    if (needsDailyCheckin && !checkinFired.current) {
      checkinFired.current = true;
      const timeout = window.setTimeout(() => {
        void send("", "daily_checkin");
      }, 0);
      return () => window.clearTimeout(timeout);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsDailyCheckin]);

  function bumpConversation(id: string, title?: string) {
    setConversations((prev) => {
      const existing = prev.find((c) => c.id === id);
      const updated: Conversation = {
        id,
        title: title ?? existing?.title ?? "New chat",
        updated_at: new Date().toISOString(),
      };
      return [updated, ...prev.filter((c) => c.id !== id)];
    });
  }

  async function send(message: string, kind: string = "chat") {
    if (kind === "chat" && !message.trim()) return;
    setError(null);
    setLoading(true);
    setStatus(null);
    setAnimateLast(false); // real streaming, no fake typewriter
    if (message.trim()) {
      setMessages((m) => [...m, { role: "user", content: message.trim() }]);
      setInput("");
    }
    let started = false;
    const appendDelta = (d: string) => {
      if (!started) {
        started = true;
        setMessages((m) => [...m, { role: "coach", content: d, kind }]);
      } else {
        setMessages((m) => {
          const copy = [...m];
          copy[copy.length - 1] = { ...copy[copy.length - 1], content: copy[copy.length - 1].content + d };
          return copy;
        });
      }
    };
    const finish = (data: Record<string, unknown>) => {
      setStatus(null);
      setMessages((m) => {
        const copy = [...m];
        const last = copy[copy.length - 1];
        if (started && last?.role === "coach") {
          copy[copy.length - 1] = {
            ...last,
            content: typeof data.reply === "string" && !started ? data.reply : last.content,
            planUpdated: !!data.plan_updated,
            themeUpdated: !!data.theme_updated,
            goalUpdated: !!data.goal_updated,
            workoutLogged: !!data.workout_logged,
            trackerUpdated: !!data.tracker_updated,
            pingScheduled: !!data.ping_scheduled,
          };
        } else if (typeof data.reply === "string") {
          copy.push({
            role: "coach",
            content: data.reply,
            kind,
            planUpdated: !!data.plan_updated,
            themeUpdated: !!data.theme_updated,
            goalUpdated: !!data.goal_updated,
            workoutLogged: !!data.workout_logged,
            trackerUpdated: !!data.tracker_updated,
            pingScheduled: !!data.ping_scheduled,
          });
        }
        return copy;
      });
      if (typeof data.conversation_id === "string") {
        setActiveId(data.conversation_id);
        bumpConversation(data.conversation_id, (data.conversation_title as string) ?? undefined);
      }
      if (data.theme_updated || data.plan_updated || data.goal_updated || data.food_updated)
        router.refresh();
    };

    try {
      const res = await fetch("/api/ai/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, kind, conversation_id: activeId, stream: true }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || "Jarvis unavailable");
      }

      if (res.headers.get("content-type")?.includes("text/event-stream") && res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";
          for (const line of lines) {
            const t = line.trim();
            if (!t.startsWith("data:")) continue;
            let ev: Record<string, unknown>;
            try {
              ev = JSON.parse(t.slice(5).trim());
            } catch {
              continue;
            }
            if (ev.t === "d" && typeof ev.d === "string") appendDelta(ev.d);
            else if (ev.t === "s" && typeof ev.s === "string") setStatus(ev.s);
            else if (ev.t === "done") finish(ev);
            else if (ev.t === "err") throw new Error((ev.m as string) || "Jarvis unavailable");
          }
        }
      } else {
        // non-streaming fallback
        const data = await res.json();
        started = false;
        finish(data);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
      setStatus(null);
    }
  }

  async function openConversation(id: string) {
    if (id === activeId) {
      setDrawerOpen(false);
      return;
    }
    setDrawerOpen(false);
    setSwitching(true);
    setActiveId(id);
    setMessages([]);
    const { data } = await supabase
      .from("coach_messages")
      .select("role, content, kind")
      .eq("conversation_id", id)
      .order("created_at", { ascending: true })
      .limit(100);
    setMessages((data as Msg[]) ?? []);
    setSwitching(false);
  }

  function newChat() {
    setDrawerOpen(false);
    setActiveId(null);
    setMessages([]);
    setError(null);
  }

  async function deleteConversation(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (id === activeId) newChat();
    await supabase.from("coach_conversations").delete().eq("id", id);
  }

  const filtered = query.trim()
    ? conversations.filter((c) => c.title.toLowerCase().includes(query.toLowerCase()))
    : conversations;
  const groups: { label: string; items: Conversation[] }[] = [];
  for (const c of filtered) {
    const label = groupLabel(c.updated_at);
    const g = groups.find((x) => x.label === label);
    if (g) g.items.push(c);
    else groups.push({ label, items: [c] });
  }

  return (
    <div className="mx-auto flex h-[calc(100dvh-3.5rem-env(safe-area-inset-top))] w-full max-w-4xl flex-col md:h-[calc(100dvh-4rem)]">
      {/* Chat sub-header - history menu / title / new chat */}
      <div className="flex items-center justify-between border-b border-border px-2 py-1.5">
        <button
          onClick={() => setDrawerOpen(true)}
          className="rounded-full p-2.5 text-muted hover:bg-white/[0.06] hover:text-foreground active:scale-95"
          aria-label="Chat history"
        >
          <Menu className="w-5 h-5" />
        </button>
        <p className="truncate px-2 text-sm font-semibold">{activeId ? activeTitle : "New chat"}</p>
        <button
          onClick={newChat}
          className="rounded-full p-2.5 text-muted hover:bg-white/[0.06] hover:text-foreground active:scale-95"
          aria-label="New chat"
        >
          <SquarePen className="w-5 h-5" />
        </button>
      </div>

      {/* History drawer - ChatGPT-style slide-in */}
      <div
        className={`fixed inset-0 z-50 transition-[visibility] ${drawerOpen ? "visible" : "invisible delay-300"}`}
        aria-hidden={!drawerOpen}
      >
        <div
          className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${
            drawerOpen ? "opacity-100" : "opacity-0"
          }`}
          onClick={() => setDrawerOpen(false)}
        />
        <aside
          className={`absolute left-0 top-0 h-full w-[85%] max-w-xs bg-background border-r border-border flex flex-col transition-transform duration-300 ease-out pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] ${
            drawerOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex items-center gap-2 p-3">
            <div className="flex-1 flex items-center gap-2 rounded-full border border-border bg-white/[0.055] px-3.5 py-2">
              <Search className="w-4 h-4 text-muted shrink-0" />
              <input
                className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted/60 min-w-0"
                placeholder="Search chats"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {query && (
                <button onClick={() => setQuery("")} className="text-muted">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <button
              onClick={() => setDrawerOpen(false)}
              className="p-2 rounded-full text-muted hover:text-foreground md:hidden"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <button
            onClick={newChat}
            className="mx-3 flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-semibold transition-colors hover:bg-white/[0.06]"
          >
            <SquarePen className="w-4.5 h-4.5" /> New chat
          </button>

          <div className="flex-1 overflow-y-auto px-3 pb-4 mt-1">
            {groups.length === 0 && (
              <p className="text-xs text-muted/60 px-3 py-6 text-center">
                {query ? "No chats match" : "No conversations yet"}
              </p>
            )}
            {groups.map((g) => (
              <div key={g.label} className="mt-4">
                <p className="text-[11px] font-semibold text-muted/60 px-3 mb-1">{g.label}</p>
                {g.items.map((c) => (
                  <div
                    key={c.id}
                    onClick={() => openConversation(c.id)}
                    className={`group flex cursor-pointer items-center gap-2.5 rounded-md px-3 py-2.5 transition-colors ${
                      c.id === activeId ? "bg-white/[0.08]" : "hover:bg-white/[0.055]"
                    }`}
                  >
                    <MessageSquare className="w-4 h-4 text-muted/50 shrink-0" />
                    <span className="flex-1 text-sm truncate">{c.title}</span>
                    <button
                      onClick={(e) => deleteConversation(c.id, e)}
                      className="opacity-0 group-hover:opacity-100 max-md:opacity-60 text-muted hover:text-red-400 transition-opacity p-1"
                      aria-label="Delete chat"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </aside>
      </div>

      {/* Messages - user pills right, coach plain text */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-6 space-y-6">
        {messages.length === 0 && !loading && !switching && (
          <div className="h-full flex flex-col items-center justify-center text-center fade-up">
            <div className="mb-5 flex size-14 items-center justify-center rounded-md bg-accent text-background">
              <Sparkles className="size-6" />
            </div>
            <h2 className="text-2xl font-bold tracking-tight">Ready when you are.</h2>
            <p className="text-muted text-sm mt-2 max-w-xs mx-auto">
              Plans, food calls, goals, the app itself - just say it, I&apos;ll do it.
            </p>
          </div>
        )}

        {switching && (
          <div className="space-y-4 animate-pulse pt-2">
            <div className="w-2/3 h-14 rounded-2xl bg-white/5" />
            <div className="w-1/2 h-10 rounded-2xl bg-white/5 ml-auto" />
            <div className="w-3/4 h-16 rounded-2xl bg-white/5" />
          </div>
        )}

        {messages.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="flex justify-end fade-up">
              <div className="max-w-[80%] whitespace-pre-wrap rounded-lg border border-border bg-white/[0.075] px-4 py-2.5 text-[15px]">
                {m.content}
              </div>
            </div>
          ) : (
            <div key={i} className="max-w-none fade-up">
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
              <div className="text-[15px] leading-relaxed">
                <Typewriter text={m.content} animate={animateLast && i === messages.length - 1} />
              </div>
              <div className="flex flex-wrap gap-2 mt-2">
                {m.planUpdated && (
                  <Link
                    href="/plan"
                    className="flex items-center gap-1.5 text-xs font-semibold text-success bg-success/10 border border-success/25 rounded-full px-3 py-1.5"
                  >
                    <Map className="w-3.5 h-3.5" /> Plan updated - view it
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
                {m.workoutLogged && (
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-move bg-move/10 border border-move/25 rounded-full px-3 py-1.5">
                    <Dumbbell className="w-3.5 h-3.5" /> Workout logged
                  </span>
                )}
                {m.trackerUpdated && (
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-success bg-success/10 border border-success/25 rounded-full px-3 py-1.5">
                    <ListChecks className="w-3.5 h-3.5" /> Tracker added
                  </span>
                )}
                {m.pingScheduled && (
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-sky-400 bg-sky-400/10 border border-sky-400/25 rounded-full px-3 py-1.5">
                    <AlarmClock className="w-3.5 h-3.5" /> Follow-up scheduled
                  </span>
                )}
              </div>
            </div>
          )
        )}

        {loading && (
          <div className="flex items-center gap-2 px-1">
            {status ? (
              <span className="text-sm text-muted flex items-center gap-2 fade-up">
                <Sparkles className="w-3.5 h-3.5 text-accent animate-pulse" /> {status}
              </span>
            ) : (
              <>
                <span className="w-2 h-2 rounded-full bg-muted/60 animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-2 h-2 rounded-full bg-muted/60 animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-2 h-2 rounded-full bg-muted/60 animate-bounce" style={{ animationDelay: "300ms" }} />
              </>
            )}
          </div>
        )}

        {error && (
          <p className="text-sm text-red-400">
            {error}{" "}
            <button className="underline" onClick={() => send(input || "Hey Jarvis", "chat")}>
              Retry
            </button>
          </p>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Composer - floating pill */}
      <div className="px-3 pb-[calc(4.75rem+env(safe-area-inset-bottom))] md:pb-4 pt-1">
        <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {QUICK_ACTIONS.map((a) => (
            <button
              key={a.label}
              onClick={() => send(a.message, a.kind ?? "chat")}
              disabled={loading}
              className="shrink-0 whitespace-nowrap rounded-full border border-border bg-white/[0.035] px-3.5 py-2 text-xs font-medium text-muted transition-colors hover:border-accent/40 hover:text-foreground active:scale-95"
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
          className="flex items-end gap-2 rounded-[26px] border border-border bg-surface/95 py-2 pl-5 pr-2 shadow-[0_18px_70px_-48px_rgba(0,0,0,0.95)] backdrop-blur-xl"
        >
          <input
            className="flex-1 bg-transparent outline-none text-[15px] py-1.5 placeholder:text-muted/60 min-w-0"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={listening ? "Listening..." : "Ask Jarvis"}
            disabled={loading}
          />
          <button
            type="button"
            onClick={toggleMic}
            className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-all active:scale-90 ${
              listening ? "bg-red-500/20 text-red-400 animate-pulse" : "text-muted hover:bg-white/[0.06] hover:text-foreground"
            }`}
            aria-label="Voice input"
          >
            <Mic className="w-4.5 h-4.5" />
          </button>
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-background transition-all disabled:opacity-25 active:scale-95"
            aria-label="Send"
          >
            <ArrowUp className="w-4.5 h-4.5" strokeWidth={2.5} />
          </button>
        </form>
      </div>
    </div>
  );
}
