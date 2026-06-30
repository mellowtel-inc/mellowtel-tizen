import { Action } from "../types";
import { REQUEST_ENDPOINT } from "../constants";

/**
 * Incoming scrape job — the wire contract from the matchmaker.
 *
 * Field names mirror the live Mellowtel SDKs exactly (recordID, orgId,
 * save_html_endpoint, screen_width, etc.). Nested fields arrive as JSON strings
 * and must be parsed; defaults match the Electron SDK so a Tizen node behaves
 * identically to existing nodes.
 */

interface Size {
  width: number;
  height: number;
}

export class DataRequest {
  url: string;
  orgId: string;
  recordID: string;
  waitBeforeScraping: number; // seconds
  htmlVisualizer: boolean;
  windowSize: Size;
  saveHtml: boolean;
  saveMarkdown: boolean;
  saveText: boolean;
  saveFile: boolean;
  htmlTransformer: string;
  removeCSSselectors: string;
  classNamesToBeRemoved: string[];
  fullpageScreenshot: boolean;
  removeImages: boolean;
  fastLane: boolean;
  actions: Action[];
  method: string;
  method_endpoint: string;
  method_payload: string;
  method_headers: any;
  fetchInstead: boolean;
  htmlContained: boolean;
  pascoli: boolean;
  save_html_endpoint: string;
  connectionID: string;
  cerealObject: string;
  parser_job: boolean;
  json: { [key: string]: any };

  constructor(params: Partial<DataRequest> & { url: string; recordID: string }) {
    this.url = params.url;
    this.orgId = params.orgId ?? "";
    this.recordID = params.recordID;
    this.waitBeforeScraping = params.waitBeforeScraping ?? 1;
    this.htmlVisualizer = params.htmlVisualizer ?? false;
    this.windowSize = params.windowSize ?? { width: 1024, height: 768 };
    this.saveHtml = params.saveHtml ?? false;
    this.saveMarkdown = params.saveMarkdown ?? true;
    this.saveText = params.saveText ?? false;
    this.saveFile = params.saveFile ?? false;
    this.htmlTransformer = params.htmlTransformer ?? "none";
    this.removeCSSselectors = params.removeCSSselectors ?? "default";
    this.classNamesToBeRemoved = params.classNamesToBeRemoved ?? [];
    this.fullpageScreenshot = params.fullpageScreenshot ?? false;
    this.removeImages = params.removeImages ?? false;
    this.fastLane = params.fastLane ?? true;
    this.actions = params.actions ?? [];
    this.method = params.method ?? "GET_NORMAL";
    this.method_endpoint = params.method_endpoint ?? "";
    this.method_payload = params.method_payload ?? "no_payload";
    this.method_headers = params.method_headers ?? "no_headers";
    this.fetchInstead = params.fetchInstead ?? false;
    this.htmlContained = params.htmlContained ?? false;
    this.pascoli = params.pascoli ?? false;
    this.save_html_endpoint = params.save_html_endpoint ?? REQUEST_ENDPOINT;
    this.connectionID = params.connectionID ?? "";
    this.cerealObject = params.cerealObject ?? "{}";
    this.parser_job = params.parser_job ?? false;
    this.json = params.json ?? {};
  }

  /** Parse a "1024px" style size token to a number. */
  private static parseSize(size: any): number {
    if (typeof size === "number") return size;
    if (typeof size !== "string") return NaN;
    const n = parseFloat(size);
    return isNaN(n) ? NaN : n;
  }

  private static safeJSONParse<T>(value: any, fallback: T): T {
    if (value === undefined || value === null) return fallback;
    if (typeof value !== "string") return value as T;
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }

  /** Build a DataRequest from a raw server message object. */
  static fromJson(json: { [key: string]: any }): DataRequest {
    let parsedHeaders: any = "no_headers";
    if (json.method_headers && json.method_headers !== "no_headers") {
      parsedHeaders = DataRequest.safeJSONParse(json.method_headers, {});
    }

    const w = DataRequest.parseSize(json.screen_width);
    const h = DataRequest.parseSize(json.screen_height);
    const windowSize: Size =
      !isNaN(w) && !isNaN(h) ? { width: w, height: h } : { width: 1024, height: 768 };

    return new DataRequest({
      url: json.url,
      orgId: json.orgId,
      recordID: json.recordID,
      waitBeforeScraping: json.waitBeforeScraping,
      htmlVisualizer: json.htmlVisualizer,
      windowSize,
      saveHtml: json.saveHtml,
      saveMarkdown: json.saveMarkdown,
      saveText: json.saveText,
      saveFile: json.saveFile,
      htmlTransformer: json.htmlTransformer,
      removeCSSselectors: json.removeCSSselectors,
      classNamesToBeRemoved: DataRequest.safeJSONParse<string[]>(
        json.classNamesToBeRemoved,
        []
      ),
      fullpageScreenshot: json.fullpageScreenshot,
      removeImages: json.removeImages,
      fastLane: json.fastLane,
      actions: DataRequest.safeJSONParse<Action[]>(json.actions, []),
      method: json.method,
      method_endpoint: json.method_endpoint,
      method_payload: json.method_payload,
      method_headers: parsedHeaders,
      fetchInstead: json.fetchInstead,
      htmlContained: json.htmlContained,
      pascoli: json.pascoli,
      save_html_endpoint: json.save_html_endpoint,
      connectionID: json.connectionID,
      cerealObject: json.cerealObject,
      parser_job: json.parser_job,
      json,
    });
  }
}
