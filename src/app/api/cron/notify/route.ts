import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import webpush from "web-push";
import type { TransformationPlan } from "@/lib/types";
import { todayStr, todayWeekday } from "@/lib/dates";

/**
 * Scheduled coach notifications, invoked by Vercel Cron:
 *  ?slot=morning — daily brief: today's plan + next goal milestone + streak
 *  ?slot=evening — steps nudge if the 20k target isn't hit yet
 * Requires SUPABASE_SERVICE_ROLE_KEY (reads all subscribed users) and VAPID keys.
 */

export const maxDuration = 60;

function admin() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

type Sub = { user_id: string; endpoint: string; keys: { p256dh: string; auth: string } };

async function send(sub: Sub, payload: Record<string, string>) {
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: sub.keys },
      JSON.stringify(payload)
    );
    return true;
  } catch (e: unknown) {
    const status = (e as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) {
      // stale subscription — clean it up
      await admin().from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
    }
    return false;
  }
}

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.VAPID_PRIVATE_KEY) {
    return NextResponse.json(
      { error: "Notifications not configured (need SUPABASE_SERVICE_ROLE_KEY + VAPID keys)" },
      { status: 503 }
    );
  }

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:coach@ascend.app",
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  );

  const { searchParams } = new URL(req.url);
  const slot = searchParams.get("slot") === "evening" ? "evening" : "morning";
  const db = admin();
  const today = todayStr();

  const { data: subs } = await db.from("push_subscriptions").select("user_id, endpoint, keys");
  if (!subs || subs.length === 0) return NextResponse.json({ ok: true, sent: 0 });

  const byUser = new Map<string, Sub[]>();
  for (const s of subs as Sub[]) {
    byUser.set(s.user_id, [...(byUser.get(s.user_id) ?? []), s]);
  }

  let sent = 0;
  for (const [userId, userSubs] of byUser) {
    const [{ data: planRow }, { data: streak }, { data: checkin }, { data: goals }] =
      await Promise.all([
        db
          .from("transformation_plans")
          .select("plan")
          .eq("user_id", userId)
          .eq("status", "active")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        db.from("streaks").select("current_streak").eq("user_id", userId).maybeSingle(),
        db
          .from("daily_checkins")
          .select("steps, completion_pct")
          .eq("user_id", userId)
          .eq("checkin_date", today)
          .maybeSingle(),
        db
          .from("goals")
          .select("title, milestones")
          .eq("user_id", userId)
          .eq("status", "active")
          .order("created_at", { ascending: true })
          .limit(1),
      ]);

    const plan = planRow?.plan as TransformationPlan | undefined;
    const stepsTarget = plan?.steps_target ?? 20000;
    const streakN = streak?.current_streak ?? 0;
    let payload: Record<string, string> | null = null;

    if (slot === "morning") {
      const dayName = todayWeekday();
      const workout = plan?.workout_plan?.days?.find(
        (d) => d.day.toLowerCase() === dayName.toLowerCase()
      );
      const goal = goals?.[0];
      const nextMs = (goal?.milestones as { title: string; status?: string }[] | undefined)?.find(
        (m) => m.status !== "done"
      );
      const parts = [
        workout ? `${workout.focus} day` : "Active recovery",
        `${stepsTarget.toLocaleString()} steps`,
      ];
      if (nextMs) parts.push(`goal: ${nextMs.title.slice(0, 40)}`);
      payload = {
        title: streakN > 0 ? `Day ${streakN + 1} starts now 🔥` : "Today's mission",
        body: parts.join(" · "),
        url: "/dashboard",
        tag: "morning-brief",
      };
    } else {
      const steps = checkin?.steps ?? 0;
      if (steps < stepsTarget) {
        const remaining = stepsTarget - steps;
        payload = {
          title: remaining > 8000 ? "Steps check — big gap ⚠️" : "Almost there 🚶",
          body:
            `${remaining.toLocaleString()} steps left today` +
            (streakN > 0 ? ` — don't break the ${streakN}-day streak.` : " — evening walk time."),
          url: "/dashboard",
          tag: "evening-nudge",
        };
      }
    }

    if (payload) {
      for (const s of userSubs) {
        if (await send(s, payload)) sent++;
      }
    }
  }

  return NextResponse.json({ ok: true, slot, sent });
}
