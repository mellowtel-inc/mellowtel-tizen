import { DataRequest } from "./data-request";
import { JobResult } from "../types";
import { HtmlProcessor } from "../html/html-processor";
import { Logger } from "../utils/logger";

/**
 * Option A renderer (primary path).
 *
 * Plain `fetch` → `DOMParser` → HtmlProcessor. No JS execution. Used for
 * parser_job, method_endpoint direct requests, and static/SSR pages. Tizen's
 * `http://tizen.org/privilege/internet` privilege relaxes CORS for packaged
 * apps, so cross-origin fetch returns the real body.
 */
export class ParserJob {
  static async run(req: DataRequest): Promise<JobResult> {
    const target =
      req.method_endpoint && req.method_endpoint.length
        ? req.method_endpoint
        : req.url;

    const init: RequestInit = {
      method: ParserJob.httpMethod(req),
      redirect: "follow",
    };
    if (req.method_headers && req.method_headers !== "no_headers") {
      init.headers = req.method_headers;
    }
    if (req.method_payload && req.method_payload !== "no_payload") {
      init.body = req.method_payload;
    }

    let statusCode = 0;
    let finalUrl = req.url;
    let html = "";
    let unreachable = false;

    try {
      const res = await fetch(target, init);
      statusCode = res.status;
      finalUrl = res.url || req.url;
      html = await res.text();
    } catch (e) {
      Logger.error("[ParserJob] fetch failed for", target, e);
      unreachable = true;
      return { html: "", markdown: "", finalUrl, statusCode, websiteUnreachable: true };
    }

    // parser_job returns raw content; cereal/JSON handling happens upstream.
    if (req.parser_job) {
      return { html, markdown: "", finalUrl, statusCode, websiteUnreachable: false };
    }

    const doc = HtmlProcessor.parse(html);
    const processed = HtmlProcessor.process(doc, req);
    return {
      html: processed.html,
      markdown: processed.markdown,
      finalUrl,
      statusCode,
      websiteUnreachable: unreachable,
    };
  }

  private static httpMethod(req: DataRequest): string {
    // The wire uses tokens like GET_NORMAL/POST; normalize to real HTTP verbs.
    const m = (req.method || "GET").toUpperCase();
    if (m.indexOf("POST") !== -1) return "POST";
    if (m.indexOf("PUT") !== -1) return "PUT";
    if (m.indexOf("DELETE") !== -1) return "DELETE";
    return "GET";
  }
}
