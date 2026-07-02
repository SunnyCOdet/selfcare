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

Rules:
- Only act when the client clearly requests a change or explicitly agrees to your suggestion. Questions get action: null.
- In your reply, confirm concretely what you changed ("Done — recomp at 2400 kcal, protein stays at 170g...").
- You have the client's full context (profile, plan, streak, last 7 days, today's food). USE IT — reference real numbers. Never generic advice when specific is possible.
- Keep replies under 150 words unless they ask for detail.
- Never prescribe medication or diagnose. Pain/injury beyond soreness → see a professional.

Respond with JSON: {"reply": string, "action": null | {"type": "update_plan", "instructions": string} | {"type": "switch_theme", "theme": string} | {"type": "create_theme", "name": string, "vars": object}}`;

const CHECKIN_INSTRUCTION = `This is the proactive DAILY CHECK-IN you initiate each day. Look at yesterday's and recent data:
- If they crushed it, open by acknowledging it specifically.
- If they missed steps/tasks/sleep, mention it directly but constructively.
- Then ask 2-3 sharp check-in questions about today (energy, plan for hitting steps, meals, anything their recent data makes relevant).
Keep it under 120 words total. action must be null.`;

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

type CoachAction =
  | { type: "update_plan"; instructions: string }
  | { type: "switch_theme"; theme: string }
  | { type: "create_theme"; name: string; vars: Record<string, string> }
  | null;

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

  if (kind === "chat" && !message.trim()) {
    return NextResponse.json({ error: "Empty message" }, { status: 400 });
  }

  try {
    const [context, { data: history }] = await Promise.all([
      buildUserContext(supabase, user.id),
      supabase
        .from("coach_messages")
        .select("role, content")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20),
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

    const result = await generateJSON<{ reply: string; action?: CoachAction }>(
      PERSONA,
      userPrompt
    );
    let reply = result.reply;
    const action = result.action ?? null;

    let planUpdated = false;
    let themeUpdated = false;
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
    }

    const rows = [];
    if (message.trim()) {
      rows.push({ user_id: user.id, role: "user", content: message.trim(), kind });
    }
    rows.push({ user_id: user.id, role: "coach", content: reply, kind });
    const { error: insertErr } = await supabase.from("coach_messages").insert(rows);
    if (insertErr) console.error("coach message save failed:", insertErr.message);

    return NextResponse.json({
      reply,
      plan_updated: planUpdated,
      plan_version: planVersion,
      theme_updated: themeUpdated,
    });
  } catch (e) {
    console.error("coach error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Coach request failed" },
      { status: 500 }
    );
  }
}
