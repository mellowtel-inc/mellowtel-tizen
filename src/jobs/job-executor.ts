import { DataRequest } from "./data-request";
import { JobResult } from "../types";
import { ParserJob } from "./parser-job";
import { IframeRenderer } from "./iframe-renderer";
import { ResultUploader } from "../upload/result-uploader";
import { RateLimiter } from "../rate-limiter/rate-limiter";
import { RequestCounter } from "../utils/request-counter";
import { Logger } from "../utils/logger";

export interface ExecuteOptions {
  batchExecution?: boolean;
  batchId?: string;
}

/**
 * Orchestrates one job: rate-check → pick render strategy → render → upload →
 * count. Screenshots are unsupported in v1, so htmlVisualizer jobs are skipped
 * (the matchmaker shouldn't route them given screenshots=false, but we guard
 * anyway).
 */
export class JobExecutor {
  constructor(private nodeId: string) {}

  /** Chooses Option A vs Option C. */
  private static needsJsRendering(req: DataRequest): boolean {
    // parser/direct-fetch jobs never need rendering.
    if (req.parser_job || (req.method_endpoint && req.method_endpoint.length)) {
      return false;
    }
    if (req.fetchInstead) return false; // explicit no-JS
    // Default to the JS-capable path for normal page scrapes; ParserJob is used
    // for explicitly static/fetch jobs above.
    return true;
  }

  /** Execute and deliver a job. Returns true if a result was uploaded. */
  async execute(req: DataRequest, options: ExecuteOptions = {}): Promise<boolean> {
    if (!req.url || !req.recordID) {
      Logger.warn("[JobExecutor] missing url/recordID, dropping");
      return false;
    }

    if (req.htmlVisualizer || req.fullpageScreenshot) {
      Logger.warn("[JobExecutor] screenshot job received but unsupported in v1; dropping", req.recordID);
      return false;
    }

    if (!(await RateLimiter.canExecute())) {
      Logger.warn("[JobExecutor] rate limited, dropping", req.recordID);
      return false;
    }

    let result: JobResult;
    try {
      result = JobExecutor.needsJsRendering(req)
        ? await IframeRenderer.run(req)
        : await ParserJob.run(req);
    } catch (e) {
      Logger.error("[JobExecutor] render failed for", req.recordID, e);
      // Report the failure so the backend's poll can resolve (unreachable).
      result = {
        html: "",
        markdown: "",
        finalUrl: req.url,
        statusCode: 0,
        websiteUnreachable: true,
      };
    }

    const uploaded = await ResultUploader.uploadText(req, this.nodeId, result, {
      batchExecution: options.batchExecution,
      batchId: options.batchId,
    });

    if (uploaded && !result.websiteUnreachable) {
      await RateLimiter.incrementCount();
      await RequestCounter.increment();
    }
    return uploaded;
  }
}
