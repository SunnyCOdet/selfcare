import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { aiConfigured, generateJSON } from "@/lib/ai/provider";
import { nowStr } from "@/lib/dates";

/**
 * Single-URL Siri / Shortcuts assistant.
 *
 * One iOS Shortcut: Dictate Text -> Get Contents of URL
 *   https://<host>/api/siri?token=<uuid>&text=[dictation]
 * -> Speak the reply.
 *
 * The spoken sentence is interpreted by the AI into zero or more log actions
 * (the quick_log vocabulary) plus a short spoken reply. Reads the user's live
 * data first so it can also answer questions ("what's my streak?").
 * Returns text/plain so "Speak Text" reads it directly.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ACTIONS = [
  "weight",
  "water",
  "water_set",
  "sleep",
  "mood",
  "steps",
  "done",
  "undone",
  "workout",
  "skincare",
] as const;
type ActionName = (typeof ACTIONS)[number];

type LogAction = { action: ActionName; value?: number | string | null; text?: string | null };
type AiResult = { reply: string; actions?: LogAction[] };

function anonClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

function speak(text: string, status = 200) {
  return new Response(text, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}

const SYSTEM = `You are Ascend, a concise voice assistant inside a self-care / body-transformation app. The user talks to you through Siri, so your "reply" is READ ALOUD — keep it to one or two short, natural sentences, no markdown, no lists, no emoji.

You receive the user's LIVE DATA (today's numbers, streak, plan) and what they just SAID. Do two things:
1. If they want to log or change something, emit the matching action(s).
2. Always write a spoken "reply": confirm what you logged, and/or answer their question using the live data. Never invent numbers you weren't given.

Return JSON: {"reply": string, "actions": [{"action": string, "value": number|null, "text": string|null}]}.

Available actions (use ONLY these):
- "weight" value=kg
- "water" value=liters to ADD (default 0.25 if they just say "log water")
- "water_set" value=liters (absolute, e.g. "set my water to 2")
- "sleep" value=hours
- "mood" text=the mood word
- "steps" value=number
- "done" text=habit/non-negotiable name (e.g. "protein", "skincare", "deep work")
- "undone" text=habit name (to uncheck)
- "workout" (marks today's workout done)
- "skincare" (marks skincare done)

Rules:
- Multiple things in one sentence -> multiple actions.
- A pure question ("what's my streak", "how much water today") -> actions: [] and answer from the data.
- Be encouraging but brief. If you couldn't understand, say so in one sentence and emit no actions.`;

async function handle(token: unknown, text: unknown) {
  if (typeof token !== "string" || !UUID_RE.test(token)) {
    return speak("That link is missing a valid token.", 400);
  }
  const said = typeof text === "string" ? text.trim() : "";
  if (!said) {
    return speak(
      "I received no words from the Shortcut. Make sure the Dictated Text is being sent — the most reliable way is Get Contents of URL set to POST with a JSON body field named text.",
      400
    );
  }
  // Classic setup mistake: the "[Dictated Text]" placeholder was pasted into the
  // URL but never replaced with the actual Dictated Text variable.
  if (/\[?\s*dictated\s*text\s*\]?/i.test(said)) {
    return speak(
      "Your Shortcut is sending a placeholder, not your voice. Edit the Shortcut, delete the text after 'text=' in the URL, and insert the Dictated Text variable there instead.",
      400
    );
  }
  if (!aiConfigured()) {
    return speak("The assistant isn't configured on the server yet.", 503);
  }

  const supabase = anonClient();

  // 1. Live data (also validates the token)
  const { data: status, error: statusErr } = await supabase.rpc("today_status", { p_token: token });
  if (statusErr) return speak("I couldn't reach your data right now.", 500);
  if (!status || status.ok === false) return speak("That token isn't valid.", 401);

  // 2. Interpret the spoken sentence
  let ai: AiResult;
  try {
    ai = await generateJSON<AiResult>(
      SYSTEM,
      `NOW: ${nowStr()}\n\nLIVE DATA:\n${JSON.stringify(status)}\n\nUSER SAID: "${said}"`
    );
  } catch {
    return speak("Sorry, I had trouble understanding that. Try again in a moment.", 502);
  }

  // 3. Execute any log actions
  const actions = Array.isArray(ai.actions) ? ai.actions.slice(0, 8) : [];
  let unmatched = false;
  for (const a of actions) {
    const name = String(a?.action ?? "").toLowerCase();
    if (!ACTIONS.includes(name as ActionName)) continue;
    const num = a?.value == null || a?.value === "" ? null : Number(a.value);
    const { data: res } = await supabase.rpc("quick_log", {
      p_token: token,
      p_action: name,
      p_value: Number.isFinite(num) ? num : null,
      p_text: typeof a?.text === "string" ? a.text : null,
    });
    if ((name === "done" || name === "undone") && res && res.ok !== false && res.matched == null) {
      unmatched = true;
    }
  }

  let reply = (ai.reply ?? "").toString().trim();
  if (!reply) reply = actions.length ? "Got it — logged." : "I didn't quite catch what to log. Try saying it another way.";
  if (unmatched) reply += " I couldn't find one of those habits on your plan, though.";
  return speak(reply);
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  return handle(searchParams.get("token"), searchParams.get("text"));
}

export async function POST(req: Request) {
  const { searchParams } = new URL(req.url);
  const raw = await req.text().catch(() => "");
  let body: { token?: unknown; text?: unknown } = {};
  const trimmed = raw.trim();
  if (trimmed.startsWith("{")) {
    try {
      body = JSON.parse(trimmed);
    } catch {
      body = {};
    }
  }
  // Accept the dictation from: ?text=, a JSON {text}, or a raw plain-text body.
  const rawText = trimmed && !trimmed.startsWith("{") ? raw : null;
  const token = searchParams.get("token") ?? body.token;
  const text = searchParams.get("text") ?? body.text ?? rawText;
  return handle(token, text);
}
