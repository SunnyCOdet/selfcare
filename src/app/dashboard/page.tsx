import Link from "next/link";
import { redirect } from "next/navigation";
import { Activity, ChevronRight, Flame, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Nav } from "@/components/nav";
import { TodayPanel } from "@/components/dashboard/today-panel";
import { StreakCard } from "@/components/dashboard/streak-card";
import { DeepWork } from "@/components/dashboard/deep-work";
import { WeekStrip } from "@/components/dashboard/week-strip";
import { GoalsCard } from "@/components/dashboard/goals-card";
import { FoodLog } from "@/components/dashboard/food-log";
import { RefreshOnFocus } from "@/components/refresh-on-focus";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { TransformationPlan } from "@/lib/types";
import { todayStr, todayWeekday, currentHour, APP_TZ } from "@/lib/dates";
import { computeReadiness } from "@/lib/readiness";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const today = todayStr();

  const [
    { data: profile },
    { data: planRow },
    { data: streak },
    { data: recentCheckins },
    { data: todayCheckin },
    { data: todayFood },
    { data: todayCoachMsg },
    { data: goals },
    { data: trackers },
    { data: trackerLogs },
    { data: vitals },
    { data: focusToday },
  ] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    supabase
      .from("transformation_plans")
      .select("plan, version")
      .eq("user_id", user.id)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("streaks").select("*").eq("user_id", user.id).maybeSingle(),
    supabase
      .from("daily_checkins")
      .select("checkin_date, completion_pct")
      .eq("user_id", user.id)
      .order("checkin_date", { ascending: false })
      .limit(7),
    supabase
      .from("daily_checkins")
      .select("*")
      .eq("user_id", user.id)
      .eq("checkin_date", today)
      .maybeSingle(),
    supabase
      .from("food_logs")
      .select("id, description, calories, protein_g, carbs_g, fat_g, verdict, ai_notes, breakdown, photo_path")
      .eq("user_id", user.id)
      .eq("log_date", today)
      .order("created_at", { ascending: true }),
    supabase
      .from("coach_messages")
      .select("id")
      .eq("user_id", user.id)
      .eq("kind", "daily_checkin")
      .gte("created_at", `${today}T00:00:00+05:30`)
      .limit(1)
      .maybeSingle(),
    supabase
      .from("goals")
      .select("id, title, category, target_metric, target_value, current_value, deadline, milestones")
      .eq("user_id", user.id)
      .eq("status", "active")
      .order("created_at", { ascending: true }),
    supabase
      .from("custom_trackers")
      .select("id, name, emoji, unit, target_value")
      .eq("user_id", user.id)
      .eq("active", true)
      .order("created_at", { ascending: true }),
    supabase
      .from("tracker_logs")
      .select("tracker_id, done, value")
      .eq("user_id", user.id)
      .eq("log_date", today),
    supabase
      .from("daily_checkins")
      .select("checkin_date, sleep_hours, heart_rate_avg")
      .eq("user_id", user.id)
      .order("checkin_date", { ascending: false })
      .limit(14),
    supabase
      .from("focus_sessions")
      .select("minutes")
      .eq("user_id", user.id)
      .eq("log_date", today),
  ]);

  if (!profile?.onboarding_completed || !planRow) redirect("/onboarding");

  const plan = planRow.plan as TransformationPlan;

  const foodWithUrls = await Promise.all(
    (todayFood ?? []).map(async (f) => {
      if (!f.photo_path) return { ...f, photo_url: null };
      const { data } = await supabase.storage.from("photos").createSignedUrl(f.photo_path, 3600);
      return { ...f, photo_url: data?.signedUrl ?? null };
    })
  );

  const firstName = (profile.full_name ?? "Champion").split(" ")[0];
  const hour = currentHour();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const readiness = computeReadiness(vitals ?? []);
  const focusMinutes = (focusToday ?? []).reduce((s, r) => s + (r.minutes ?? 0), 0);
  const focusCount = (focusToday ?? []).length;

  return (
    <div className="flex-1">
      <RefreshOnFocus />
      <Nav avatarUrl={profile.avatar_url} name={profile.full_name} active="dashboard" theme={profile.theme} />

      <main className="page-shell space-y-5 md:space-y-6">
        <header className="motion-rise flex items-start justify-between gap-4">
          <div className="min-w-0">
            <Badge variant="outline" className="mb-3 bg-white/[0.035]">
              <Activity className="size-3" />
              Today command center
            </Badge>
            <h1 className="text-balance text-3xl font-black leading-tight md:text-5xl">
              {greeting}, <span className="text-accent">{firstName}</span>
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground md:text-base">
              {new Date().toLocaleDateString("en-IN", {
                weekday: "long",
                day: "numeric",
                month: "long",
                timeZone: APP_TZ,
              })}{" "}
              - the only job is to move the score forward.
            </p>
          </div>
          <div
            className={`lg:hidden shrink-0 flex items-center gap-2 rounded-full border px-3.5 py-2 ${
              (streak?.current_streak ?? 0) > 0
                ? "border-flame/35 bg-flame/10 text-flame"
                : "border-border bg-white/[0.035] text-muted-foreground"
            }`}
          >
            <Flame className="size-4" fill="currentColor" />
            <span className="text-sm font-black">{streak?.current_streak ?? 0}</span>
          </div>
        </header>

        <WeekStrip checkins={recentCheckins ?? []} />

        {readiness && (
          <Card className="motion-rise border-accent/15">
            <CardContent className="flex items-center gap-4 p-4">
              <div
                className={`flex size-12 shrink-0 flex-col items-center justify-center rounded-full border-2 ${
                  readiness.score >= 85
                    ? "border-success text-success"
                    : readiness.score >= 65
                      ? "border-accent-2 text-accent-2"
                      : readiness.score >= 45
                        ? "border-warning text-warning"
                        : "border-destructive text-destructive"
                }`}
              >
                <span className="text-sm font-black leading-none">{readiness.score}</span>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold">
                  {readiness.label}
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    {readiness.sleep_hours != null && `${readiness.sleep_hours}h sleep`}
                    {readiness.hr_delta != null &&
                      ` / HR ${readiness.hr_delta > 0 ? "+" : ""}${readiness.hr_delta} vs baseline`}
                  </span>
                </p>
                <p className="truncate text-xs text-muted-foreground">{readiness.advice}</p>
              </div>
            </CardContent>
          </Card>
        )}

        {!todayCoachMsg && (
          <Link
            href="/coach"
            className="glass glass-hover motion-rise flex items-center justify-between gap-4 border-accent/30 px-4 py-4"
          >
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-accent text-background">
                <Sparkles className="size-4" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold">Coach check-in pending</p>
                <p className="truncate text-xs text-muted-foreground">Thirty seconds keeps the plan sharp.</p>
              </div>
            </div>
            <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
          </Link>
        )}

        <div className="grid grid-cols-1 gap-5 md:gap-6 lg:grid-cols-3">
          <div className="space-y-5 md:space-y-6 lg:col-span-2">
            <TodayPanel
              userId={user.id}
              plan={plan}
              initialCheckin={todayCheckin}
              today={today}
              trackers={trackers ?? []}
              initialTrackerLogs={trackerLogs ?? []}
            />
            <GoalsCard goals={goals ?? []} />
            <FoodLog
              initialItems={foodWithUrls}
              calorieTarget={plan.nutrition?.daily_calories ?? null}
              proteinTarget={plan.nutrition?.protein_g ?? null}
              carbsTarget={plan.nutrition?.carbs_g ?? null}
              fatTarget={plan.nutrition?.fat_g ?? null}
            />
          </div>

          <div className="space-y-5 md:space-y-6">
            <div className="hidden lg:block">
              <StreakCard streak={streak} />
            </div>
            <DeepWork
              userId={user.id}
              syncToken={profile.sync_token}
              initialMinutesToday={focusMinutes}
              initialSessions={focusCount}
            />
            <TodaySchedule plan={plan} />
          </div>
        </div>
      </main>
    </div>
  );
}

