import {
  IFRAME_POOL_MAX,
  IFRAME_MAX_USES,
  IFRAME_MAX_AGE_MS,
  IFRAME_ACQUIRE_TIMEOUT_MS,
} from "../constants";
import { Logger } from "../utils/logger";

/**
 * A tiny pool of hidden, off-screen iframes (max 2 — TV RAM constraint).
 *
 * Mirrors the *concepts* of the Electron window pool: bounded size, reuse,
 * rotation after N uses or T age, and content cleanup between jobs — adapted to
 * the DOM. Concurrency is bounded by the pool size: acquire() waits (up to 50s)
 * for a free frame rather than creating unbounded surfaces.
 */

interface PooledFrame {
  el: HTMLIFrameElement;
  inUse: boolean;
  createdAt: number;
  uses: number;
}

export class IframePool {
  private static instance: IframePool | null = null;
  private frames: PooledFrame[] = [];

  static getInstance(): IframePool {
    if (!IframePool.instance) IframePool.instance = new IframePool();
    return IframePool.instance;
  }

  private createFrame(): PooledFrame {
    const el = document.createElement("iframe");
    // Same-origin sandbox so we can read contentDocument; scripts allowed so the
    // page's JS runs. No allow-top-navigation / allow-popups / allow-modals.
    el.setAttribute("sandbox", "allow-same-origin allow-scripts");
    el.setAttribute("aria-hidden", "true");
    el.style.cssText = [
      "position:fixed",
      "left:-10000px",
      "top:-10000px",
      "width:1024px",
      "height:768px",
      "border:0",
      "visibility:hidden",
      "pointer-events:none",
    ].join(";");
    document.body.appendChild(el);
    const pf: PooledFrame = { el, inUse: false, createdAt: Date.now(), uses: 0 };
    this.frames.push(pf);
    Logger.debug("[IframePool] created frame, pool size:", this.frames.length);
    return pf;
  }

  private shouldRotate(pf: PooledFrame): boolean {
    return (
      pf.uses >= IFRAME_MAX_USES || Date.now() - pf.createdAt >= IFRAME_MAX_AGE_MS
    );
  }

  private rotate(pf: PooledFrame): PooledFrame {
    Logger.debug("[IframePool] rotating frame (uses:", pf.uses, ")");
    this.destroy(pf);
    return this.createFrame();
  }

  private destroy(pf: PooledFrame): void {
    try {
      if (pf.el.parentNode) pf.el.parentNode.removeChild(pf.el);
    } catch (e) {
      Logger.debug("[IframePool] destroy error:", e);
    }
    const idx = this.frames.indexOf(pf);
    if (idx !== -1) this.frames.splice(idx, 1);
  }

  /** Acquire a free frame, waiting up to 50s. Throws on timeout. */
  async acquire(): Promise<HTMLIFrameElement> {
    if (typeof document === "undefined" || !document.body) {
      throw new Error("[IframePool] no DOM available");
    }
    const start = Date.now();
    // eslint-disable-next-line no-constant-condition
    while (true) {
      let pf = this.frames.find((f) => !f.inUse);
      if (!pf && this.frames.length < IFRAME_POOL_MAX) {
        pf = this.createFrame();
      }
      if (pf) {
        if (this.shouldRotate(pf)) pf = this.rotate(pf);
        pf.inUse = true;
        pf.uses++;
        return pf.el;
      }
      if (Date.now() - start > IFRAME_ACQUIRE_TIMEOUT_MS) {
        throw new Error("[IframePool] acquire timed out (no free frame in 50s)");
      }
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  /** Release a frame back to the pool, clearing its content first. */
  release(el: HTMLIFrameElement): void {
    const pf = this.frames.find((f) => f.el === el);
    if (!pf) return;
    this.clearFrame(pf);
    pf.inUse = false;
  }

  private clearFrame(pf: PooledFrame): void {
    try {
      // Reset to blank so the previous page's timers/DOM are released.
      pf.el.removeAttribute("srcdoc");
      pf.el.src = "about:blank";
    } catch (e) {
      Logger.debug("[IframePool] clear error:", e);
    }
  }

  /** Tear down all frames (used on stop/opt-out). */
  shutdown(): void {
    this.frames.slice().forEach((pf) => this.destroy(pf));
    this.frames = [];
  }

  /** Test/diagnostic hook. */
  size(): number {
    return this.frames.length;
  }
}
