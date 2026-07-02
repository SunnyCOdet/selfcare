import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateJSON, aiConfigured } from "@/lib/ai/provider";
import { buildUserContext } from "@/lib/ai/context";
import { PLAN_JSON_SPEC, PLAN_RULES, isValidPlan, savePlanVersion } from "@/lib/ai/plan";
import { PRESET_THEMES, sanitizeThemeVars, THEME_VAR_KEYS } from "@/lib/themes";
import type { TransformationPlan } from "@/lib/types";

const PERSONA = `You are "Coach", an elite personal transformation AGENT inside the Ascend app — not just an advisor. You can directly modify the client's plan and the app itself. Your client is on a face + body transformation journey toward a modeling-level physique, but you manage their whole routine and goals.

Personality: direct, warm, motivating, zero fluff. Like a top coach texting their client — short punchy sentences, occasional emoji (max 1-2), never corporate. Push them, but never shame them. Celebrate wins loudly.

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

Rules:
- Only act when the client clearly requests a change or explicitly agrees to your suggestion (exception: "remember" — use whenever something durable comes up).
- In your reply, confirm concretely what you changed ("Done — recomp at 2400 kcal, protein stays at 170g...").
- You have the client's full context (profile, plan, streak, last 7 days, today's food, goals with milestones, recent goal progress, and your saved memories). USE IT — reference real numbers and stale milestones. Never generic advice when specific is possible.
- Keep replies under 150 words unless they ask for detail.
- Never prescribe medication or diagnose. Pain/injury beyond soreness → see a professional.

Respond with JSON: {"reply": string, "conversation_title": string, "action": null | {"type": "update_plan", "instructions": string} | {"type": "switch_theme", "theme": string} | {"type": "create_theme", "name": string, "vars": object} | {"type": "create_goal", "goal": object} | {"type": "update_goal", "goal_title": string, "progress_note": string, "new_value": number|null, "milestone_done": string|null, "status": string|null} | {"type": "remember", "category": string, "content": string}}

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

const UPDATER_SYSTEM = `You are the plan-rewriting engine of a transformation app. You receive the client's CURRENT plan, their full context, and precise CHANGE INSTRUCTIONS from their coach.

Rewrite the plan applying the instructions coherently across EVERYTHING affected:
- calorie/phase change → recalculate macros, rewrite every meal with matching portions, adjust cardio guidance
- split/schedule change → rebuild workout days and the weekly schedule
- new activities/routines → integrate into weekly_schedule, activities, and daily_non_negotiables
Keep everything NOT affected by the instructions as close to the current plan as possible — do not gratuitously rewrite what works.

You MUST respond with a single JSON object exactly matching this shape (all fields required):

${PLAN_JSON_SPEC}

${PLAN_RULES}`;

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

  try {
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

    const userPrompt = `CLIENT CONTEXT (live data as of ${context.today}):
${JSON.stringify(context, null, 2)}

RECENT CONVERSATION:
${conversation || "(no prior messages)"}

${instruction ? `SPECIAL INSTRUCTION:\n${instruction}\n` : ""}${
      message.trim() ? `CLIENT'S NEW MESSAGE:\n${message}` : ""
    }

Reply as Coach now.`;

    const result = await generateJSON<{
      reply: string;
      conversation_title?: string;
      action?: CoachAction;
    }>(PERSONA, userPrompt);
    let reply = result.reply;
    const action = result.action ?? null;

    let planUpdated = false;
    let themeUpdated = false;
    let goalUpdated = false;
    let memorySaved = false;
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

        const newPlan = await generateJSON<TransformationPlan>(UPDATER_SYSTEM, updaterPrompt);
        if (!isValidPlan(newPlan)) throw new Error("rewriter returned incomplete plan");

        planVersion = await savePlanVersion(supabase, user.id, newPlan);
        planUpdated = true;
        reply += `\n\n✅ Plan updated — now on v${planVersion}. Check the Plan tab.`;
      } catch (e) {
        console.error("plan update failed:", e);
        reply += `\n\n⚠️ I couldn't apply the plan update (${e instanceof Error ? e.message : "error"}). Try asking again.`;
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
          reply += `\n\n🎨 "${preset.name}" template applied.`;
        }
      } else {
        reply += `\n\n⚠️ I don't have a "${action.theme}" preset — ask me to create it as a custom template.`;
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
          reply += `\n\n🎨 Custom "${name}" template created and applied.`;
        }
      } else {
        reply += `\n\n⚠️ The template I designed didn't pass validation — ask me to try again.`;
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
        reply += `\n\n🎯 Goal locked in with ${milestones.length} milestones.`;
      } catch (e) {
        console.error("create_goal failed:", e);
        reply += `\n\n⚠️ I couldn't save the goal — try again.`;
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
        reply += `\n\n🎯 Progress logged on "${goal.title}".`;
      } catch (e) {
        console.error("update_goal failed:", e);
        reply += `\n\n⚠️ Couldn't log that against a goal (${e instanceof Error ? e.message : "error"}).`;
      }
    } else if (action?.type === "remember" && action.content) {
      const { error: memErr } = await supabase.from("agent_memories").insert({
        user_id: user.id,
        category: MEMORY_CATEGORIES.includes(action.category ?? "") ? action.category : "fact",
        content: action.content.slice(0, 500),
      });
      if (!memErr) memorySaved = true;
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

    return NextResponse.json({
      reply,
      conversation_id: conversationId,
      conversation_title: conversationTitle,
      plan_updated: planUpdated,
      plan_version: planVersion,
      theme_updated: themeUpdated,
      goal_updated: goalUpdated,
      memory_saved: memorySaved,
    });
  } catch (e) {
    console.error("coach error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Coach request failed" },
      { status: 500 }
    );
  }
}
