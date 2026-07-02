import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Nav } from "@/components/nav";
import { CoachChat } from "@/components/coach/chat";

export default async function CoachPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const today = new Date().toISOString().slice(0, 10);

  const [{ data: profile }, { data: messages }, { data: todayCheckinMsg }] = await Promise.all([
    supabase.from("profiles").select("full_name, avatar_url").eq("id", user.id).single(),
    supabase
      .from("coach_messages")
      .select("role, content, kind, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("coach_messages")
      .select("id")
      .eq("user_id", user.id)
      .eq("kind", "daily_checkin")
      .gte("created_at", `${today}T00:00:00Z`)
      .limit(1)
      .maybeSingle(),
  ]);

  return (
    <div className="flex-1 flex flex-col">
      <Nav avatarUrl={profile?.avatar_url ?? null} name={profile?.full_name ?? null} active="coach" />
      <CoachChat
        initialMessages={(messages ?? []).reverse()}
        needsDailyCheckin={!todayCheckinMsg}
      />
    </div>
  );
}