function TodaySchedule({ plan }: { plan: TransformationPlan }) {
  const dayName = todayWeekday();
  const todaySchedule = plan.weekly_schedule?.find(
    (d) => d.day.toLowerCase() === dayName.toLowerCase()
  );
  if (!todaySchedule) return null;

  return (
    <Card className="motion-rise" style={{ animationDelay: "160ms" }}>
      <CardHeader className="flex-row items-center justify-between gap-3 pb-3">
        <CardTitle className="text-sm">Today&apos;s schedule</CardTitle>
        <Link href="/plan" className="flex items-center text-xs text-muted-foreground hover:text-foreground">
          Full plan <ChevronRight className="size-3.5" />
        </Link>
      </CardHeader>
      <CardContent>
        <div className="space-y-2.5">
          {todaySchedule.blocks.slice(0, 4).map((block, index) => (
            <div key={`${block.time}-${index}`} className="grid grid-cols-[3rem_1fr] gap-3 text-sm">
              <span className="pt-0.5 font-mono text-xs text-accent">{block.time}</span>
              <div className="min-w-0">
                <p className="font-medium leading-tight">{block.activity}</p>
                {block.details && <p className="mt-0.5 text-xs text-muted-foreground">{block.details}</p>}
              </div>
            </div>
          ))}
          {todaySchedule.blocks.length > 4 && (
            <p className="text-xs text-muted-foreground">+{todaySchedule.blocks.length - 4} more blocks</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
