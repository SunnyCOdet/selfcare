import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Health data ingestion webhook for Apple Health.
 *
 * Accepts two payload shapes, token via ?token= query param or JSON body:
 *  1. Simple (iOS Shortcut):  POST/GET {token, steps}
 *  2. Health Auto Export app: POST {data: {metrics: [{name, units, data: [...]}]}}
 *     — steps, distance, sleep, and heart rate are extracted per day.
 */

function anonClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type DayMetrics = {
  steps?: number;
  distance_km?: number;
  sleep_hours?: number;
  heart_rate_avg?: number;
};

type HaeDataPoint = Record<string, unknown> & { date?: string; qty?: number };
type HaeMetric = { name?: string; units?: string; data?: HaeDataPoint[] };

function num(v: unknown): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** Parse Health Auto Export metrics into per-date values. */
function parseHae(metrics: HaeMetric[]): Map<string, DayMetrics> {
  const byDate = new Map<string, DayMetrics>();

  function day(dateStr: unknown): DayMetrics | null {
    const d = String(dateStr ?? "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
    if (!byDate.has(d)) byDate.set(d, {});
    return byDate.get(d)!;
  }

  for (const metric of metrics) {
    const name = (metric.name ?? "").toLowerCase();
    for (const point of metric.data ?? []) {
      const entry = day(point.date);
      if (!entry) continue;

      if (name === "step_count" || name === "steps") {
        const qty = num(point.qty);
        if (qty !== undefined) entry.steps = (entry.steps ?? 0) + Math.round(qty);
      } else if (name.includes("distance")) {
        let qty = num(point.qty);
        if (qty !== undefined) {
          if ((metric.units ?? "").toLowerCase() === "mi") qty *= 1.60934;
          if ((metric.units ?? "").toLowerCase() === "m") qty /= 1000;
          entry.distance_km = Math.round(((entry.distance_km ?? 0) + qty) * 100) / 100;
        }
      } else if (name === "heart_rate") {
        const avg = num(point["Avg"]) ?? num(point["avg"]) ?? num(point.qty);
        if (avg !== undefined) entry.heart_rate_avg = Math.round(avg);
      } else if (name === "sleep_analysis") {
        let h = num(point["asleep"]) ?? num(point["totalSleep"]);
        if (h === undefined) {
          const stages =
            (num(point["deep"]) ?? 0) + (num(point["core"]) ?? 0) + (num(point["rem"]) ?? 0);
          h = stages > 0 ? stages : num(point["inBed"]);
        }
        if (h !== undefined && h > 0 && h < 24) entry.sleep_hours = Math.round(h * 10) / 10;
      }
    }
  }
  return byDate;
}

export async function POST(req: Request) {
  const { searchParams } = new URL(req.url);
  const body = await req.json().catch(() => ({}));
  const token = searchParams.get("token") ?? body.token;

  if (typeof token !== "string" || !UUID_RE.test(token)) {
    return NextResponse.json({ ok: false, error: "Missing or invalid token" }, { status: 400 });
  }

  const supabase = anonClient();

  // Health Auto Export payload
  const metrics: HaeMetric[] | undefined = body?.data?.metrics;
  if (Array.isArray(metrics)) {
    const byDate = parseHae(metrics);
    if (byDate.size === 0) {
      return NextResponse.json({ ok: false, error: "No recognizable metrics in payload" }, { status: 400 });
    }
    const results: Record<string, unknown>[] = [];
    for (const [date, m] of byDate) {
      const { data, error } = await supabase.rpc("sync_health", {
        p_token: token,
        p_date: date,
        p_steps: m.steps ?? null,
        p_distance_km: m.distance_km ?? null,
        p_sleep_hours: m.sleep_hours ?? null,
        p_heart_rate_avg: m.heart_rate_avg ?? null,
      });
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      if (data && data.ok === false) return NextResponse.json(data, { status: 401 });
      results.push({ date, ...m, ...data });
    }
    return NextResponse.json({ ok: true, synced: results });
  }

  // Simple Shortcut payload
  return ingestSteps(supabase, token, body.steps ?? searchParams.get("steps"));
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");
  if (typeof token !== "string" || !UUID_RE.test(token)) {
    return NextResponse.json({ ok: false, error: "Missing or invalid token" }, { status: 400 });
  }
  return ingestSteps(anonClient(), token, searchParams.get("steps"));
}

async function ingestSteps(
  supabase: ReturnType<typeof anonClient>,
  token: string,
  steps: unknown
) {
  const stepsNum = Math.round(Number(steps));
  if (!Number.isFinite(stepsNum)) {
    return NextResponse.json({ ok: false, error: "Expected steps (number)" }, { status: 400 });
  }
  const { data, error } = await supabase.rpc("sync_steps", {
    p_token: token,
    p_steps: stepsNum,
  });
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  if (data && data.ok === false) {
    return NextResponse.json(data, { status: 401 });
  }
  return NextResponse.json(data);
}
