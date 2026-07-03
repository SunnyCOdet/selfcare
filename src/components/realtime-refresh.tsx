"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const WATCHED_TABLES = [
  "daily_checkins",
  "food_logs",
  "goals",
  "goal_progress",
  "transformation_plans",
  "custom_trackers",
  "tracker_logs",
  "workouts",
  "income_events",
  "streaks",
  "profiles",
  "progress_photos",
] as const;

/**
 * Live UI: subscribes to database changes on the signed-in user's rows and
 * re-renders the current page (debounced) whenever anything changes — steps
 * arriving from the phone, payments landing, Jarvis correcting a food entry,
 * the Sunday plan rewrite. RLS scopes events to the user's own data.
 */
export function RealtimeRefresh() {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const supabase = createClient();

    const refresh = () => {
      if (timer.current) clearTimeout(timer.current);
      // Debounce: a steps sync or plan rewrite touches several tables at once
      timer.current = setTimeout(() => router.refresh(), 500);
    };

    let channel = supabase.channel("live-ui");
    for (const table of WATCHED_TABLES) {
      channel = channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        refresh
      );
    }
    channel.subscribe();

    // iOS PWAs kill the socket in the background — resubscribe on return
    const onVisible = () => {
      if (document.visibilityState === "visible" && channel.state !== "joined") {
        supabase.removeChannel(channel);
        channel = supabase.channel("live-ui");
        for (const table of WATCHED_TABLES) {
          channel = channel.on(
            "postgres_changes",
            { event: "*", schema: "public", table },
            refresh
          );
        }
        channel.subscribe();
        refresh();
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      if (timer.current) clearTimeout(timer.current);
      supabase.removeChannel(channel);
    };
  }, [router]);

  return null;
}
