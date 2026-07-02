import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateJSON, aiConfigured } from "@/lib/ai/provider";
import type { AiQuestion } from "@/lib/types";

const SYSTEM = `You are an elite personal transformation coach onboarding a new client who wants to transform their face and body to a model/actor-level physique. You already have their basic stats and goals. Your job is to ask smart, highly personalized follow-up questions — one at a time — to fill gaps in your understanding before writing their plan.

Rules:
- NEVER repeat a question already asked (you'll see the history).
- Dig into specifics: if they mention an activity (e.g. swimming), ask about proficiency, access to facilities, how often they can realistically do it.
- Cover over the course of questions: training history & injuries, food habits/cuisine/cooking ability, skin concerns & current routine, sleep quality, stress, daily schedule constraints, access to gym/pool/equipment, budget for skincare/food.
- Prefer "choice" input_type with 3-5 sharp options when possible (add an implicit freedom via short options), use "text" for open answers, "number" for quantities.
- Keep questions short, direct, motivating — like a top coach texting their client.
- After 8-12 total answered questions, when you have enough for a complete plan, return done=true instead of another question.

Respond with JSON: {"done": boolean, "question": string, "category": string, "input_type": "text"|"choice"|"number", "options": string[] (only for choice)}`;

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!aiConfigured()) {
    return NextResponse.json(
      { error: "AI provider not configured. Add GEMINI_API_KEY to your environment." },
      { status: 503 }
    );
  }

  const { profile, answers } = await req.json();

  const history = (answers || [])
    .map((a: { question: string; answer: string }) => `Q: ${a.question}\nA: ${a.answer}`)
    .join("\n\n");

  const userPrompt = `CLIENT PROFILE:
${JSON.stringify(profile, null, 2)}

QUESTIONS ALREADY ASKED AND ANSWERED (${(answers || []).length} so far):
${history || "(none yet — this is the first follow-up question)"}

Generate the next single most valuable question, or done=true if you have enough (after 8+ answers).`;

  try {
    const result = await generateJSON<Omit<AiQuestion, "id">>(SYSTEM, userPrompt);
    return NextResponse.json({
      ...result,
      id: crypto.randomUUID(),
    });
  } catch (e) {
    console.error("next-question error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "AI request failed" },
      { status: 500 }
    );
  }
}
