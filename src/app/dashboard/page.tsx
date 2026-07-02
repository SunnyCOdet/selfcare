import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Nav } from "@/components/nav";
import { TodayPanel } from "@/components/dashboard/today-panel";
import { StreakCard } from "@/components/dashboard/streak-card";
import { WeekStrip } from "@/components/dashboard/week-strip";
import { StepsSyncCard } from "@/components/dashboard/steps-sync-card";
import { FoodLog } from "@/components/dashboard/food-log";
import { RefreshOnFocus } from "@/components/refresh-on-focus";
import type { TransformationPlan } from "@/lib/types";
import Link from "next/link";
import { Sparkles, ChevronRight } from "lucide-react";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const [{ data: profile }, { data: planRow }, { data: streak }, { data: recentCheckins }] =
    await Promise.all([
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
    ]);

  if (!profile?.onboarding_completed || !planRow) redirect("/onboarding");

  const plan = planRow.plan as TransformationPlan;
  const today = new Date().toISOString().slice(0, 10);

  const [{ data: todayCheckin }, { data: todayFood }, { data: todayCoachMsg }] =
    await Promise.all([
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
        .gte("created_at", `${today}T00:00:00Z`)
        .limit(1)
        .maybeSingle(),
    ]);

  // Signed thumbnails for photo-logged meals (private bucket)
  const foodWithUrls = await Promise.all(
    (todayFood ?? []).map(async (f) => {
      if (!f.photo_path) return { ...f, photo_url: null };
      const { data } = await supabase.storage.from("photos").createSignedUrl(f.photo_path, 3600);
      return { ...f, photo_url: data?.signedUrl ?? null };
    })
  );

  const firstName = (profile.full_name ?? "Champion").split(" ")[0];
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <div className="flex-1">
      <RefreshOnFocus />
      <Nav avatarUrl={profile.avatar_url} name={profile.full_name} active="dashboard" />

      <main className="max-w-5xl mx-auto px-4 pt-5 pb-28 md:py-8 space-y-5 md:space-y-6">
        <header className="fade-up flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">
              {greeting}, <span className="gradient-text">{firstName}</span>
            </h1>
            <p className="text-muted mt-1 text-sm md:text-base">
              {new Date().toLocaleDateString("en-IN", {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}{" "}
              — every checked box is a brick in the new you.
            </p>
          </div>
          <div
            className={`lg:hidden shrink-0 flex items-center gap-1.5 rounded-full px-3.5 py-2 border ${
              (streak?.current_streak ?? 0) > 0
                ? "bg-gradient-to-br from-orange-500/20 to-rose-500/15 border-orange-500/30 text-orange-300"
                : "bg-surface-2 border-white/10 text-muted/60"
            }`}
          >
            <span className="text-base leading-none">🔥</span>
            <span className="font-bold text-sm leading-none">{streak?.current_streak ?? 0}</span>
          </div>
        </header>

        <WeekStrip checkins={recentCheckins ?? []} />

        {!todayCoachMsg && (
          <Link
            href="/coach"
            className="glass glass-hover fade-up flex items-center justify-between px-5 py-4 border-accent/25"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <div>
                <p className="font-semibold text-sm">Your coach wants to check in</p>
                <p className="text-xs text-muted">Daily check-in pending — 30 seconds, keeps the plan sharp.</p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-muted" />
          </Link>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 md:gap-6">
          <div className="lg:col-span-2 space-y-5 md:space-y-6">
            <TodayPanel
              userId={user.id}
              plan={plan}
              initialCheckin={todayCheckin}
              today={today}
            />
            <FoodLog
              initialItems={foodWithUrls}
              calorieTarget={plan.nutrition?.daily_calories ?? null}
              proteinTarget={plan.nutrition?.protein_g ?? null}
              carbsTarget={plan.nutrition?.carbs_g ?? null}
              fatTarget={plan.nutrition?.fat_g ?? null}
            />
          </div>

          <div className="space-y-5 md:space-y-6">
            <StreakCard streak={streak} />
            <TodaySchedule plan={plan} />
            {profile.sync_token && <StepsSyncCard syncToken={profile.sync_token} />}
          </div>
        </div>
      </main>
    </div>
  );
}

function TodaySchedule({ plan }: { plan: TransformationPlan }) {
  const dayName = new Date().toLocaleDateString("en-US", { weekday: "long" });
  const todaySchedule = plan.weekly_schedule?.find(
    (d) => d.day.toLowerCase() === dayName.toLowerCase()
  );
  if (!todaySchedule) return null;

  return (
    <div className="glass p-5 fade-up" style={{ animationDelay: "0.2s" }}>
      <h3 className="font-semibold mb-3 text-sm uppercase tracking-wide text-muted">
        Today&apos;s schedule
      </h3>
      <div className="space-y-2.5">
        {todaySchedule.blocks.map((b, i) => (
          <div key={i} className="flex gap-3 text-sm">
            <span className="text-accent font-mono text-xs pt-0.5 w-12 shrink-0">{b.time}</span>
            <div>
              <p className="font-medium leading-tight">{b.activity}</p>
              {b.details && <p className="text-muted text-xs mt-0.5">{b.details}</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
