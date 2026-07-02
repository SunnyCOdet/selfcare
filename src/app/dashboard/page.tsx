import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Nav } from "@/components/nav";
import { TodayPanel } from "@/components/dashboard/today-panel";
import { StreakCard } from "@/components/dashboard/streak-card";
import { WeekStrip } from "@/components/dashboard/week-strip";
import { StepsSyncCard } from "@/components/dashboard/steps-sync-card";
import type { TransformationPlan } from "@/lib/types";

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

  const { data: todayCheckin } = await supabase
    .from("daily_checkins")
    .select("*")
    .eq("user_id", user.id)
    .eq("checkin_date", today)
    .maybeSingle();

  const firstName = (profile.full_name ?? "Champion").split(" ")[0];
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <div className="flex-1">
      <Nav avatarUrl={profile.avatar_url} name={profile.full_name} active="dashboard" />

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        <header className="fade-up">
          <h1 className="text-3xl font-bold">
            {greeting}, <span className="gradient-text">{firstName}</span>
          </h1>
          <p className="text-muted mt-1">
            {new Date().toLocaleDateString("en-IN", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}{" "}
            — every checked box is a brick in the new you.
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <TodayPanel
              userId={user.id}
              plan={plan}
              initialCheckin={todayCheckin}
              today={today}
            />
          </div>

          <div className="space-y-6">
            <StreakCard streak={streak} />
            <WeekStrip checkins={recentCheckins ?? []} />
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
