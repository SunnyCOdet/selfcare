import type { SupabaseClient } from "@supabase/supabase-js";
import type { TransformationPlan } from "@/lib/types";

/**
 * Gathers everything the AI coach needs to know about the user so every
 * reply is grounded in their actual plan and recent behavior.
 */
export async function buildUserContext(supabase: SupabaseClient, userId: string) {
  const today = new Date().toISOString().slice(0, 10);

  const [
    { data: profile },
    { data: planRow },
    { data: streak },
    { data: checkins },
    { data: foods },
  ] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", userId).single(),
    supabase
      .from("transformation_plans")
      .select("plan")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("streaks").select("*").eq("user_id", userId).maybeSingle(),
    supabase
      .from("daily_checkins")
      .select("checkin_date, steps, completion_pct, sleep_hours, water_liters, mood, weight_kg, tasks")
      .eq("user_id", userId)
      .order("checkin_date", { ascending: false })
      .limit(7),
    supabase
      .from("food_logs")
      .select("description, calories, protein_g, verdict")
      .eq("user_id", userId)
      .eq("log_date", today)
      .order("created_at", { ascending: true }),
  ]);

  const plan = (planRow?.plan ?? null) as TransformationPlan | null;

  const foodToday = foods ?? [];
  const caloriesToday = foodToday.reduce((s, f) => s + (f.calories ?? 0), 0);
  const proteinToday = foodToday.reduce((s, f) => s + (f.protein_g ?? 0), 0);

  return {
    today,
    profile: profile
      ? {
          name: profile.full_name,
          age: profile.age,
          gender: profile.gender,
          height_cm: profile.height_cm,
          weight_kg: profile.weight_kg,
          target_weight_kg: profile.target_weight_kg,
          body_goal: profile.body_goal,
          inspiration: profile.inspiration,
          diet_preference: profile.diet_preference,
          activities: profile.activities,
          skin_type: profile.skin_type,
          skin_concerns: profile.skin_concerns,
          wake_time: profile.wake_time,
          sleep_time: profile.sleep_time,
        }
      : null,
    plan_summary: plan
      ? {
          summary: plan.summary,
          timeline_weeks: plan.timeline_weeks,
          steps_target: plan.steps_target,
          daily_non_negotiables: plan.daily_non_negotiables,
          nutrition_targets: {
            daily_calories: plan.nutrition?.daily_calories,
            protein_g: plan.nutrition?.protein_g,
            carbs_g: plan.nutrition?.carbs_g,
            fat_g: plan.nutrition?.fat_g,
            water_liters: plan.nutrition?.water_liters,
            guidelines: plan.nutrition?.guidelines,
          },
          workout_split: plan.workout_plan?.split_name,
          gym_days: plan.workout_plan?.gym_days_per_week,
          weekly_milestones: plan.weekly_milestones,
        }
      : null,
    streak: streak
      ? {
          current: streak.current_streak,
          longest: streak.longest_streak,
          total_days_done: streak.total_checkins,
          last_counted: streak.last_checkin_date,
        }
      : null,
    last_7_days: checkins ?? [],
    food_today: {
      items: foodToday,
      calories_so_far: caloriesToday,
      protein_so_far: proteinToday,
    },
  };
}
