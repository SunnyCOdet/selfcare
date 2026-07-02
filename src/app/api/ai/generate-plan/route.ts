import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateJSON, aiConfigured } from "@/lib/ai/provider";
import type { TransformationPlan } from "@/lib/types";

const SYSTEM = `You are an elite body-transformation and modeling-prep coach (think coaches behind Bollywood/Hollywood physique transformations). You write complete, realistic, safe, highly specific programs.

You MUST respond with a single JSON object exactly matching this TypeScript shape (all fields required):

{
  "summary": string,                    // 2-3 sentence overview of the transformation strategy
  "goal_analysis": string,              // honest analysis: current state vs target (incl. inspiration physique), what needs to change, realistic expectations
  "timeline_weeks": number,             // realistic timeline to visible transformation
  "steps_target": number,               // ALWAYS 20000 — non-negotiable daily steps
  "weekly_schedule": [                  // all 7 days
    { "day": "Monday", "blocks": [ { "time": "06:30", "activity": string, "details": string } ] }
  ],
  "workout_plan": {
    "gym_days_per_week": number,
    "split_name": string,               // e.g. "Push/Pull/Legs"
    "days": [ { "day": string, "focus": string, "exercises": [ { "name": string, "sets": string, "reps": string, "notes": string } ] } ],
    "cardio_guidance": string
  },
  "nutrition": {
    "daily_calories": number, "protein_g": number, "carbs_g": number, "fat_g": number, "water_liters": number,
    "meals": [ { "time": string, "name": string, "items": [string], "notes": string } ],
    "guidelines": [string]
  },
  "skincare": {
    "morning": [ { "step": string, "product_type": string, "notes": string } ],
    "evening": [ { "step": string, "product_type": string, "notes": string } ],
    "weekly": [string],
    "guidance": [string]                // includes face-structure tips: dehydration/sodium for face bloat, jawline via low body fat, etc.
  },
  "grooming": [string],                 // hair, brows, posture, dental, style pointers for modeling
  "sleep": { "target_hours": number, "wind_down": [string] },
  "activities": [ { "name": string, "frequency": string, "progression": string } ],  // their chosen activities with progression path matched to stated proficiency
  "daily_non_negotiables": [string],    // MUST include "Walk 20,000 steps"; keep list to 5-7 items
  "weekly_milestones": [string],
  "model_prep": [string]                // posture, facial expressions, photogenic angles, portfolio prep guidance
}

Rules:
- Base calories/macros on their stats (Mifflin-St Jeor + activity), goal direction (cut/bulk/recomp), and diet preference/cuisine.
- Respect injuries, proficiency levels (e.g. non-swimmer → learn-to-swim progression), schedule constraints, equipment access from their answers.
- 20,000 daily steps is mandatory and must appear in the schedule and non-negotiables.
- Meals must match their cuisine/diet preference with real foods and rough portions.
- Be specific (exercise names, sets x reps, product types like "gentle cleanser", "SPF 50 sunscreen") but never prescribe medication.
- Tone: confident, motivating, no fluff.`;

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
    plan.steps_target = 20000;

    // Archive any previous active plan, save the new one
    await supabase
      .from("transformation_plans")
      .update({ status: "archived" })
      .eq("user_id", user.id)
      .eq("status", "active");

    const { data: prev } = await supabase
      .from("transformation_plans")
      .select("version")
      .eq("user_id", user.id)
      .order("version", { ascending: false })
      .limit(1);

    const version = prev && prev.length > 0 ? prev[0].version + 1 : 1;

    const { error: insertError } = await supabase.from("transformation_plans").insert({
      user_id: user.id,
      plan,
      status: "active",
      version,
    });
    if (insertError) throw new Error(insertError.message);

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
