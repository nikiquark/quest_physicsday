import { useEffect } from "react";

/** Keep the screen on while `active` (e.g. while the marker is displayed). */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !("wakeLock" in navigator)) return;
    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;

    const request = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const lock = await navigator.wakeLock.request("screen");
        if (cancelled) lock.release();
        else sentinel = lock;
      } catch {
        /* not allowed (battery saver etc.) */
      }
    };
    request();
    document.addEventListener("visibilitychange", request);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", request);
      sentinel?.release().catch(() => {});
    };
  }, [active]);
}
