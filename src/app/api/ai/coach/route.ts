import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateJSON, generatePlanJSON, streamJSON, parseModelJson, aiConfigured } from "@/lib/ai/provider";
import { buildUserContext } from "@/lib/ai/context";

export const maxDuration = 300;
import { PLAN_UPDATER_SYSTEM, isValidPlan, savePlanVersion } from "@/lib/ai/plan";
import { paypalConfigured, paypalTransactions, incomingPayments } from "@/lib/paypal";
import { todayStr } from "@/lib/dates";
import { PRESET_THEMES, sanitizeThemeVars, THEME_VAR_KEYS } from "@/lib/themes";
import type { TransformationPlan } from "@/lib/types";

const PERSONA = `You are "Jarvis", an elite personal transformation AGENT inside the Ascend app — not just an advisor. You can directly modify the client's plan and the app itself. Your client is on a face + body transformation journey toward a modeling-level physique, but you manage their whole routine and goals.

Personality: direct, warm, motivating, zero fluff. Short, confident sentences — the voice of a world-class coach and operator. Strictly professional: never use emojis, emoticons, or decorative symbols in any reply. Push the client, never shame them. Acknowledge wins plainly and specifically.

## Your powers (actions)

You can attach ONE action to any reply. Use an action whenever the client asks you to change something — never just describe what they could change, DO it.

1. "update_plan" — rewrites their transformation plan. Use for ANY plan change:
   - nutrition phase changes (cut → recomp → bulk), specific calorie/macro targets
   - workout split, gym days, adding/removing activities
   - schedule restructuring (new wake time, job change, exam season, travel)
   - skincare/grooming/sleep changes
   - broader life-routine goals (deep work blocks, reading, meditation, CEO-morning-routine) — the plan's weekly_schedule and daily_non_negotiables can hold any routine, not just fitness
   Set: {"type": "update_plan", "instructions": "<precise, complete instructions for the plan rewriter — include exact numbers the client gave>"}

2. "switch_theme" — changes the app's visual template. Presets: ${Object.entries(PRESET_THEMES)
  .map(([k, t]) => `"${k}" (${t.description})`)
  .join(", ")}.
   Set: {"type": "switch_theme", "theme": "<preset key>"}

3. "create_theme" — design a NEW template when no preset fits the vibe the client asks for (e.g. "cyberpunk", "rose gold", "stealth wealth"). You choose the palette. Rules: dark background (very dark, near-black — the UI chrome assumes dark), high contrast foreground, all values valid hex colors. Variables you may set: ${THEME_VAR_KEYS.join(", ")}.
   Set: {"type": "create_theme", "name": "<Template Name>", "vars": {"--background": "#0a0a0f", ...}}

4. "create_goal" — you manage the client's LIFE GOALS, not just fitness: income ("$10k/month"), career ("sign with a modeling agency"), skills, anything. BEFORE creating, interview them across a few messages like a strategist: the goal + why, deadline, current baseline, existing skills/assets/contacts, hours/week available. THEN create it with a milestone roadmap (4-8 concrete milestones with deadlines, each a real deliverable — "first paying client", not "work harder").
   Set: {"type": "create_goal", "goal": {"title": string, "why": string, "category": "income"|"career"|"skill"|"body"|"life", "target_metric": string|null, "target_value": number|null, "current_value": number, "deadline": "YYYY-MM-DD"|null, "hours_per_week": number|null, "milestones": [{"title": string, "deadline": "YYYY-MM-DD"|null, "status": "pending"}]}}
   After creating a goal, usually also suggest an update_plan to weave its weekly hours into their schedule (but only do BOTH when they agree).

5. "update_goal" — log progress or change a goal when the client reports anything ("closed a ₹40k client", "hit 5k followers", "pause the agency goal"). Set: {"type": "update_goal", "goal_title": "<title, close match ok>", "progress_note": string, "new_value": number|null, "milestone_done": "<milestone title if one was completed>"|null, "status": "active"|"achieved"|"paused"|"dropped"|null}

6. "remember" — save a durable fact you'll want in future conversations (injury, preference, person, win, fear). Use liberally whenever the client reveals something lasting. Set: {"type": "remember", "category": "preference"|"fact"|"person"|"win"|"struggle", "content": "<one clear sentence>"}

7. "log_workout" — when the client reports lifts ("bench 60kg 4x8, squats 80 for 5x5"), log every entry. You can see their recent_workouts history — call out PRs and stalls, prescribe the next progression. Set: {"type": "log_workout", "entries": [{"exercise": string, "weight_kg": number, "sets": number, "reps": number, "notes": string|null}]}

8. "create_tracker" — when the client wants to track a new daily habit ("track my pages read"), create it; it appears in their daily checklist automatically. Set: {"type": "create_tracker", "name": string, "emoji": string, "unit": string|null, "target_value": number|null}

9. "schedule_ping" — when the client defers something ("I'll walk after lunch") or you want to follow up, schedule a push notification to their phone. Set: {"type": "schedule_ping", "minutes_from_now": number (5-10080), "message": "<the notification text, direct and short>"} and tell them when you'll check in.

10. "revert_plan" — restore the previous plan version when the client asks to undo a plan change. Set: {"type": "revert_plan"}

11. "web_search" — when a question needs live real-world facts (prices, agencies, casting calls, current rates, product comparisons), search the web instead of guessing. Set: {"type": "web_search", "query": "<focused search query>"} — you'll receive the results and answer in the same turn.

12. "paypal_query" — the client's PayPal business account is connected. Whenever they ask ANYTHING about their PayPal money (payments received, who paid, pending amounts, refunds, history, totals), pull the live data instead of guessing. Set: {"type": "paypal_query", "days": number (1-31, default 30)} — you'll receive the transactions and answer in the same turn.

13. "paypal_sync" — import this month's PayPal payments into the income ledger + revenue chart (safe: already-tracked payments are skipped). Use when they ask to sync/backfill/pull PayPal revenue into the app. Set: {"type": "paypal_sync"}

Rules:
- CLIENT CONTEXT includes "current_time" — the client's EXACT current local date and time. Trust it completely; never guess or estimate the time. Use it naturally: it's 2 AM → address the late night (and what it does to tomorrow); "ping me at 6 PM" → compute minutes_from_now from current_time; morning vs evening tone.
- Only act when the client clearly requests a change or explicitly agrees to your suggestion (exception: "remember" — use whenever something durable comes up).
- In your reply, confirm concretely what you changed ("Done — recomp at 2400 kcal, protein stays at 170g...").
- You have the client's full context (profile, plan, streak, last 7 days, today's food, goals with milestones, recent goal progress, and your saved memories). USE IT — reference real numbers and stale milestones. Never generic advice when specific is possible.
- Keep replies under 150 words unless they ask for detail.
- Never prescribe medication or diagnose. Pain/injury beyond soreness → see a professional.

Respond with JSON: {"reply": string, "conversation_title": string, "action": null | {"type": "update_plan", "instructions": string} | {"type": "switch_theme", "theme": string} | {"type": "create_theme", "name": string, "vars": object} | {"type": "create_goal", "goal": object} | {"type": "update_goal", "goal_title": string, "progress_note": string, "new_value": number|null, "milestone_done": string|null, "status": string|null} | {"type": "remember", "category": string, "content": string} | {"type": "log_workout", "entries": array} | {"type": "create_tracker", "name": string, "emoji": string, "unit": string|null, "target_value": number|null} | {"type": "schedule_ping", "minutes_from_now": number, "message": string} | {"type": "revert_plan"} | {"type": "web_search", "query": string} | {"type": "paypal_query", "days": number} | {"type": "paypal_sync"}}

conversation_title: a 2-5 word title for this conversation (like ChatGPT's sidebar titles) — set it ONLY when the conversation history is empty (first exchange); otherwise use "".`;

