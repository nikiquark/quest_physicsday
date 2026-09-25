import { useEffect, useState } from "react";

import { detector } from "./detector";

/** Starts loading OpenCV (once per page lifetime) and reports progress. */
export function useDetector() {
  const [status, setStatus] = useState({ progress: detector.progress, ready: detector.ready, error: detector.error });
  useEffect(() => {
    detector.load();
    return detector.subscribe((progress, ready, error) => setStatus({ progress, ready, error }));
  }, []);
  return {
    ...status,
    retry: () => detector.load(),
  };
}
