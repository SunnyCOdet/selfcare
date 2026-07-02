/**
 * One day boundary for the whole app: midnight IST (Asia/Kolkata) —
 * matching Apple Health, which resets steps at local midnight.
 * Server code (Vercel/UTC) must never use bare `new Date()` calendar math.
 */
export const APP_TZ = "Asia/Kolkata";

/** YYYY-MM-DD in app timezone. offsetDays: -1 = yesterday, etc. */
export function todayStr(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86400000);
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", { timeZone: APP_TZ }).format(d);
}

/** Weekday name ("Monday") in app timezone. */
export function todayWeekday(): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: APP_TZ, weekday: "long" }).format(new Date());
}

/** Current hour (0-23) in app timezone. */
export function currentHour(): number {
  return parseInt(
    new Intl.DateTimeFormat("en-GB", { timeZone: APP_TZ, hour: "2-digit", hour12: false }).format(
      new Date()
    ),
    10
  );
}

/** Narrow weekday label ("M") for a date offset, in app timezone. */
export function weekdayNarrow(offsetDays: number): string {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return new Intl.DateTimeFormat("en-US", { timeZone: APP_TZ, weekday: "narrow" }).format(d);
}

/** Full human timestamp in app timezone: "Friday, 3 July 2026, 2:15 am IST". */
export function nowStr(): string {
  return (
    new Intl.DateTimeFormat("en-IN", {
      timeZone: APP_TZ,
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(new Date()) + " IST"
  );
}
