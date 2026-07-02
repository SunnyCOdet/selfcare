import { NextResponse } from "next/server";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import webpush from "web-push";
import { generateJSON, aiConfigured } from "@/lib/ai/provider";
import { PLAN_UPDATER_SYSTEM, isValidPlan, savePlanVersion } from "@/lib/ai/plan";
import { computeReadiness } from "@/lib/readiness";
import { todayStr, todayWeekday, currentHour, nowStr } from "@/lib/dates";
import type { TransformationPlan } from "@/lib/types";

/**
 * The agent's autonomous loop, invoked by Vercel Cron (and optionally a
 * higher-frequency pg_cron tick):
 *  - morning: AI-authored daily brief (or silence if nothing worth saying)
 *  - evening: AI-authored nudge (streak risk, steps gap, milestone deadlines)
 *  - Sunday evening: reviews the week's adherence and REWRITES THE PLAN itself
 *  - every run: delivers due self-scheduled follow-up pings
 * All sends are idempotent via notification_log (one per kind per day).
 */

export const maxDuration = 300;

function admin() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

type Sub = { user_id: string; endpoint: string; keys: { p256dh: string; auth: string } };

async function sendPush(db: SupabaseClient, sub: Sub, payload: Record<string, string>) {
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: sub.keys },
      JSON.stringify(payload)
    );
    return true;
  } catch (e: unknown) {
    const status = (e as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) {
      await db.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
    }
    return false;
  }
}

/** Claim a once-per-day slot; false if already sent today. */
async function claim(db: SupabaseClient, userId: string, kind: string): Promise<boolean> {
  const { error } = await db
    .from("notification_log")
    .insert({ user_id: userId, kind, sent_on: todayStr() });
  return !error; // unique violation -> already claimed
}

async function gatherUserData(db: SupabaseClient, userId: string) {
  const today = todayStr();
  const [{ data: planRow }, { data: streak }, { data: checkins }, { data: goals }, { data: foods }] =
    await Promise.all([
      db
        .from("transformation_plans")
        .select("plan, version")
        .eq("user_id", userId)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      db.from("streaks").select("*").eq("user_id", userId).maybeSingle(),
      db
        .from("daily_checkins")
        .select("checkin_date, steps, completion_pct, sleep_hours, water_liters, heart_rate_avg, weight_kg")
        .eq("user_id", userId)
        .order("checkin_date", { ascending: false })
        .limit(14),
      db
        .from("goals")
        .select("title, category, target_value, current_value, deadline, milestones")
        .eq("user_id", userId)
        .eq("status", "active"),
      db
        .from("food_logs")
        .select("calories, protein_g")
        .eq("user_id", userId)
        .eq("log_date", today),
    ]);

  const plan = (planRow?.plan ?? null) as TransformationPlan | null;
  return {
    plan,
    planVersion: planRow?.version ?? 0,
    streak,
    checkins: checkins ?? [],
    goals: goals ?? [],
    todayFood: {
      calories: (foods ?? []).reduce((s, f) => s + (f.calories ?? 0), 0),
      protein: (foods ?? []).reduce((s, f) => s + (f.protein_g ?? 0), 0),
    },
    readiness: computeReadiness(checkins ?? []),
  };
}

const NOTIFY_SYSTEM = `You are "Coach", the AI agent inside the Ascend transformation app, deciding whether to send your client a push notification right now — and writing it if so.

Rules:
- Send ONLY if you have something genuinely worth their attention. If they're on track and there's nothing sharp to say, stay silent (send: false).
- Morning slot: a punchy brief for the day — today's training focus, steps, readiness-based intensity call, the goal milestone that matters most today. Max ~15 words in the body.
- Evening slot: streak-saving nudges (steps far from 20k, day incomplete), or a milestone deadline within 3 days. If they've already crushed the day, either stay silent or send one short congratulation (rarely).
- Voice: their coach texting them. Direct, personal, uses their real numbers. No corporate fluff. 1 emoji max.

Respond with JSON: {"send": boolean, "title": string, "body": string}`;

async function aiNotification(
  slot: "morning" | "evening",
  data: Awaited<ReturnType<typeof gatherUserData>>
): Promise<{ send: boolean; title: string; body: string } | null> {
  try {
    return await generateJSON<{ send: boolean; title: string; body: string }>(
      NOTIFY_SYSTEM,
      `SLOT: ${slot} — CURRENT TIME: ${nowStr()}
CLIENT DATA:
${JSON.stringify(
  {
    streak: data.streak,
    last_14_days: data.checkins,
    today_food: data.todayFood,
    readiness: data.readiness,
    goals: data.goals,
    steps_target: data.plan?.steps_target ?? 20000,
    today_workout: data.plan?.workout_plan?.days?.find(
      (d) => d.day.toLowerCase() === todayWeekday().toLowerCase()
    ),
    daily_non_negotiables: data.plan?.daily_non_negotiables,
  },
  null,
  1
)}

Decide and write the ${slot} notification now.`
    );
  } catch (e) {
    console.error("aiNotification failed:", e);
    return null;
  }
}

