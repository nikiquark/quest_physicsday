import { type ReactNode, useEffect, useRef, useState } from "react";

import { type DetectedMarker, detector } from "./detector";
import styles from "./Scanner.module.css";
import { useDetector } from "./useDetector";

/** Frames are downscaled to this width before detection: a speed/range trade-off. */
const MAX_DETECT_WIDTH = 1600;
/** Boxes stay on screen this long after the marker was last seen, to avoid flicker. */
const BOX_TTL_MS = 400;

export interface Box {
  color: string;
  label?: string;
  width?: number;
}

interface Props {
  active: boolean;
  onMarkers: (markers: DetectedMarker[]) => void;
  boxFor: (id: number) => Box | null;
  fit?: "cover" | "contain";
  children?: ReactNode;
}

export function ScannerView({ active, onMarkers, boxFor, fit = "cover", children }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const [cameraError, setCameraError] = useState("");
  const { progress, ready, error, retry } = useDetector();
  const onMarkersRef = useRef(onMarkers);
  const boxForRef = useRef(boxFor);
  onMarkersRef.current = onMarkers;
  boxForRef.current = boxFor;

  // Camera stream.
  useEffect(() => {
    if (!active) return;
    let stream: MediaStream | null = null;
    let cancelled = false;
    setCameraError("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("Камера недоступна. Откройте сайт по HTTPS в Chrome или Safari.");
      return;
    }
    navigator.mediaDevices
      .getUserMedia({
        audio: false,
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      })
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        const video = videoRef.current!;
        video.srcObject = s;
        video.play().catch(() => {});
      })
      .catch((err: Error) => {
        setCameraError(
          err.name === "NotAllowedError" ? "Нет доступа к камере. Разрешите его в настройках браузера." : `Камера: ${err.message}`,
        );
      });
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [active]);

  // Detection loop + overlay drawing.
  useEffect(() => {
    if (!active || !ready) return;
    const video = videoRef.current!;
    const overlay = overlayRef.current!;
    const frame = document.createElement("canvas");
    const frameCtx = frame.getContext("2d", { willReadFrequently: true })!;
    let buffer: ArrayBuffer | null = null;
    let busy = false;
    let stopped = false;
    let raf = 0;
    const seen = new Map<number, { corners: number[]; at: number }>();

    const detectFrame = async () => {
      if (stopped || busy || video.readyState < 2 || !video.videoWidth) return;
      busy = true;
      const scale = Math.min(1, MAX_DETECT_WIDTH / video.videoWidth);
      const w = Math.round(video.videoWidth * scale);
      const h = Math.round(video.videoHeight * scale);
      if (frame.width !== w || frame.height !== h) {
        frame.width = w;
        frame.height = h;
        buffer = null;
      }
      frameCtx.drawImage(video, 0, 0, w, h);
      const image = frameCtx.getImageData(0, 0, w, h);
      if (!buffer || buffer.byteLength !== image.data.byteLength) buffer = new ArrayBuffer(image.data.byteLength);
      new Uint8ClampedArray(buffer).set(image.data);
      const result = await detector.detect(w, h, buffer);
      buffer = result.buffer;
      busy = false;
      if (stopped) return;
      const now = performance.now();
      const markers = result.markers.map((m) => ({ id: m.id, corners: m.corners.map((v) => v / scale) }));
      markers.forEach((m) => seen.set(m.id, { corners: m.corners, at: now }));
      onMarkersRef.current(markers);
    };

    const draw = () => {
      raf = requestAnimationFrame(draw);
      detectFrame();
      const rect = overlay.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      if (overlay.width !== Math.round(rect.width * dpr) || overlay.height !== Math.round(rect.height * dpr)) {
        overlay.width = Math.round(rect.width * dpr);
        overlay.height = Math.round(rect.height * dpr);
      }
      const ctx = overlay.getContext("2d")!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, rect.width, rect.height);
      if (!video.videoWidth) return;
      const s =
        fit === "cover"
          ? Math.max(rect.width / video.videoWidth, rect.height / video.videoHeight)
          : Math.min(rect.width / video.videoWidth, rect.height / video.videoHeight);
      const ox = (rect.width - video.videoWidth * s) / 2;
      const oy = (rect.height - video.videoHeight * s) / 2;
      const now = performance.now();
      seen.forEach((entry, id) => {
        if (now - entry.at > BOX_TTL_MS) {
          seen.delete(id);
          return;
        }
        const box = boxForRef.current(id);
        if (!box) return;
        const pts = [];
        for (let i = 0; i < 8; i += 2) pts.push([ox + entry.corners[i] * s, oy + entry.corners[i + 1] * s]);
        ctx.lineWidth = box.width ?? 5;
        ctx.strokeStyle = box.color;
        ctx.fillStyle = box.color + "33";
        ctx.beginPath();
        pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        if (box.label) {
          const [x, y] = pts[0];
          ctx.font = "bold 16px system-ui, sans-serif";
          const tw = ctx.measureText(box.label).width;
          ctx.fillStyle = box.color;
          ctx.fillRect(x, y - 24, tw + 12, 22);
          ctx.fillStyle = "#fff";
          ctx.fillText(box.label, x + 6, y - 8);
        }
      });
    };
    raf = requestAnimationFrame(draw);
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
    };
  }, [active, ready, fit]);

  return (
    <div className={styles.scanner}>
      <video ref={videoRef} className={styles.video} style={{ objectFit: fit }} playsInline muted autoPlay />
      <canvas ref={overlayRef} className={styles.overlay} />
      {!ready && (
        <div className={styles.loader}>
          {error ? (
            <>
              <p>Не удалось загрузить распознавание.</p>
              <button className="btn" onClick={retry}>
                Повторить
              </button>
            </>
          ) : (
            <>
              <p>Загрузка распознавания…</p>
              <div className={styles.progress}>
                <div style={{ width: `${Math.round(progress * 100)}%` }} />
              </div>
              <p className={styles.progressText}>{Math.round(progress * 100)}%</p>
            </>
          )}
        </div>
      )}
      {cameraError && <div className={styles.loader}>{cameraError}</div>}
      {children}
    </div>
  );
}

/** Progress bar for pages that preload the detector before the camera opens. */
export function DetectorStatus() {
  const { progress, ready, error, retry } = useDetector();
  if (ready) return <p className={styles.detectorReady}>✓ Распознавание готово</p>;
  if (error)
    return (
      <p className="error-text">
        Не удалось загрузить распознавание.{" "}
        <button className="btn btn-outline" onClick={retry}>
          Повторить
        </button>
      </p>
    );
  return (
    <div className={styles.detectorLoading}>
      <span>Загрузка распознавания… {Math.round(progress * 100)}%</span>
      <div className={styles.progress}>
        <div style={{ width: `${Math.round(progress * 100)}%` }} />
      </div>
    </div>
  );
}
