import type { SupabaseClient } from "@supabase/supabase-js";
import type { TransformationPlan } from "@/lib/types";
import { todayStr } from "@/lib/dates";
import { computeReadiness } from "@/lib/readiness";

/**
 * Gathers everything the AI coach needs to know about the user so every
 * reply is grounded in their actual plan and recent behavior.
 */
export async function buildUserContext(supabase: SupabaseClient, userId: string) {
  const today = todayStr();

  const [
    { data: profile },
    { data: planRow },
    { data: streak },
    { data: checkins },
    { data: foods },
    { data: goals },
    { data: goalProgress },
    { data: memories },
    { data: recentWorkouts },
    { data: trackers },
    { data: vitals },
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
    supabase
      .from("goals")
      .select("id, title, why, category, target_metric, target_value, current_value, deadline, status, milestones, hours_per_week, updated_at")
      .eq("user_id", userId)
      .in("status", ["active", "paused"])
      .order("created_at", { ascending: true }),
    supabase
      .from("goal_progress")
      .select("note, new_value, milestone, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(15),
    supabase
      .from("agent_memories")
      .select("category, content, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("workouts")
      .select("logged_on, exercise, weight_kg, sets, reps, est_1rm, is_pr")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("custom_trackers")
      .select("name, emoji, unit, target_value")
      .eq("user_id", userId)
      .eq("active", true),
    supabase
      .from("daily_checkins")
      .select("checkin_date, sleep_hours, heart_rate_avg")
      .eq("user_id", userId)
      .order("checkin_date", { ascending: false })
      .limit(14),
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
    goals: goals ?? [],
    recent_goal_progress: goalProgress ?? [],
    memories: memories ?? [],
    recent_workouts: recentWorkouts ?? [],
    custom_trackers: trackers ?? [],
    readiness_today: computeReadiness(vitals ?? []),
  };
}
