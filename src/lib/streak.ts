import type { SupabaseClient } from "@supabase/supabase-js";
import { todayStr } from "@/lib/dates";

/** A day counts toward the streak once completion reaches this percentage. */
export const STREAK_THRESHOLD = 70;

/**
 * Called after a check-in save. If today's completion crosses the threshold
 * and the streak hasn't already counted today, extend (or reset) the streak.
 * Days roll over at midnight IST (see lib/dates.ts).
 */
export async function updateStreak(
  supabase: SupabaseClient,
  userId: string,
  completionPct: number
) {
  if (completionPct < STREAK_THRESHOLD) return;

  const today = todayStr();
  const yesterday = todayStr(-1);

  const { data: streak } = await supabase
    .from("streaks")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (!streak) {
    await supabase.from("streaks").insert({
      user_id: userId,
      current_streak: 1,
      longest_streak: 1,
      total_checkins: 1,
      last_checkin_date: today,
    });
    return;
  }

  if (streak.last_checkin_date === today) return; // already counted today

  const current =
    streak.last_checkin_date === yesterday ? streak.current_streak + 1 : 1;

  await supabase
    .from("streaks")
    .update({
      current_streak: current,
      longest_streak: Math.max(current, streak.longest_streak),
      total_checkins: streak.total_checkins + 1,
      last_checkin_date: today,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);
}
