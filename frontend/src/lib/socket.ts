/**
 * WebSocket that keeps itself alive: reconnects with backoff, pings to detect dead
 * connections (mobile networks drop them silently) and stops on the server's 4001 close.
 */

export type SocketStatus = "connecting" | "open" | "closed";

const CLOSE_INVALID = 4001;
const PING_EVERY_MS = 15000;
const PONG_TIMEOUT_MS = 8000;

export interface SocketHandlers {
  onMessage: (data: any) => void;
  onStatus?: (status: SocketStatus) => void;
  onOpen?: () => void;
  onInvalid?: () => void;
}

export class LiveSocket {
  private ws: WebSocket | null = null;
  private retry = 0;
  private stopped = false;
  private reconnectTimer: number | undefined;
  private pingTimer: number | undefined;
  private pongTimer: number | undefined;

  constructor(
    private url: string,
    private handlers: SocketHandlers,
  ) {
    this.connect();
    window.addEventListener("online", this.reconnectNow);
    document.addEventListener("visibilitychange", this.onVisible);
  }

  get isOpen(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  send(data: unknown): boolean {
    if (!this.isOpen) return false;
    this.ws!.send(JSON.stringify(data));
    return true;
  }

  close(): void {
    this.stopped = true;
    window.removeEventListener("online", this.reconnectNow);
    document.removeEventListener("visibilitychange", this.onVisible);
    this.clearTimers();
    this.ws?.close();
  }

  private onVisible = () => {
    // Phones freeze background tabs; verify the connection as soon as we are visible again.
    if (document.visibilityState === "visible") {
      if (this.isOpen) this.ping();
      else this.reconnectNow();
    }
  };

  private reconnectNow = () => {
    if (this.stopped || this.isOpen) return;
    this.retry = 0;
    window.clearTimeout(this.reconnectTimer);
    this.connect();
  };

  private connect() {
    if (this.stopped) return;
    this.handlers.onStatus?.("connecting");
    const ws = new WebSocket(this.url);
    this.ws = ws;

    ws.onopen = () => {
      this.retry = 0;
      this.handlers.onStatus?.("open");
      this.handlers.onOpen?.();
      this.schedulePing();
    };
    ws.onmessage = (event) => {
      let data: any;
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }
      if (data.type === "pong") {
        window.clearTimeout(this.pongTimer);
        return;
      }
      this.handlers.onMessage(data);
    };
    ws.onclose = (event) => {
      if (this.ws !== ws) return;
      this.clearTimers();
      this.handlers.onStatus?.("closed");
      if (event.code === CLOSE_INVALID) {
        this.stopped = true;
        this.handlers.onInvalid?.();
        return;
      }
      if (this.stopped) return;
      const delay = Math.min(5000, 500 * 2 ** this.retry) + Math.random() * 500;
      this.retry += 1;
      this.reconnectTimer = window.setTimeout(() => this.connect(), delay);
    };
    ws.onerror = () => ws.close();
  }

  private schedulePing() {
    window.clearTimeout(this.pingTimer);
    this.pingTimer = window.setTimeout(() => this.ping(), PING_EVERY_MS);
  }

  private ping() {
    if (!this.send({ type: "ping" })) return;
    window.clearTimeout(this.pongTimer);
    this.pongTimer = window.setTimeout(() => this.dropAndReconnect(), PONG_TIMEOUT_MS);
    this.schedulePing();
  }

  /** A dead socket may take minutes to report onclose; abandon it and dial again now. */
  private dropAndReconnect() {
    const old = this.ws;
    this.ws = null;
    this.clearTimers();
    old?.close();
    this.handlers.onStatus?.("closed");
    this.connect();
  }

  private clearTimers() {
    window.clearTimeout(this.reconnectTimer);
    window.clearTimeout(this.pingTimer);
    window.clearTimeout(this.pongTimer);
  }
}
