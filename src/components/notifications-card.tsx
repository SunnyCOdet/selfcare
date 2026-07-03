"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Bell, BellRing, Loader2 } from "lucide-react";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

type Status = "unsupported" | "default" | "granted" | "denied" | "subscribed";

export function NotificationsCard() {
  const [status, setStatus] = useState<Status>("default");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supported = useSyncExternalStore(
    () => () => {},
    () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window,
    () => false
  );

  useEffect(() => {
    if (!supported) return;
    let cancelled = false;
    navigator.serviceWorker.getRegistration().then(async (reg) => {
      const sub = await reg?.pushManager.getSubscription();
      if (cancelled) return;
      if (sub) setStatus("subscribed");
      else setStatus(Notification.permission as Status);
    });
    return () => {
      cancelled = true;
    };
  }, [supported]);

  async function enable() {
    setBusy(true);
    setError(null);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setStatus(perm as Status);
        throw new Error("Permission not granted");
      }
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!),
      });
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!res.ok) throw new Error("Failed to save subscription");
      setStatus("subscribed");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not enable notifications");
    } finally {
      setBusy(false);
    }
  }

  if (!supported || status === "unsupported") {
    return (
      <div className="glass p-5 fade-up text-sm text-muted">
        <p className="font-semibold text-foreground mb-1 flex items-center gap-2">
          <Bell className="w-4 h-4" /> Jarvis notifications
        </p>
        Notifications need the app installed on your home screen (iOS 16.4+). Open in Safari,
        Share, Add to Home Screen, then enable here.
      </div>
    );
  }

  return (
    <div className="glass p-5 fade-up">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="font-semibold text-sm flex items-center gap-2">
            {status === "subscribed" ? (
              <BellRing className="w-4 h-4 text-success" />
            ) : (
              <Bell className="w-4 h-4 text-accent" />
            )}
            Jarvis notifications
          </p>
          <p className="text-xs text-muted mt-1">
            {status === "subscribed"
              ? "On - morning brief + evening steps nudge from Jarvis."
              : status === "denied"
                ? "Blocked in system settings - allow notifications for Ascend to enable."
                : "Morning brief + evening nudge if your steps are short."}
          </p>
        </div>
        {status !== "subscribed" && status !== "denied" && (
          <button onClick={enable} disabled={busy} className="btn-primary !py-2 !px-4 text-sm shrink-0">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bell className="w-4 h-4" />} Enable
          </button>
        )}
      </div>
      {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
    </div>
  );
}