const CHECKIN_INSTRUCTION = `This is the proactive DAILY CHECK-IN you initiate each day. This covers their WHOLE life — body AND goals. Look at yesterday's and recent data:
- If they crushed it, open by acknowledging it specifically.
- If they missed steps/tasks/sleep, mention it directly but constructively.
- Check their goals: any milestone with no progress logged recently or a deadline approaching? Call it out by name ("the portfolio milestone hasn't moved in 9 days").
- Then ask 2-3 sharp check-in questions about today (energy, plan for steps, and at least one about their top goal's next milestone).
Keep it under 130 words total. action must be null.`;

const REVIEW_INSTRUCTION = `This is a WEEKLY REVIEW the client requested. Analyze the last 7 days of data: average steps vs 20k target, completion %, sleep, food logs, streak. Give:
1. A headline verdict (one line)
2. 2-3 specific wins
3. 2-3 specific gaps with the fix for each
4. One focus for next week
Keep it under 220 words, formatted with short lines. action must be null unless they asked for a change.`;

const UPDATER_SYSTEM = PLAN_UPDATER_SYSTEM;

type Milestone = { title: string; deadline?: string | null; status?: string };

type CoachAction =
  | { type: "update_plan"; instructions: string }
  | { type: "switch_theme"; theme: string }
  | { type: "create_theme"; name: string; vars: Record<string, string> }
  | {
      type: "create_goal";
      goal: {
        title: string;
        why?: string;
        category?: string;
        target_metric?: string | null;
        target_value?: number | null;
        current_value?: number;
        deadline?: string | null;
        hours_per_week?: number | null;
        milestones?: Milestone[];
      };
    }
  | {
      type: "update_goal";
      goal_title: string;
      progress_note?: string;
      new_value?: number | null;
      milestone_done?: string | null;
      status?: string | null;
    }
  | { type: "remember"; category?: string; content: string }
  | {
      type: "log_workout";
      entries: { exercise: string; weight_kg?: number; sets?: number; reps?: number; notes?: string | null }[];
    }
  | { type: "create_tracker"; name: string; emoji?: string; unit?: string | null; target_value?: number | null }
  | { type: "schedule_ping"; minutes_from_now: number; message: string }
  | { type: "revert_plan" }
  | { type: "web_search"; query: string }
  | { type: "paypal_query"; days?: number }
  | { type: "paypal_sync" }
  | null;

