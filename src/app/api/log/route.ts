import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Quick-log webhook — the voice/Shortcut counterpart to /api/steps.
 *
 * Lets an iOS Shortcut (or Siri) log a single thing with one tokenized call:
 *   GET  /api/log?token=<uuid>&action=weight&value=72.5
 *   GET  /api/log?token=<uuid>&action=water&value=0.5      (adds 0.5 L)
 *   GET  /api/log?token=<uuid>&action=mood&text=Good
 *   GET  /api/log?token=<uuid>&action=done&text=protein    (mark a habit done)
 *   POST /api/log  { token, action, value?, text? }
 *
 * Actions: weight | water | water_set | sleep | mood | steps
 *          | done | undone | workout | skincare
 * All routing/auth happens in the SECURITY DEFINER `quick_log` RPC.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function anonClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

async function log(
  token: unknown,
  action: unknown,
  value: unknown,
  text: unknown
) {
  if (typeof token !== "string" || !UUID_RE.test(token)) {
    return NextResponse.json({ ok: false, error: "Missing or invalid token" }, { status: 400 });
  }
  if (typeof action !== "string" || action.trim() === "") {
    return NextResponse.json({ ok: false, error: "Missing action" }, { status: 400 });
  }

  const num = value == null || value === "" ? null : Number(value);
  if (num != null && !Number.isFinite(num)) {
    return NextResponse.json({ ok: false, error: "value must be a number" }, { status: 400 });
  }

  const { data, error } = await anonClient().rpc("quick_log", {
    p_token: token,
    p_action: action.trim(),
    p_value: num,
    p_text: typeof text === "string" ? text : null,
  });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  if (data && data.ok === false) {
    const status = data.error === "invalid token" ? 401 : 400;
    return NextResponse.json(data, { status });
  }
  return NextResponse.json(data);
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  return log(
    searchParams.get("token"),
    searchParams.get("action"),
    searchParams.get("value"),
    searchParams.get("text")
  );
}

export async function POST(req: Request) {
  const { searchParams } = new URL(req.url);
  const body = await req.json().catch(() => ({}));
  return log(
    searchParams.get("token") ?? body.token,
    searchParams.get("action") ?? body.action,
    searchParams.get("value") ?? body.value,
    searchParams.get("text") ?? body.text
  );
}
