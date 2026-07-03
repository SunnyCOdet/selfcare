import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Nav } from "@/components/nav";
import { WeightChart } from "@/components/progress/weight-chart";
import { PhotoSection } from "@/components/progress/photo-section";
import { PhotoCompare } from "@/components/progress/photo-compare";
import { StepsSyncCard } from "@/components/dashboard/steps-sync-card";
import { NotificationsCard } from "@/components/notifications-card";

export default async function ProgressPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const [{ data: profile }, { data: weights }, { data: photos }, { data: workouts }] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, avatar_url, weight_kg, target_weight_kg, sync_token, theme")
      .eq("id", user.id)
      .single(),
    supabase
      .from("daily_checkins")
      .select("checkin_date, weight_kg")
      .eq("user_id", user.id)
      .not("weight_kg", "is", null)
      .order("checkin_date", { ascending: true })
      .limit(120),
    supabase
      .from("progress_photos")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(60),
    supabase
      .from("workouts")
      .select("logged_on, exercise, weight_kg, sets, reps, est_1rm, is_pr")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  // Signed URLs for the private bucket
  const photosWithUrls = await Promise.all(
    (photos ?? []).map(async (p) => {
      const { data } = await supabase.storage
        .from("photos")
        .createSignedUrl(p.storage_path, 3600);
      return { ...p, url: data?.signedUrl ?? null };
    })
  );

  return (
    <div className="flex-1">
      <Nav avatarUrl={profile?.avatar_url ?? null} name={profile?.full_name ?? null} active="progress" theme={profile?.theme} />

      <main className="page-shell space-y-5 md:space-y-6">
        <header className="fade-up">
          <h1 className="text-3xl font-bold">Progress</h1>
          <p className="text-muted mt-1">The camera and the scale don&apos;t lie. Neither does consistency.</p>
        </header>

        <PhotoCompare photoCount={(photos ?? []).length} />

        <WeightChart
          data={(weights ?? []).map((w) => ({
            date: w.checkin_date,
            weight: Number(w.weight_kg),
          }))}
          startWeight={profile?.weight_kg ? Number(profile.weight_kg) : null}
          targetWeight={profile?.target_weight_kg ? Number(profile.target_weight_kg) : null}
        />

        <PhotoSection userId={user.id} photos={photosWithUrls} />

        {(workouts ?? []).length > 0 && (
          <div className="glass p-6 fade-up" style={{ animationDelay: "0.12s" }}>
            <h2 className="font-semibold mb-1">Strength log</h2>
            <p className="text-xs text-muted mb-4">
              Tell the coach your lifts in chat - &quot;bench 60kg 4x8&quot; - and they land here.
            </p>
            <div className="space-y-2">
              {(workouts ?? []).map((w, i) => (
                <div key={i} className="metric-tile flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">
                      {w.exercise}
                      {w.is_pr && (
                        <span className="ml-2 text-[9px] uppercase tracking-wide font-bold text-warning bg-warning/15 border border-warning/30 rounded-full px-2 py-0.5">
                          PR
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-muted">{w.logged_on}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold font-mono">
                      {w.weight_kg != null ? `${w.weight_kg}kg` : "-"} x {w.sets ?? "?"}x{w.reps ?? "?"}
                    </p>
                    {w.est_1rm != null && (
                      <p className="text-[11px] text-muted">e1RM {Math.round(Number(w.est_1rm))}kg</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <NotificationsCard />
          {profile?.sync_token && <StepsSyncCard syncToken={profile.sync_token} />}
        </div>
      </main>
    </div>
  );
}
