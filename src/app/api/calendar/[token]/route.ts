import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { APP_TZ } from "@/lib/dates";
import type { TransformationPlan } from "@/lib/types";

/**
 * Personal calendar feed (.ics) built from the user's active plan.
 *
 * Subscribe once in Apple/Google Calendar to:
 *   https://<host>/api/calendar/<sync-token>.ics
 * Today's schedule blocks materialise as timed events (with a 10-min alert)
 * for the next few weeks, so workouts/meals/skincare show up natively.
 */

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAYS_AHEAD = 21;
const DEFAULT_MINUTES = 45;

function anonClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

/** { ymd: "20260707", weekday: "Tuesday" } for an offset (in days) from now, in IST. */
function dayAt(offset: number): { ymd: string; weekday: string } {
  const d = new Date(Date.now() + offset * 86400000);
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: APP_TZ }).format(d).replace(/-/g, "");
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: APP_TZ, weekday: "long" }).format(d);
  return { ymd, weekday };
}

/** Parse "07:00", "7:30 AM", "8 pm" -> {h, m}, or null. */
function parseTime(raw: string): { h: number; m: number } | null {
  const s = raw.trim().toLowerCase();
  const match = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
  if (!match) return null;
  let h = parseInt(match[1], 10);
  const m = match[2] ? parseInt(match[2], 10) : 0;
  const mer = match[3];
  if (mer === "pm" && h < 12) h += 12;
  if (mer === "am" && h === 12) h = 0;
  if (h > 23 || m > 59) return null;
  return { h, m };
}

function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Fold lines to 75 octets per RFC 5545. */
function fold(line: string): string {
  if (line.length <= 73) return line;
  const parts: string[] = [];
  let rest = line;
  parts.push(rest.slice(0, 73));
  rest = rest.slice(73);
  while (rest.length > 0) {
    parts.push(" " + rest.slice(0, 72));
    rest = rest.slice(72);
  }
  return parts.join("\r\n");
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token: rawToken } = await ctx.params;
  const token = rawToken.replace(/\.ics$/i, "");

  if (!UUID_RE.test(token)) {
    return new Response("Invalid token", { status: 400 });
  }

  const { data, error } = await anonClient().rpc("plan_by_token", { p_token: token });
  const row = Array.isArray(data) ? data[0] : data;
  if (error || !row?.plan) {
    return new Response("No active plan for this token", { status: 404 });
  }

  const plan = row.plan as TransformationPlan;
  const name = (row.full_name as string | null)?.split(" ")[0] ?? "Ascend";
  const byWeekday = new Map(
    (plan.weekly_schedule ?? []).map((d) => [d.day.toLowerCase(), d.blocks ?? []])
  );

  const stamp =
    new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z"); // 20260707T101500Z

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Ascend//Transformation Plan//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    fold(`X-WR-CALNAME:Ascend — ${esc(name)}`),
    "X-WR-TIMEZONE:Asia/Kolkata",
    "REFRESH-INTERVAL;VALUE=DURATION:PT6H",
    "X-PUBLISHED-TTL:PT6H",
    // Fixed +0530, no DST — valid for Asia/Kolkata
    "BEGIN:VTIMEZONE",
    "TZID:Asia/Kolkata",
    "BEGIN:STANDARD",
    "DTSTART:19700101T000000",
    "TZOFFSETFROM:+0530",
    "TZOFFSETTO:+0530",
    "TZNAME:IST",
    "END:STANDARD",
    "END:VTIMEZONE",
  ];

  for (let offset = 0; offset < DAYS_AHEAD; offset++) {
    const { ymd, weekday } = dayAt(offset);
    const blocks = byWeekday.get(weekday.toLowerCase());
    if (!blocks) continue;

    blocks.forEach((block, i) => {
      const t = parseTime(String(block.time ?? ""));
      if (!t) return;
      const endMin = t.h * 60 + t.m + DEFAULT_MINUTES;
      const eh = Math.min(23, Math.floor(endMin / 60));
      const em = endMin % 60;
      const start = `${ymd}T${pad(t.h)}${pad(t.m)}00`;
      const end = `${ymd}T${pad(eh)}${pad(em)}00`;

      // Wake-up / alarm blocks ring AT the time; everything else nudges 10 min early.
      const isWake = /\b(wake|alarm|get up|rise and shine|rise)\b/i.test(block.activity ?? "");
      const trigger = isWake ? "TRIGGER:PT0S" : "TRIGGER:-PT10M";

      lines.push(
        "BEGIN:VEVENT",
        `UID:${ymd}-${i}-${token.slice(0, 8)}@ascend`,
        `DTSTAMP:${stamp}`,
        `DTSTART;TZID=Asia/Kolkata:${start}`,
        `DTEND;TZID=Asia/Kolkata:${end}`,
        fold(`SUMMARY:${esc((isWake ? "⏰ " : "") + (block.activity ?? "Ascend"))}`)
      );
      if (block.details) lines.push(fold(`DESCRIPTION:${esc(block.details)}`));
      lines.push(
        "BEGIN:VALARM",
        "ACTION:DISPLAY",
        trigger,
        fold(`DESCRIPTION:${esc(block.activity ?? "Ascend")}`),
        "END:VALARM",
        "END:VEVENT"
      );
    });
  }

  lines.push("END:VCALENDAR");
  const body = lines.join("\r\n") + "\r\n";

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="ascend.ics"',
      "Cache-Control": "public, max-age=0, s-maxage=3600",
    },
  });
}