const WEEKLY_REVIEW_SYSTEM = `You are "Coach", the AI agent that manages your client's transformation plan. It's Sunday night — review the week's ACTUAL adherence data and decide whether the plan needs adjusting for next week.

Adjust when the data says so, e.g.:
- consistently missed morning sessions → move training time
- calories over target most days → adjust targets or meals to be more realistic
- steps chronically short → restructure the schedule to make step blocks explicit
- sleep chronically short → earlier wind-down, later sessions
- everything crushed → consider progressing (volume up, next activity milestone)
If the week was solid and the plan fits, do NOT change it.

Respond with JSON: {"needs_change": boolean, "instructions": string, "message": string}
- instructions: precise change instructions for the plan rewriter (empty if no change)
- message: what you'll tell the client — reference their real numbers ("you were over calories 4 of 7 days"). If no change: a short weekly verdict instead. Max 120 words.`;

async function weeklyAdapt(db: SupabaseClient, userId: string, data: Awaited<ReturnType<typeof gatherUserData>>) {
  const decision = await generateJSON<{ needs_change: boolean; instructions: string; message: string }>(
    WEEKLY_REVIEW_SYSTEM,
    `WEEK DATA (newest first):
${JSON.stringify({ checkins: data.checkins.slice(0, 7), streak: data.streak, goals: data.goals, current_plan_summary: { calories: data.plan?.nutrition?.daily_calories, split: data.plan?.workout_plan?.split_name, gym_days: data.plan?.workout_plan?.gym_days_per_week, non_negotiables: data.plan?.daily_non_negotiables } }, null, 1)}

Decide now.`
  );

  let changed = false;
  if (decision.needs_change && decision.instructions && data.plan) {
    const newPlan = await generateJSON<TransformationPlan>(
      PLAN_UPDATER_SYSTEM,
      `CLIENT WEEK DATA:\n${JSON.stringify(data.checkins.slice(0, 7), null, 1)}\n\nCURRENT PLAN:\n${JSON.stringify(data.plan, null, 1)}\n\nCHANGE INSTRUCTIONS FROM COACH:\n${decision.instructions}\n\nReturn the full updated JSON plan now.`
    );
    if (isValidPlan(newPlan)) {
      await savePlanVersion(db, userId, newPlan);
      changed = true;
    }
  }

  // Drop the review into a fresh coach conversation
  const { data: conv } = await db
    .from("coach_conversations")
    .insert({ user_id: userId, title: `Weekly review — ${todayStr()}` })
    .select("id")
    .single();
  await db.from("coach_messages").insert({
    user_id: userId,
    role: "coach",
    kind: "weekly_review",
    conversation_id: conv?.id ?? null,
    content: decision.message + (changed ? "\n\n✅ Plan updated for next week — check the Plan tab." : ""),
  });

  return { changed, message: decision.message };
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
  const slotParam = searchParams.get("slot");
  const hour = currentHour();
  // tick mode figures out the slot from IST time; explicit slots still work
  const doMorning = slotParam === "morning" || (slotParam === "tick" && hour >= 6 && hour < 12);
  const doEvening = slotParam === "evening" || (slotParam === "tick" && hour >= 18 && hour < 23);
  const doWeekly = todayWeekday() === "Sunday" && (doEvening || slotParam === "weekly");

  const db = admin();
  const results = { pings: 0, morning: 0, evening: 0, weekly: 0 };

  // ---- 1. Due self-scheduled follow-ups (every run) ----
  const { data: duePings } = await db
    .from("scheduled_pings")
    .select("id, user_id, message")
    .eq("sent", false)
    .lte("send_at", new Date().toISOString())
    .limit(50);

  const { data: allSubs } = await db.from("push_subscriptions").select("user_id, endpoint, keys");
  const subsByUser = new Map<string, Sub[]>();
  for (const s of (allSubs ?? []) as Sub[]) {
    subsByUser.set(s.user_id, [...(subsByUser.get(s.user_id) ?? []), s]);
  }

  for (const ping of duePings ?? []) {
    await db.from("scheduled_pings").update({ sent: true }).eq("id", ping.id);
    for (const s of subsByUser.get(ping.user_id) ?? []) {
      if (await sendPush(db, s, { title: "Coach ⏰", body: ping.message, url: "/coach", tag: `ping-${ping.id}` })) {
        results.pings++;
      }
    }
  }

  // ---- 2. AI-authored briefs / nudges / weekly adaptation ----
  if ((doMorning || doEvening || doWeekly) && aiConfigured()) {
    for (const [userId, userSubs] of subsByUser) {
      const data = await gatherUserData(db, userId);
      if (!data.plan) continue;

      if (doWeekly && (await claim(db, userId, "weekly_adapt"))) {
        try {
          const { changed } = await weeklyAdapt(db, userId, data);
          for (const s of userSubs) {
            await sendPush(db, s, {
              title: changed ? "Your plan just evolved 🧠" : "Your week, reviewed",
              body: changed
                ? "I reviewed your week and adjusted next week's plan. See what changed."
                : "Weekly review is in — open the coach.",
              url: "/coach",
              tag: "weekly-adapt",
            });
          }
          results.weekly++;
        } catch (e) {
          console.error("weekly adapt failed:", e);
        }
      }

      const slot = doMorning ? "morning" : doEvening ? "evening" : null;
      if (slot && (await claim(db, userId, slot))) {
        const note = await aiNotification(slot, data);
        if (note?.send && note.title && note.body) {
          for (const s of userSubs) {
            if (await sendPush(db, s, { title: note.title.slice(0, 60), body: note.body.slice(0, 180), url: "/dashboard", tag: slot })) {
              results[slot]++;
            }
          }
        }
      }
    }
  }

  return NextResponse.json({ ok: true, ...results });
}