const GOAL_CATEGORIES = ["income", "career", "skill", "body", "life"];
const GOAL_STATUSES = ["active", "achieved", "paused", "dropped"];
const MEMORY_CATEGORIES = ["preference", "fact", "person", "win", "struggle"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function cleanDate(d: unknown): string | null {
  return typeof d === "string" && DATE_RE.test(d) ? d : null;
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!aiConfigured()) {
    return NextResponse.json(
      { error: "AI provider not configured. Add GEMINI_API_KEY to your environment." },
      { status: 503 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const message: string = (body.message ?? "").toString().slice(0, 2000);
  const kind: string = ["chat", "daily_checkin", "weekly_review"].includes(body.kind)
    ? body.kind
    : "chat";
  let conversationId: string | null =
    typeof body.conversation_id === "string" && body.conversation_id ? body.conversation_id : null;

  if (kind === "chat" && !message.trim()) {
    return NextResponse.json({ error: "Empty message" }, { status: 400 });
  }

  const wantStream = body.stream === true;

  // Core flow, usable in JSON mode (emit=null) and SSE mode (emit sends
  // {t:"d"} text deltas and {t:"s"} status lines as work happens).
  const runCoach = async (emit: ((e: Record<string, unknown>) => void) | null) => {
    let reply = "";
    const push = (s: string) => {
      reply += s;
      emit?.({ t: "d", d: s });
    };

    // Validate the conversation belongs to this user (RLS would also catch it)
    if (conversationId) {
      const { data: conv } = await supabase
        .from("coach_conversations")
        .select("id")
        .eq("id", conversationId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (!conv) conversationId = null;
    }

    const [context, { data: history }] = await Promise.all([
      buildUserContext(supabase, user.id),
      conversationId
        ? supabase
            .from("coach_messages")
            .select("role, content")
            .eq("user_id", user.id)
            .eq("conversation_id", conversationId)
            .order("created_at", { ascending: false })
            .limit(20)
        : Promise.resolve({ data: [] as { role: string; content: string }[] }),
    ]);

    const conversation = (history ?? [])
      .reverse()
      .map((m) => `${m.role === "user" ? "CLIENT" : "COACH"}: ${m.content}`)
      .join("\n");

    let instruction = "";
    if (kind === "daily_checkin") instruction = CHECKIN_INSTRUCTION;
    if (kind === "weekly_review") instruction = REVIEW_INSTRUCTION;

    const userPrompt = `CURRENT TIME: ${context.current_time}

CLIENT CONTEXT (live data):
${JSON.stringify(context, null, 2)}

RECENT CONVERSATION:
${conversation || "(no prior messages)"}

${instruction ? `SPECIAL INSTRUCTION:\n${instruction}\n` : ""}${
      message.trim() ? `CLIENT'S NEW MESSAGE:\n${message}` : ""
    }

Reply as Jarvis now.`;

    type CoachResult = { reply: string; conversation_title?: string; action?: CoachAction };
    let result: CoachResult;
    if (emit) {
      // True token streaming: reply text deltas flow to the client as the
      // model writes them; the full JSON is parsed after for actions.
      const raw = await streamJSON(PERSONA, userPrompt, (d) => emit({ t: "d", d }));
      result = parseModelJson<CoachResult>(raw);
    } else {
      result = await generateJSON<CoachResult>(PERSONA, userPrompt);
    }
    reply = result.reply;
    const action = result.action ?? null;

    let planUpdated = false;
    let themeUpdated = false;
    let goalUpdated = false;
    let memorySaved = false;
    let workoutLogged = false;
    let trackerUpdated = false;
    let pingScheduled = false;
    let planVersion: number | null = null;

    // ---- Execute the agent's action ----
    if (action?.type === "update_plan" && action.instructions) {
      try {
        const { data: planRow } = await supabase
          .from("transformation_plans")
          .select("plan")
          .eq("user_id", user.id)
          .eq("status", "active")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        const updaterPrompt = `CLIENT CONTEXT:
${JSON.stringify(context, null, 2)}

CURRENT PLAN:
${JSON.stringify(planRow?.plan ?? "(no plan yet — write a fresh one)", null, 2)}

CHANGE INSTRUCTIONS FROM COACH:
${action.instructions}

Return the full updated JSON plan now.`;

        emit?.({ t: "s", s: "Rebuilding your plan…" });
        const newPlan = await generatePlanJSON<TransformationPlan>(UPDATER_SYSTEM, updaterPrompt);
        if (!isValidPlan(newPlan)) throw new Error("rewriter returned incomplete plan");

        planVersion = await savePlanVersion(supabase, user.id, newPlan);
        planUpdated = true;
        push(`\n\nPlan updated — now on v${planVersion}. Check the Plan tab.`);
      } catch (e) {
        console.error("plan update failed:", e);
        push(`\n\nI couldn't apply the plan update (${e instanceof Error ? e.message : "error"}). Try asking again.`);
      }
    } else if (action?.type === "switch_theme") {
      const preset = PRESET_THEMES[(action.theme ?? "").toLowerCase()];
      if (preset) {
        const { error: themeErr } = await supabase
          .from("profiles")
          .update({ theme: { name: preset.name, vars: preset.vars } })
          .eq("id", user.id);
        if (!themeErr) {
          themeUpdated = true;
          push(`\n\n"${preset.name}" template applied.`);
        }
      } else {
        push(`\n\nI don't have a "${action.theme}" preset — ask me to create it as a custom template.`);
      }
    } else if (action?.type === "create_theme") {
      const vars = sanitizeThemeVars(action.vars);
      const name = (action.name ?? "Custom").toString().slice(0, 40);
      if (vars) {
        const { error: themeErr } = await supabase
          .from("profiles")
          .update({ theme: { name, vars } })
          .eq("id", user.id);
        if (!themeErr) {
          themeUpdated = true;
          push(`\n\nCustom "${name}" template created and applied.`);
        }
      } else {
        push(`\n\nThe template I designed didn't pass validation — ask me to try again.`);
      }
    } else if (action?.type === "create_goal" && action.goal?.title) {
      try {
        const g = action.goal;
        const milestones = (Array.isArray(g.milestones) ? g.milestones : [])
          .filter((m) => m && typeof m.title === "string")
          .slice(0, 12)
          .map((m) => ({
            title: m.title.slice(0, 200),
            deadline: cleanDate(m.deadline),
            status: "pending",
          }));
        const { error: goalErr } = await supabase.from("goals").insert({
          user_id: user.id,
          title: g.title.slice(0, 200),
          why: g.why?.slice(0, 500) ?? null,
          category: GOAL_CATEGORIES.includes(g.category ?? "") ? g.category : "life",
          target_metric: g.target_metric?.slice(0, 100) ?? null,
          target_value: typeof g.target_value === "number" ? g.target_value : null,
          current_value: typeof g.current_value === "number" ? g.current_value : 0,
          deadline: cleanDate(g.deadline),
          hours_per_week: typeof g.hours_per_week === "number" ? g.hours_per_week : null,
          milestones,
        });
        if (goalErr) throw new Error(goalErr.message);
        goalUpdated = true;
        push(`\n\nGoal locked in with ${milestones.length} milestones.`);
      } catch (e) {
        console.error("create_goal failed:", e);
        push(`\n\nI couldn't save the goal — try again.`);
      }
    } else if (action?.type === "update_goal" && action.goal_title) {
      try {
        const { data: goal } = await supabase
          .from("goals")
          .select("id, title, current_value, milestones")
          .eq("user_id", user.id)
          .ilike("title", `%${action.goal_title.slice(0, 100)}%`)
          .limit(1)
          .maybeSingle();
        if (!goal) throw new Error(`no goal matching "${action.goal_title}"`);

        const updates: Record<string, unknown> = {};
        if (typeof action.new_value === "number") updates.current_value = action.new_value;
        if (action.status && GOAL_STATUSES.includes(action.status)) updates.status = action.status;
        if (action.milestone_done) {
          const ms = (goal.milestones as Milestone[]).map((m) =>
            m.title.toLowerCase().includes(action.milestone_done!.toLowerCase())
              ? { ...m, status: "done" }
              : m
          );
          updates.milestones = ms;
        }
        if (Object.keys(updates).length > 0) {
          const { error: upErr } = await supabase.from("goals").update(updates).eq("id", goal.id);
          if (upErr) throw new Error(upErr.message);
        }
        if (action.progress_note) {
          await supabase.from("goal_progress").insert({
            goal_id: goal.id,
            user_id: user.id,
            note: action.progress_note.slice(0, 500),
            new_value: typeof action.new_value === "number" ? action.new_value : null,
            milestone: action.milestone_done?.slice(0, 200) ?? null,
          });
        }
        goalUpdated = true;
        push(`\n\nProgress logged on "${goal.title}".`);
      } catch (e) {
        console.error("update_goal failed:", e);
        push(`\n\nCouldn't log that against a goal (${e instanceof Error ? e.message : "error"}).`);
      }
    } else if (action?.type === "remember" && action.content) {
      const { error: memErr } = await supabase.from("agent_memories").insert({
        user_id: user.id,
        category: MEMORY_CATEGORIES.includes(action.category ?? "") ? action.category : "fact",
        content: action.content.slice(0, 500),
      });
      if (!memErr) memorySaved = true;
    } else if (action?.type === "log_workout" && Array.isArray(action.entries)) {
      try {
        const prNames: string[] = [];
        for (const e of action.entries.slice(0, 12)) {
          if (!e?.exercise) continue;
          const weight = typeof e.weight_kg === "number" ? e.weight_kg : null;
          const reps = typeof e.reps === "number" ? e.reps : null;
          // Epley estimated 1RM
          const est1rm =
            weight != null && reps != null ? Math.round(weight * (1 + reps / 30) * 10) / 10 : null;

          let isPr = false;
          if (est1rm != null) {
            const { data: best } = await supabase
              .from("workouts")
              .select("est_1rm")
              .eq("user_id", user.id)
              .ilike("exercise", e.exercise.trim())
              .order("est_1rm", { ascending: false })
              .limit(1)
              .maybeSingle();
            isPr = !best?.est_1rm || est1rm > Number(best.est_1rm);
          }
          const { error: wErr } = await supabase.from("workouts").insert({
            user_id: user.id,
            exercise: e.exercise.trim().slice(0, 80),
            weight_kg: weight,
            sets: typeof e.sets === "number" ? e.sets : null,
            reps,
            est_1rm: est1rm,
            is_pr: isPr,
            notes: e.notes?.slice(0, 200) ?? null,
          });
          if (!wErr) {
            workoutLogged = true;
            if (isPr) prNames.push(e.exercise.trim());
          }
        }
        if (workoutLogged) {
          push(`\n\nLogged.${prNames.length ? ` New personal record on ${prNames.join(", ")}.` : ""}`);
        }
      } catch (e) {
        console.error("log_workout failed:", e);
      }
    } else if (action?.type === "create_tracker" && action.name) {
      const { error: tErr } = await supabase.from("custom_trackers").insert({
        user_id: user.id,
        name: action.name.trim().slice(0, 60),
        emoji: (action.emoji ?? "").slice(0, 8),
        unit: action.unit?.slice(0, 20) ?? null,
        target_value: typeof action.target_value === "number" ? action.target_value : null,
      });
      if (!tErr) {
        trackerUpdated = true;
        push(`\n\n"${action.name.trim()}" is now on your daily checklist.`);
      }
    } else if (action?.type === "schedule_ping" && action.message) {
      const mins = Math.min(10080, Math.max(5, Math.round(Number(action.minutes_from_now) || 60)));
      const sendAt = new Date(Date.now() + mins * 60000);
      const { error: pErr } = await supabase.from("scheduled_pings").insert({
        user_id: user.id,
        send_at: sendAt.toISOString(),
        message: action.message.slice(0, 200),
      });
      if (!pErr) {
        pingScheduled = true;
        push(`\n\nI'll ping you in ${mins >= 60 ? `${Math.round(mins / 60)}h` : `${mins}min`}.`);
      }
    } else if (action?.type === "revert_plan") {
      try {
        const { data: prev } = await supabase
          .from("transformation_plans")
          .select("plan")
          .eq("user_id", user.id)
          .eq("status", "archived")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!prev?.plan) throw new Error("no previous version");
        planVersion = await savePlanVersion(supabase, user.id, prev.plan as TransformationPlan);
        planUpdated = true;
        push(`\n\nReverted — previous plan restored as v${planVersion}.`);
      } catch (e) {
        push(`\n\nCouldn't revert (${e instanceof Error ? e.message : "error"}).`);
      }
    } else if (action?.type === "web_search" && action.query) {
      if (!process.env.TAVILY_API_KEY) {
        push(`\n\nI can't search the web yet — add a TAVILY_API_KEY (free at tavily.com) and I'll have live search.`);
      } else {
        try {
          emit?.({ t: "s", s: "Searching the web…" });
          const sRes = await fetch("https://api.tavily.com/search", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              api_key: process.env.TAVILY_API_KEY,
              query: action.query.slice(0, 300),
              max_results: 5,
              include_answer: true,
            }),
          });
          if (!sRes.ok) throw new Error(`search ${sRes.status}`);
          const sData = await sRes.json();
          const findings = JSON.stringify({
            answer: sData.answer,
            results: (sData.results ?? []).map((r: { title: string; url: string; content: string }) => ({
              title: r.title,
              url: r.url,
              snippet: (r.content ?? "").slice(0, 300),
            })),
          });
          const followUp = await generateJSON<{ reply: string }>(
            PERSONA,
            `${userPrompt}\n\nWEB SEARCH RESULTS for "${action.query}":\n${findings}\n\nNow answer the client's question using these results. Cite specifics. action must be null. Reply as Jarvis.`
          );
          push("\n\n" + followUp.reply);
        } catch (e) {
          console.error("web_search failed:", e);
          push(`\n\nSearch failed — answering from what I know.`);
        }
      }
    } else if (action?.type === "paypal_query") {
      if (!paypalConfigured()) {
        push(`\n\nPayPal isn't connected on the server yet.`);
      } else {
        try {
          emit?.({ t: "s", s: "Checking PayPal…" });
          const days = Math.min(31, Math.max(1, Number(action.days) || 30));
          const txs = await paypalTransactions(days);
          const summary = txs.slice(0, 80).map((t) => ({
            date: t.date?.slice(0, 10),
            amount: t.amount,
            currency: t.currency,
            status: t.status,
            payer: t.payer,
          }));
          const followUp = await generateJSON<{ reply: string }>(
            PERSONA,
            `${userPrompt}\n\nLIVE PAYPAL TRANSACTIONS (last ${days} days; status S=success P=pending D=denied V=reversed; positive = money IN, negative = money out. IMPORTANT: rows with NO payer name are PayPal internal currency conversions or balance transfers — they are NOT revenue and NOT fees; ignore them or mention them only as conversions. Only payer-named positive rows are client payments.):\n${JSON.stringify(summary)}\n\nAnswer the client's question using this real data — specific amounts, dates, payers, totals. action must be null. Reply as Jarvis.`
          );
          push("\n\n" + followUp.reply);
        } catch (e) {
          const msg = e instanceof Error ? e.message : "PayPal query failed";
          reply += msg.includes("PERMISSION_PENDING")
            ? `\n\nPayPal history access was just enabled and their side is still propagating it (can take a few hours). Ask me again later.`
            : `\n\nCouldn't reach PayPal (${msg.slice(0, 120)}).`;
        }
      }
    } else if (action?.type === "paypal_sync") {
      if (!paypalConfigured()) {
        push(`\n\nPayPal isn't connected on the server yet.`);
      } else {
        try {
          const txs = incomingPayments(await paypalTransactions(31));
          const month = todayStr().slice(0, 7);
          const thisMonth = txs.filter((t) => (t.date ?? "").slice(0, 7) === month);
          if (thisMonth.length === 0) {
            push(`\n\nPayPal checked — no incoming payments found this month.`);
          } else {
            const { data: prof } = await supabase
              .from("profiles")
              .select("sync_token")
              .eq("id", user.id)
              .single();
            const { data: result, error: bfErr } = await supabase.rpc("backfill_income", {
              p_token: prof?.sync_token,
              p_events: thisMonth.map((t) => ({
                source: "paypal",
                amount: t.amount,
                currency: t.currency,
                reference: `pp_${t.id}`,
                note: t.payer,
                received_at: t.date,
              })),
            });
            if (bfErr) throw new Error(bfErr.message);
            goalUpdated = !!result?.goal_updated;
            reply += `\n\nPayPal synced: ${result?.added ?? 0} payment(s) imported${
              result?.skipped ? ` (${result.skipped} already tracked)` : ""
            }${result?.month_total != null ? `. Month now: ${result.month_total}` : ""}.`;
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : "sync failed";
          reply += msg.includes("PERMISSION_PENDING")
            ? `\n\nPayPal history access is still propagating on their side (few hours). Ask me to sync again later.`
            : `\n\nPayPal sync failed (${msg.slice(0, 120)}).`;
        }
      }
    }

    // Create the thread on first exchange, titled by the model (ChatGPT-style)
    let conversationTitle: string | null = null;
    if (!conversationId) {
      conversationTitle =
        result.conversation_title?.trim().slice(0, 60) ||
        (kind === "daily_checkin"
          ? "Daily check-in"
          : kind === "weekly_review"
            ? "Weekly review"
            : message.trim().slice(0, 40) || "New chat");
      const { data: newConv, error: convErr } = await supabase
        .from("coach_conversations")
        .insert({ user_id: user.id, title: conversationTitle })
        .select("id")
        .single();
      if (convErr) console.error("conversation create failed:", convErr.message);
      conversationId = newConv?.id ?? null;
    } else {
      await supabase
        .from("coach_conversations")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", conversationId);
    }

    const rows = [];
    if (message.trim()) {
      rows.push({
        user_id: user.id,
        role: "user",
        content: message.trim(),
        kind,
        conversation_id: conversationId,
      });
    }
    rows.push({
      user_id: user.id,
      role: "coach",
      content: reply,
      kind,
      conversation_id: conversationId,
    });
    const { error: insertErr } = await supabase.from("coach_messages").insert(rows);
    if (insertErr) console.error("coach message save failed:", insertErr.message);

    return {
      reply,
      conversation_id: conversationId,
      conversation_title: conversationTitle,
      plan_updated: planUpdated,
      plan_version: planVersion,
      theme_updated: themeUpdated,
      goal_updated: goalUpdated,
      memory_saved: memorySaved,
      workout_logged: workoutLogged,
      tracker_updated: trackerUpdated,
      ping_scheduled: pingScheduled,
    };
  };

  if (!wantStream) {
    try {
      return NextResponse.json(await runCoach(null));
    } catch (e) {
      console.error("coach error:", e);
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Jarvis request failed" },
        { status: 500 }
      );
    }
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (e: Record<string, unknown>) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}

`));
      try {
        const payload = await runCoach(emit);
        emit({ t: "done", ...payload });
      } catch (e) {
        console.error("coach stream error:", e);
        emit({ t: "err", m: e instanceof Error ? e.message : "Jarvis request failed" });
      }
      controller.close();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
