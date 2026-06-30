import {
  WS_URL,
  VERSION,
  PLATFORM,
  SUPPORTS_SCREENSHOTS,
  PING_INTERVAL_MS,
  PONG_TIMEOUT_MS,
  HEALTH_CHECK_INTERVAL_MS,
  RECONNECT_BASE_DELAY_MS,
  MAX_RECONNECT_ATTEMPTS,
} from "../constants";
import { MessageHandler } from "./message-handler";
import { Logger } from "../utils/logger";

/**
 * The connection manager — ported from the Electron WebSocketManager.
 *
 * Singleton. Holds one connection to wss://ws.mellow.tel. Opening the socket IS
 * node registration; the query string advertises the node to the matchmaker
 * (device_id, version, platform, speed_download, screenshots capability).
 *
 * Resilience (copied from Electron):
 *  - app-level ping every 60s; if no pong within 30s, close → reconnect
 *  - 15-min health check forces a reconnect if the socket died silently
 *  - bounded exponential backoff (max 5 attempts)
 *  - `voluntaryDisconnect` sentinel so opt-out/stop never auto-reconnects
 *
 * NOTE: the browser `WebSocket` has no ping/pong frame API, so we emulate
 * liveness with a JSON {"type":"ping"} app-level message and treat ANY inbound
 * message (or an explicit pong) as proof of life.
 */

export interface ConnectParams {
  nodeId: string;
  publicKey: string;
  speedDownload: number;
}

export interface ConnectOptions {
  /**
   * Gate evaluated before every reconnect attempt. Return false to stop the
   * reconnect loop entirely (e.g. the integration was disabled via /approval or
   * a disconnect_device command) — prevents a reconnect storm against a node the
   * backend no longer wants online.
   */
  reconnectGate?: () => Promise<boolean>;
}

export class WebSocketClient {
  private static instance: WebSocketClient | null = null;

  private ws: WebSocket | null = null;
  private params: ConnectParams | null = null;
  private handler: MessageHandler | null = null;
  private reconnectGate: (() => Promise<boolean>) | null = null;

  private isConnecting = false;
  private voluntaryDisconnect = false;
  private reconnectAttempts = 0;

  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private pongTimer: ReturnType<typeof setTimeout> | null = null;
  private healthTimer: ReturnType<typeof setInterval> | null = null;

  private logOnly = false;

  static getInstance(): WebSocketClient {
    if (!WebSocketClient.instance) WebSocketClient.instance = new WebSocketClient();
    return WebSocketClient.instance;
  }

  /** Milestone 3: connect but only log inbound jobs (no execution). */
  setLogOnly(v: boolean): void {
    this.logOnly = v;
    if (this.handler) this.handler.setLogOnly(v);
  }

  isConnected(): boolean {
    return !!this.ws && this.ws.readyState === WebSocket.OPEN;
  }

  /** Open the connection. Idempotent. */
  connect(params: ConnectParams, options?: ConnectOptions): boolean {
    this.params = params;
    if (options && options.reconnectGate) {
      this.reconnectGate = options.reconnectGate;
    }
    if (this.ws) {
      Logger.debug("[WS] already connected/connecting");
      return true;
    }
    if (this.isConnecting) return false;

    this.voluntaryDisconnect = false;
    this.isConnecting = true;

    const url = WebSocketClient.buildUrl(params);
    Logger.info("[WS] connecting:", url);

    try {
      // A disconnect_device command from the server stops the node cleanly.
      this.handler = new MessageHandler(params.nodeId, this.logOnly, () => {
        Logger.warn("[WS] disconnect_device received — stopping node");
        this.disconnect();
      });
      this.ws = new WebSocket(url);
      this.attachListeners();
      return true;
    } catch (e) {
      Logger.error("[WS] construct failed:", e);
      this.isConnecting = false;
      this.scheduleReconnect();
      return false;
    }
  }

  private static buildUrl(p: ConnectParams): string {
    const q = new URLSearchParams({
      device_id: p.nodeId,
      version: VERSION,
      platform: PLATFORM,
      speed_download: String(p.speedDownload),
      screenshots: String(SUPPORTS_SCREENSHOTS),
      manifest_version: "tizen",
      ws_client: "new_ws",
    });
    return `${WS_URL}?${q.toString()}`;
  }

