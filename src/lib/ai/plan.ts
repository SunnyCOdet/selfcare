import type { SupabaseClient } from "@supabase/supabase-js";
import type { TransformationPlan } from "@/lib/types";

/** The exact JSON shape every plan (generated or updated) must match. */
export const PLAN_JSON_SPEC = `{
  "summary": string,                    // 2-3 sentence overview of the transformation strategy
  "goal_analysis": string,              // honest analysis: current state vs target, what needs to change, realistic expectations
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
    "guidance": [string]
  },
  "grooming": [string],
  "sleep": { "target_hours": number, "wind_down": [string] },
  "activities": [ { "name": string, "frequency": string, "progression": string } ],
  "daily_non_negotiables": [string],    // MUST include "Walk 20,000 steps"; keep list to 5-7 items
  "weekly_milestones": [string],
  "model_prep": [string]
}`;

export const PLAN_RULES = `Rules:
- Base calories/macros on their stats (Mifflin-St Jeor + activity), goal direction (cut/bulk/recomp), and diet preference/cuisine.
- Respect injuries, proficiency levels, schedule constraints, and equipment access.
- 20,000 daily steps is mandatory and must appear in the schedule and non-negotiables.
- Meals must match their cuisine/diet preference with real foods and rough portions.
- Be specific (exercise names, sets x reps, product types) but never prescribe medication.
- Tone: confident, motivating, no fluff.`;

/** Sanity-check that an AI response is a complete plan before saving it. */
export function isValidPlan(p: unknown): p is TransformationPlan {
  if (!p || typeof p !== "object") return false;
  const plan = p as Record<string, unknown>;
  const nutrition = plan.nutrition as Record<string, unknown> | undefined;
  const workout = plan.workout_plan as Record<string, unknown> | undefined;
  return !!(
    typeof plan.summary === "string" &&
    Array.isArray(plan.weekly_schedule) &&
    plan.weekly_schedule.length >= 7 &&
    workout &&
    Array.isArray(workout.days) &&
    workout.days.length > 0 &&
    nutrition &&
    typeof nutrition.daily_calories === "number" &&
    Array.isArray(nutrition.meals) &&
    nutrition.meals.length > 0 &&
    Array.isArray(plan.daily_non_negotiables) &&
    plan.daily_non_negotiables.length > 0
  );
}

/** Archive the current active plan and save a new version. Returns the new version number. */
export async function savePlanVersion(
  supabase: SupabaseClient,
  userId: string,
  plan: TransformationPlan
): Promise<number> {
  plan.steps_target = 20000;

  await supabase
    .from("transformation_plans")
    .update({ status: "archived" })
    .eq("user_id", userId)
    .eq("status", "active");

  const { data: prev } = await supabase
    .from("transformation_plans")
    .select("version")
    .eq("user_id", userId)
    .order("version", { ascending: false })
    .limit(1);

  const version = prev && prev.length > 0 ? prev[0].version + 1 : 1;

  const { error } = await supabase.from("transformation_plans").insert({
    user_id: userId,
    plan,
    status: "active",
    version,
  });
  if (error) throw new Error(error.message);
  return version;
}
