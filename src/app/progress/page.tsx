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

  const [{ data: profile }, { data: weights }, { data: photos }] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, avatar_url, weight_kg, target_weight_kg, sync_token")
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
      <Nav avatarUrl={profile?.avatar_url ?? null} name={profile?.full_name ?? null} active="progress" />

      <main className="max-w-5xl mx-auto px-4 pt-5 pb-28 md:py-8 space-y-5 md:space-y-6">
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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <NotificationsCard />
          {profile?.sync_token && <StepsSyncCard syncToken={profile.sync_token} />}
        </div>
      </main>
    </div>
  );
}