  private attachListeners(): void {
    if (!this.ws) return;

    this.ws.onopen = () => {
      Logger.info("[WS] connection established");
      this.isConnecting = false;
      this.reconnectAttempts = 0;
      this.startPing();
      this.startHealthCheck();
    };

    this.ws.onmessage = (ev: MessageEvent) => {
      // Any inbound traffic proves the socket is alive.
      this.clearPongTimer();
      const data = typeof ev.data === "string" ? ev.data : "";
      if (!data) return;
      // Swallow app-level pong frames.
      if (data === "pong" || data.indexOf('"type":"pong"') !== -1) return;
      if (this.handler) {
        this.handler.handle(data).catch((e) => Logger.error("[WS] handler error:", e));
      }
    };

    this.ws.onerror = (e: Event) => {
      Logger.error("[WS] socket error:", e);
    };

    this.ws.onclose = () => {
      Logger.info("[WS] connection closed");
      this.resetSocket();
      if (!this.voluntaryDisconnect) this.scheduleReconnect();
    };
  }

  // --- liveness ---

  private startPing(): void {
    this.stopPing();
    this.pingTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        try {
          this.ws.send(JSON.stringify({ type: "ping" }));
        } catch (e) {
          Logger.debug("[WS] ping send failed:", e);
        }
        this.startPongTimer();
      }
    }, PING_INTERVAL_MS);
  }

  private stopPing(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
    this.clearPongTimer();
  }

  private startPongTimer(): void {
    this.clearPongTimer();
    this.pongTimer = setTimeout(() => {
      Logger.warn("[WS] pong timeout — closing socket");
      if (this.ws) {
        try {
          this.ws.close();
        } catch {
          /* noop */
        }
      }
    }, PONG_TIMEOUT_MS);
  }

  private clearPongTimer(): void {
    if (this.pongTimer) clearTimeout(this.pongTimer);
    this.pongTimer = null;
  }

  private startHealthCheck(): void {
    this.stopHealthCheck();
    this.healthTimer = setInterval(() => {
      if (this.voluntaryDisconnect) return;
      if (!this.isConnected()) {
        Logger.warn("[WS] health check: socket down, reconnecting");
        this.reconnectAttempts = 0;
        if (this.params) this.connect(this.params);
      }
    }, HEALTH_CHECK_INTERVAL_MS);
  }

  private stopHealthCheck(): void {
    if (this.healthTimer) clearInterval(this.healthTimer);
    this.healthTimer = null;
  }

  // --- reconnect ---

  private scheduleReconnect(): void {
    if (this.voluntaryDisconnect) return;
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      Logger.warn("[WS] max reconnect attempts reached; giving up");
      return;
    }
    this.reconnectAttempts++;
    const delay = RECONNECT_BASE_DELAY_MS * Math.pow(2, this.reconnectAttempts - 1);
    Logger.info(
      `[WS] reconnect ${this.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS} in ${delay}ms`
    );
    setTimeout(() => {
      void this.tryReconnect();
    }, delay);
  }

  private async tryReconnect(): Promise<void> {
    if (this.voluntaryDisconnect || !this.params || this.ws) return;
    // Re-evaluate the gate (approval / disabled) before reconnecting so a
    // backend-disabled node stops looping instead of hammering the server.
    if (this.reconnectGate) {
      let allowed = false;
      try {
        allowed = await this.reconnectGate();
      } catch (e) {
        Logger.error("[WS] reconnect gate threw; stopping:", e);
        allowed = false;
      }
      if (!allowed) {
        Logger.warn("[WS] reconnect gate denied; halting reconnect loop");
        this.voluntaryDisconnect = true;
        this.stopHealthCheck();
        return;
      }
    }
    this.connect(this.params);
  }

  private resetSocket(): void {
    this.stopPing();
    this.isConnecting = false;
    this.ws = null;
  }

  /** Voluntarily close (opt-out/stop). Suppresses auto-reconnect. */
  disconnect(): void {
    Logger.info("[WS] voluntary disconnect");
    this.voluntaryDisconnect = true;
    this.reconnectAttempts = MAX_RECONNECT_ATTEMPTS;
    this.stopPing();
    this.stopHealthCheck();
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        /* noop */
      }
      this.ws = null;
    }
  }
}
