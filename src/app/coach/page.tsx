import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Nav } from "@/components/nav";
import { CoachChat } from "@/components/coach/chat";
import { todayStr } from "@/lib/dates";

export default async function CoachPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const today = todayStr();

  const [{ data: profile }, { data: conversations }, { data: todayCheckinMsg }] =
    await Promise.all([
      supabase.from("profiles").select("full_name, avatar_url, theme").eq("id", user.id).single(),
      supabase
        .from("coach_conversations")
        .select("id, title, updated_at")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false })
        .limit(100),
      supabase
        .from("coach_messages")
        .select("id, conversation_id")
        .eq("user_id", user.id)
        .eq("kind", "daily_checkin")
        .gte("created_at", `${today}T00:00:00+05:30`)
        .limit(1)
        .maybeSingle(),
    ]);

  const needsDailyCheckin = !todayCheckinMsg;

  // Open the most recent thread (like ChatGPT resuming) unless the day's
  // check-in is pending, then start fresh so the coach opens the day.
  const openConvId = needsDailyCheckin
    ? null
    : (todayCheckinMsg?.conversation_id ?? conversations?.[0]?.id ?? null);

  const { data: initialMessages } = openConvId
    ? await supabase
        .from("coach_messages")
        .select("role, content, kind")
        .eq("conversation_id", openConvId)
        .order("created_at", { ascending: true })
        .limit(100)
    : { data: [] };

  return (
    <div className="flex-1 flex flex-col">
      <Nav
        avatarUrl={profile?.avatar_url ?? null}
        name={profile?.full_name ?? null}
        active="coach"
        theme={profile?.theme}
      />
      <CoachChat
        conversations={conversations ?? []}
        initialConversationId={openConvId}
        initialMessages={initialMessages ?? []}
        needsDailyCheckin={needsDailyCheckin}
      />
    </div>
  );
}
