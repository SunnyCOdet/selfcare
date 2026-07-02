/**
 * Whoop-style daily readiness from synced sleep + resting heart rate.
 * Newest check-in first. Returns null when there's not enough data.
 */

type CheckinVitals = {
  checkin_date: string;
  sleep_hours: number | null;
  heart_rate_avg: number | null;
};

export type Readiness = {
  score: number; // 0-100
  label: "Primed" | "Ready" | "Take it easy" | "Recover";
  advice: string;
  sleep_hours: number | null;
  hr_delta: number | null; // vs baseline, positive = elevated
};

export function computeReadiness(checkins: CheckinVitals[]): Readiness | null {
  if (!checkins || checkins.length === 0) return null;
  const today = checkins[0];
  const sleep = today.sleep_hours != null ? Number(today.sleep_hours) : null;
  const hr = today.heart_rate_avg != null ? Number(today.heart_rate_avg) : null;
  if (sleep == null && hr == null) return null;

  // Baseline HR from the prior days (exclude today)
  const priorHrs = checkins
    .slice(1)
    .map((c) => (c.heart_rate_avg != null ? Number(c.heart_rate_avg) : null))
    .filter((v): v is number => v != null && v > 30);
  const baseline =
    priorHrs.length >= 3 ? priorHrs.reduce((s, v) => s + v, 0) / priorHrs.length : null;
  const hrDelta = hr != null && baseline != null ? Math.round((hr - baseline) * 10) / 10 : null;

  let score = 80;
  if (sleep != null) {
    if (sleep >= 7.5) score += 15;
    else if (sleep >= 7) score += 8;
    else if (sleep >= 6) score -= 10;
    else if (sleep >= 5) score -= 25;
    else score -= 35;
  }
  if (hrDelta != null) {
    if (hrDelta <= -2) score += 5;
    else if (hrDelta >= 8) score -= 25;
    else if (hrDelta >= 4) score -= 12;
  }
  score = Math.max(5, Math.min(100, Math.round(score)));

  const label: Readiness["label"] =
    score >= 85 ? "Primed" : score >= 65 ? "Ready" : score >= 45 ? "Take it easy" : "Recover";

  let advice: string;
  if (score >= 85) advice = "Green light — push heavy today, chase the extra set.";
  else if (score >= 65) advice = "Normal session as planned.";
  else if (score >= 45)
    advice = "Drop intensity ~20% — technique work over max effort, keep the steps easy-paced.";
  else advice = "Recovery day: walk easy, eat clean, sleep early. No heroics.";

  return { score, label, advice, sleep_hours: sleep, hr_delta: hrDelta };
}
