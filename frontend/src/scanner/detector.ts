/** Singleton wrapper around the OpenCV ArUco worker. */

export interface DetectedMarker {
  id: number;
  /** 4 corners, clockwise from top-left of the marker: x0,y0,x1,y1,... in video pixels. */
  corners: number[];
}

type Listener = (progress: number, ready: boolean, error: string | null) => void;

const OPENCV_URL = "/opencv/opencv.js?v=5.0.0";
const WORKER_URL = "/cv-worker.js?v=1";

class Detector {
  private worker: Worker | null = null;
  private listeners = new Set<Listener>();
  private pending = new Map<number, (m: { markers: DetectedMarker[]; buffer: ArrayBuffer }) => void>();
  private seq = 0;
  progress = 0;
  ready = false;
  error: string | null = null;

  load() {
    if (this.worker) return;
    this.error = null;
    this.worker = new Worker(WORKER_URL);
    this.worker.onmessage = (event) => {
      const msg = event.data;
      if (msg.type === "progress") {
        this.progress = msg.progress;
      } else if (msg.type === "ready") {
        this.ready = true;
        this.progress = 1;
      } else if (msg.type === "error") {
        if (!this.ready) {
          this.error = msg.error;
          this.worker?.terminate();
          this.worker = null;
        }
      } else if (msg.type === "result") {
        this.pending.get(msg.seq)?.({ markers: msg.markers, buffer: msg.buffer });
        this.pending.delete(msg.seq);
        return;
      }
      this.emit();
    };
    this.worker.postMessage({ type: "load", url: OPENCV_URL });
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.progress, this.ready, this.error);
    return () => this.listeners.delete(listener);
  }

  /** Detect markers in an RGBA frame. The buffer is transferred and returned with the result. */
  detect(width: number, height: number, buffer: ArrayBuffer): Promise<{ markers: DetectedMarker[]; buffer: ArrayBuffer }> {
    if (!this.worker || !this.ready) return Promise.resolve({ markers: [], buffer });
    const seq = ++this.seq;
    return new Promise((resolve) => {
      this.pending.set(seq, resolve);
      this.worker!.postMessage({ type: "detect", seq, width, height, buffer }, [buffer]);
    });
  }

  private emit() {
    this.listeners.forEach((l) => l(this.progress, this.ready, this.error));
  }
}

export const detector = new Detector();
