import { DataRequest } from "../jobs/data-request";
import { JobResult } from "../types";
import { GENERATE_UPLOAD_URL_ENDPOINT, REQUEST_ENDPOINT } from "../constants";
import { Logger } from "../utils/logger";

/**
 * Ships a finished job back to Mellowtel.
 *
 * Text results: POST the full body to `save_html_endpoint` (default
 * https://request.mellow.tel/) — body shape matches the Electron SDK's
 * saveCrawl (recordID, content, markDown, node_identifier, orgId, save flags,
 * cereal_result, batch info, final_url, statusCode). The backend learns the job
 * is done by polling its DynamoDB scrape_<recordID> row; there is NO WebSocket
 * completion message in the live protocol.
 *
 * Binary results (files): request a presigned S3 URL, PUT the bytes. (Screenshots
 * are disabled in v1, so the binary path is only used for saveFile jobs.)
 */
export class ResultUploader {
  /** POST a text/markdown result. Returns true on success. */
  static async uploadText(
    req: DataRequest,
    nodeId: string,
    result: JobResult,
    options?: { batchExecution?: boolean; batchId?: string; cerealResult?: any }
  ): Promise<boolean> {
    const endpoint = req.save_html_endpoint || REQUEST_ENDPOINT;
    const batchExecution = options?.batchExecution ?? false;
    const batchId = options?.batchId ?? "";
    const cerealResult = options?.cerealResult ?? {};

    const body: { [k: string]: any } = {
      recordID: req.recordID,
      fastLane: req.fastLane,
      url: req.url,
      htmlTransformer: req.htmlTransformer,
      orgId: req.orgId,
      saveText: req.saveText,
      node_identifier: nodeId,
      BATCH_execution: batchExecution,
      batch_id: batchId,
      final_url: result.finalUrl || req.url,
      website_unreachable: result.websiteUnreachable,
      statusCode: result.statusCode,
      requestMessageInfo: req.json,
      saveHtml: req.saveHtml,
      saveMarkdown: req.saveMarkdown,
      cereal_result: JSON.stringify({ data: cerealResult, success: true }),
      file_name_bytes: "",
    };

    if (req.parser_job) {
      body.json = JSON.stringify(cerealResult);
    } else {
      if (req.saveHtml) body.content = result.html;
      if (req.saveMarkdown) body.markDown = result.markdown;
    }

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`saveCrawl HTTP ${res.status} ${txt}`);
      }
      Logger.info("[Upload] result delivered for", req.recordID);
      return true;
    } catch (e) {
      Logger.error("[Upload] failed for", req.recordID, e);
      return false;
    }
  }

  /** Request a presigned S3 URL for binary content. */
  static async getSignedUrl(
    recordID: string,
    contentType: string
  ): Promise<{ uploadUrl: string; fileName: string } | null> {
    try {
      const res = await fetch(GENERATE_UPLOAD_URL_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ record_id: recordID, content_type: contentType }),
      });
      if (!res.ok) throw new Error(`generate-upload-url HTTP ${res.status}`);
      const data = await res.json();
      return { uploadUrl: data.uploadUrl, fileName: data.fileName };
    } catch (e) {
      Logger.error("[Upload] getSignedUrl failed:", e);
      return null;
    }
  }

  /** PUT bytes to a presigned S3 URL. */
  static async uploadBinary(
    uploadUrl: string,
    contentType: string,
    bytes: ArrayBuffer | Uint8Array
  ): Promise<boolean> {
    try {
      const res = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": contentType, "x-amz-acl": "public-read" },
        body: (bytes instanceof Uint8Array
          ? bytes
          : new Uint8Array(bytes)) as unknown as BodyInit,
      });
      if (!res.ok) throw new Error(`S3 PUT HTTP ${res.status}`);
      return true;
    } catch (e) {
      Logger.error("[Upload] uploadBinary failed:", e);
      return false;
    }
  }
}
