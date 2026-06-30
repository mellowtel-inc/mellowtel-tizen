import { DataRequest } from "../jobs/data-request";
import { JobExecutor } from "../jobs/job-executor";
import { RateLimiter } from "../rate-limiter/rate-limiter";
import { Logger } from "../utils/logger";

/**
 * Routes incoming server messages.
 *
 * Mirrors the Electron handler: ignores control frames with no `url`, supports
 * `type_event === 'batch'`, runs single jobs immediately, and drops failures
 * without crashing the socket. There is NO WebSocket completion message in the
 * live protocol — results go back via the result endpoint, so the handler does
 * not send job_complete.
 *
 * `logOnly` mode (Milestone 3) records jobs without executing them.
 */
export class MessageHandler {
  private executor: JobExecutor;

  constructor(nodeId: string, private logOnly = false) {
    this.executor = new JobExecutor(nodeId);
  }

  setLogOnly(v: boolean): void {
    this.logOnly = v;
  }

  async handle(raw: string): Promise<void> {
    let json: any;
    try {
      json = JSON.parse(raw);
    } catch (e) {
      Logger.debug("[MessageHandler] non-JSON message ignored:", e);
      return;
    }

    if (json.type_event === "batch") {
      await this.handleBatch(json);
      return;
    }

    // Control frames (heartbeat, disconnect_device, refresh_cereal) have no url.
    if (!json.url) {
      Logger.debug("[MessageHandler] control frame:", json.type_event || "(none)");
      return;
    }

    const req = DataRequest.fromJson(json);
    Logger.info("[MessageHandler] job:", req.recordID, req.url);

    if (this.logOnly) {
      Logger.info("[MessageHandler] logOnly mode — not executing");
      return;
    }

    if (!(await RateLimiter.canExecute())) {
      Logger.warn("[MessageHandler] rate limited, dropping", req.recordID);
      return;
    }

    this.executor.execute(req).catch((e) => {
      Logger.error("[MessageHandler] job error for", req.recordID, e);
    });
  }

  private async handleBatch(json: any): Promise<void> {
    let requests: any[] = [];
    try {
      requests = JSON.parse(json.batch_array);
    } catch (e) {
      Logger.error("[MessageHandler] bad batch_array:", e);
      return;
    }
    const parallel = json.parallel_executions_batch || 1;
    const delay = json.delay_between_executions || 0;
    const batchId = json.batch_id || "";
    Logger.info("[MessageHandler] batch:", requests.length, "jobs");

    if (this.logOnly) return;

    for (let i = 0; i < requests.length; i += parallel) {
      const chunk = requests.slice(i, i + parallel);
      await Promise.all(
        chunk.map((rd) => {
          const req = DataRequest.fromJson(rd);
          return this.executor
            .execute(req, { batchExecution: true, batchId })
            .catch((e) =>
              Logger.error("[MessageHandler] batch job failed:", req.recordID, e)
            );
        })
      );
      if (i + parallel < requests.length && delay > 0) {
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
}
