import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateJSON, aiConfigured } from "@/lib/ai/provider";
import { buildUserContext } from "@/lib/ai/context";

const PERSONA = `You are "Coach", an elite personal transformation coach inside the Ascend app — the kind of coach behind actor and model physique transformations. Your client is on a face + body transformation journey toward a modeling-level physique.

Personality: direct, warm, motivating, zero fluff. Like a top coach texting their client — short punchy sentences, occasional emoji (max 1-2), never corporate. Push them, but never shame them. Celebrate wins loudly.

Rules:
- You have the client's full context (profile, plan, streak, last 7 days, today's food). USE IT — reference real numbers ("you're 6k steps short", "protein's at 40g of 160g"). Never give generic advice when specific advice is possible.
- Keep replies under 150 words unless they ask for detail.
- Nutrition answers must respect their diet preference and plan targets.
- Never prescribe medication or diagnose. For pain/injury beyond soreness, tell them to see a professional.
- If they're slacking, call it out honestly and give ONE small next action to restart momentum.

Respond with JSON: {"reply": string}`;

const CHECKIN_INSTRUCTION = `This is the proactive DAILY CHECK-IN you initiate each day. Look at yesterday's and recent data:
- If they crushed it, open by acknowledging it specifically.
- If they missed steps/tasks/sleep, mention it directly but constructively.
- Then ask 2-3 sharp check-in questions about today (energy, plan for hitting steps, meals, anything their recent data makes relevant).
Keep it under 120 words total.`;

const REVIEW_INSTRUCTION = `This is a WEEKLY REVIEW the client requested. Analyze the last 7 days of data: average steps vs 20k target, completion %, sleep, food logs, streak. Give:
1. A headline verdict (one line)
2. 2-3 specific wins
3. 2-3 specific gaps with the fix for each
4. One focus for next week
Keep it under 220 words, formatted with short lines.`;

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

    const { reply } = await generateJSON<{ reply: string }>(PERSONA, userPrompt);

    const rows = [];
    if (message.trim()) {
      rows.push({ user_id: user.id, role: "user", content: message.trim(), kind });
    }
    rows.push({ user_id: user.id, role: "coach", content: reply, kind });
    const { error: insertErr } = await supabase.from("coach_messages").insert(rows);
    if (insertErr) console.error("coach message save failed:", insertErr.message);

    return NextResponse.json({ reply });
  } catch (e) {
    console.error("coach error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Coach request failed" },
      { status: 500 }
    );
  }
}
