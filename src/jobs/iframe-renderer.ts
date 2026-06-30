import { DataRequest } from "./data-request";
import { JobResult, Action } from "../types";
import { IframePool } from "./iframe-pool";
import { HtmlProcessor } from "../html/html-processor";
import { JOB_TIMEOUT_MS } from "../constants";
import { Logger } from "../utils/logger";

/**
 * Option C renderer (secondary path, for JS-rendered pages).
 *
 * We fetch the HTML ourselves (bypasses CORS via the internet privilege), then
 * load it into a SAME-ORIGIN hidden iframe via `srcdoc` so scripts execute and
 * we retain full DOM read access — the Tizen analogue of Electron's
 * processHtmlContent. Cross-origin `src=` framing is avoided because the TV
 * runtime can't strip X-Frame-Options/CSP and cross-origin DOM is unreadable.
 *
 * The whole render is raced against a 60s timeout.
 */
export class IframeRenderer {
  static async run(req: DataRequest): Promise<JobResult> {
    const pool = IframePool.getInstance();
    const frame = await pool.acquire();

    const work = IframeRenderer.render(frame, req);
    const timeout = new Promise<JobResult>((_, reject) => {
      setTimeout(
        () => reject(new Error("[IframeRenderer] job timed out (60s)")),
        JOB_TIMEOUT_MS
      );
    });

    try {
      return await Promise.race([work, timeout]);
    } finally {
      pool.release(frame);
    }
  }

  private static async render(
    frame: HTMLIFrameElement,
    req: DataRequest
  ): Promise<JobResult> {
    let statusCode = 0;
    let finalUrl = req.url;
    let html = "";

    try {
      const res = await fetch(req.url, { redirect: "follow" });
      statusCode = res.status;
      finalUrl = res.url || req.url;
      html = await res.text();
    } catch (e) {
      Logger.error("[IframeRenderer] fetch failed:", e);
      return { html: "", markdown: "", finalUrl, statusCode, websiteUnreachable: true };
    }

    // Size the frame to the requested viewport.
    if (req.windowSize) {
      frame.style.width = (req.windowSize.width || 1024) + "px";
      frame.style.height = (req.windowSize.height || 768) + "px";
    }

    await IframeRenderer.loadSrcdoc(frame, html);

    // Let the page's JS settle.
    const waitMs = Math.max(0, (req.waitBeforeScraping || 0) * 1000);
    if (waitMs) await IframeRenderer.delay(waitMs);

    const doc = frame.contentDocument;
    if (!doc) {
      // Same-origin read blocked unexpectedly — fall back to the fetched HTML.
      Logger.warn("[IframeRenderer] contentDocument unreadable; using raw HTML");
      const parsed = HtmlProcessor.parse(html);
      const p = HtmlProcessor.process(parsed, req);
      return { html: p.html, markdown: p.markdown, finalUrl, statusCode, websiteUnreachable: false };
    }

    // Run interaction actions in order, best-effort.
    if (req.actions && req.actions.length) {
      for (const action of req.actions) {
        try {
          await IframeRenderer.runAction(doc, action);
        } catch (e) {
          Logger.debug("[IframeRenderer] action failed:", action, e);
        }
      }
    }

    const processed = HtmlProcessor.process(doc, req);
    return {
      html: processed.html,
      markdown: processed.markdown,
      finalUrl,
      statusCode,
      websiteUnreachable: false,
    };
  }

  private static loadSrcdoc(frame: HTMLIFrameElement, html: string): Promise<void> {
    return new Promise<void>((resolve) => {
      let done = false;
      const finish = (): void => {
        if (done) return;
        done = true;
        frame.removeEventListener("load", finish);
        resolve();
      };
      frame.addEventListener("load", finish);
      // Safety: resolve even if 'load' never fires.
      setTimeout(finish, 15000);
      try {
        frame.srcdoc = html;
      } catch (e) {
        Logger.error("[IframeRenderer] srcdoc set failed:", e);
        finish();
      }
    });
  }

  private static delay(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }

  private static async runAction(doc: Document, action: Action): Promise<void> {
    switch (action.type) {
      case "wait":
        await IframeRenderer.delay(action.milliseconds || 0);
        break;
      case "click": {
        const el = doc.querySelector(action.selector) as HTMLElement | null;
        if (el) el.click();
        break;
      }
      case "fill_input":
      case "fill_textarea":
      case "select": {
        const el = doc.querySelector(action.selector) as
          | HTMLInputElement
          | null;
        if (el) el.value = action.value;
        break;
      }
      case "scroll": {
        const win = doc.defaultView;
        if (win) {
          const amt = action.amount || 0;
          win.scrollBy({
            top: action.direction === "up" ? -amt : amt,
            left:
              action.direction === "left"
                ? -amt
                : action.direction === "right"
                ? amt
                : 0,
          });
        }
        break;
      }
      default:
        Logger.debug("[IframeRenderer] unknown action:", action.type);
    }
  }
}
