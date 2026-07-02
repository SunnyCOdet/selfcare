"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { AiQuestion, IntakeAnswer } from "@/lib/types";
import type { WizardData } from "./wizard";
import { Sparkles, Send, Loader2 } from "lucide-react";

type Phase = "asking" | "generating" | "error";

export function AiInterview({ userId, profile }: { userId: string; profile: WizardData }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [phase, setPhase] = useState<Phase>("asking");
  const [question, setQuestion] = useState<AiQuestion | null>(null);
  const [answers, setAnswers] = useState<IntakeAnswer[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [genStep, setGenStep] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fetchedRef = useRef(false);

  const fetchNextQuestion = useCallback(
    async (currentAnswers: IntakeAnswer[]) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/ai/next-question", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ profile, answers: currentAnswers }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to get question");
        if (data.done) {
          await generatePlan(currentAnswers);
          return;
        }
        setQuestion(data);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
      } finally {
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [profile]
  );

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    fetchNextQuestion([]);
  }, [fetchNextQuestion]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [answers, question, loading]);

  async function submitAnswer(answer: string) {
    if (!question || !answer.trim()) return;
    const newAnswer: IntakeAnswer = {
      category: question.category || "general",
      question: question.question,
      answer: answer.trim(),
    };
    const next = [...answers, newAnswer];
    setAnswers(next);
    setInput("");
    setQuestion(null);

    // Persist answer (fire and forget)
    supabase.from("intake_answers").insert({ user_id: userId, ...newAnswer }).then();

    if (next.length >= 12) {
      await generatePlan(next);
    } else {
      await fetchNextQuestion(next);
    }
  }

  async function generatePlan(finalAnswers: IntakeAnswer[]) {
    setPhase("generating");
    const interval = setInterval(() => setGenStep((s) => (s + 1) % GEN_MESSAGES.length), 2600);
    try {
      const res = await fetch("/api/ai/generate-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile, answers: finalAnswers }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Plan generation failed");
      router.push("/dashboard?welcome=1");
    } catch (e) {
      setPhase("error");
      setError(e instanceof Error ? e.message : "Plan generation failed");
    } finally {
      clearInterval(interval);
    }
  }

  if (phase === "generating") {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="relative">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center streak-glow">
            <Sparkles className="w-9 h-9 text-white animate-pulse" />
          </div>
        </div>
        <h2 className="text-2xl font-bold mt-8">Building your transformation</h2>
        <p className="text-muted mt-2 fade-up" key={genStep}>
          {GEN_MESSAGES[genStep]}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="mb-4">
        <h2 className="text-2xl font-bold mb-1 flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-accent" /> Your AI coach
        </h2>
        <p className="text-muted text-sm">
          A few sharp questions so your plan actually fits your life. {answers.length > 0 && `${answers.length} answered.`}
        </p>
      </div>

      <div className="space-y-4 max-h-[45vh] overflow-y-auto pr-1 mb-4">
        {answers.map((a, i) => (
          <div key={i} className="space-y-2">
            <div className="bg-surface-2 rounded-2xl rounded-bl-sm px-4 py-3 text-sm max-w-[85%]">{a.question}</div>
            <div className="bg-accent/15 border border-accent/25 rounded-2xl rounded-br-sm px-4 py-3 text-sm max-w-[85%] ml-auto text-right">
              {a.answer}
            </div>
          </div>
        ))}

        {question && (
          <div className="bg-surface-2 rounded-2xl rounded-bl-sm px-4 py-3 text-sm max-w-[85%] fade-up">
            {question.question}
          </div>
        )}

        {loading && (
          <div className="flex items-center gap-2 text-muted text-sm px-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Coach is thinking...
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {error && (
        <div className="text-sm text-red-400 mb-3">
          {error}{" "}
          <button className="underline" onClick={() => (phase === "error" ? generatePlan(answers) : fetchNextQuestion(answers))}>
            Retry
          </button>
        </div>
      )}

      {question && !loading && (
        <div className="space-y-3">
          {question.input_type === "choice" && question.options ? (
            <div className="flex flex-wrap gap-2">
              {question.options.map((o) => (
                <button key={o} onClick={() => submitAnswer(o)} className="chip">
                  {o}
                </button>
              ))}
            </div>
          ) : null}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submitAnswer(input);
            }}
            className="flex gap-2"
          >
            <input
              className="input-field"
              type={question.input_type === "number" ? "number" : "text"}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={question.input_type === "choice" ? "Or type your own answer..." : "Type your answer..."}
              autoFocus
            />
            <button type="submit" disabled={!input.trim()} className="btn-primary !px-4">
              <Send className="w-4 h-4" />
            </button>
          </form>
          {answers.length >= 6 && (
            <button onClick={() => generatePlan(answers)} className="text-xs text-muted underline">
              I&apos;ve shared enough — build my plan now
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const GEN_MESSAGES = [
  "Analyzing your goals and current physique...",
  "Designing your workout split...",
  "Calculating calories and macros for your target...",
  "Writing your skincare and grooming protocol...",
  "Placing your 20,000 daily steps into the schedule...",
  "Mapping your weekly milestones...",
  "Final polish — almost there...",
];
