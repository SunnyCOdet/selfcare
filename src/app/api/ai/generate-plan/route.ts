import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateJSON, aiConfigured } from "@/lib/ai/provider";
import { PLAN_JSON_SPEC, PLAN_RULES, isValidPlan, savePlanVersion } from "@/lib/ai/plan";
import type { TransformationPlan } from "@/lib/types";

const SYSTEM = `You are an elite body-transformation and modeling-prep coach (think coaches behind Bollywood/Hollywood physique transformations). You write complete, realistic, safe, highly specific programs.

You MUST respond with a single JSON object exactly matching this TypeScript shape (all fields required):

${PLAN_JSON_SPEC}

${PLAN_RULES}`;

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

  const userPrompt = `Write the complete transformation plan for this client.

CLIENT PROFILE:
${JSON.stringify(profile, null, 2)}

INTAKE INTERVIEW:
${history || "(no follow-up answers)"}

Return the full JSON plan now.`;

  try {
    const plan = await generateJSON<TransformationPlan>(SYSTEM, userPrompt);
    if (!isValidPlan(plan)) throw new Error("AI returned an incomplete plan — please retry");

    const version = await savePlanVersion(supabase, user.id, plan);

    await supabase
      .from("profiles")
      .update({ onboarding_completed: true })
      .eq("id", user.id);

    return NextResponse.json({ plan, version });
  } catch (e) {
    console.error("generate-plan error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Plan generation failed" },
      { status: 500 }
    );
  }
}
