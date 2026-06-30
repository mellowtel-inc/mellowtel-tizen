import TurndownService from "turndown";
import { DataRequest } from "../jobs/data-request";
import { Logger } from "../utils/logger";

/**
 * HTML cleanup + Markdown conversion, shared by both render strategies.
 *
 * Operates on a Document (from DOMParser for Option A, or a live iframe document
 * for Option C). Strips noise, applies job-specified selector removal, then
 * serializes and converts to Markdown via Turndown — same Turndown settings as
 * the Electron SDK (atx headings, fenced code, `*` bullets).
 */

const DEFAULT_REMOVE_SELECTORS = [
  "script",
  "style",
  "noscript",
  "svg",
  "nav",
  "footer",
  '[role="alert"]',
  '[role="banner"]',
  '[role="dialog"]',
  '[role="alertdialog"]',
  '[role="region"][aria-label*="skip" i]',
  '[aria-modal="true"]',
];

// Always strip these, even when the job supplies a custom selector list.
const ALWAYS_REMOVE = ["script", "style", "noscript"];

export interface ProcessedHtml {
  html: string;
  markdown: string;
}

export class HtmlProcessor {
  private static buildTurndown(): TurndownService {
    return new TurndownService({
      headingStyle: "atx",
      codeBlockStyle: "fenced",
      bulletListMarker: "*",
    });
  }

  private static removeSelectors(doc: Document, selectors: string[]): void {
    selectors.forEach((sel) => {
      try {
        const els = doc.querySelectorAll(sel);
        for (let i = 0; i < els.length; i++) {
          const el = els[i];
          if (el && el.parentNode) el.parentNode.removeChild(el);
        }
      } catch (e) {
        Logger.debug("[HtmlProcessor] bad selector skipped:", sel, e);
      }
    });
  }

  private static removeImages(doc: Document): void {
    HtmlProcessor.removeSelectors(doc, ["img", "picture", "source"]);
  }

  private static removeClassNames(doc: Document, classNames: string[]): void {
    const sels = classNames
      .filter((c) => !!c)
      .map((c) => "." + c.replace(/^\./, ""));
    if (sels.length) HtmlProcessor.removeSelectors(doc, sels);
  }

  /**
   * Apply the job's cleanup rules to a Document and return HTML + Markdown.
   * The Document is mutated in place.
   */
  static process(doc: Document, req: DataRequest): ProcessedHtml {
    // Always strip executable/style noise.
    HtmlProcessor.removeSelectors(doc, ALWAYS_REMOVE);

    // removeCSSselectors: "default" | "none" | JSON array string
    const sel = req.removeCSSselectors;
    if (sel === "default") {
      HtmlProcessor.removeSelectors(doc, DEFAULT_REMOVE_SELECTORS);
    } else if (sel && sel !== "none" && sel !== "") {
      try {
        const parsed = JSON.parse(sel);
        if (Array.isArray(parsed) && parsed.length) {
          HtmlProcessor.removeSelectors(doc, parsed);
        }
      } catch (e) {
        Logger.debug("[HtmlProcessor] removeCSSselectors parse failed:", e);
      }
    }

    if (req.classNamesToBeRemoved && req.classNamesToBeRemoved.length) {
      HtmlProcessor.removeClassNames(doc, req.classNamesToBeRemoved);
    }
    if (req.removeImages) {
      HtmlProcessor.removeImages(doc);
    }

    const root = doc.documentElement;
    const html = root ? root.outerHTML : "";

    let markdown = "";
    if (req.saveMarkdown && html) {
      try {
        markdown = HtmlProcessor.buildTurndown().turndown(html);
      } catch (e) {
        Logger.error("[HtmlProcessor] turndown failed:", e);
        markdown = "";
      }
    }

    return { html, markdown };
  }

  /** Parse an HTML string into a Document (Option A entry point). */
  static parse(htmlString: string): Document {
    return new DOMParser().parseFromString(htmlString, "text/html");
  }
}
