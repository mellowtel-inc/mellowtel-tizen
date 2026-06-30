import {
  APPROVAL_API_URL,
  APPROVAL_CHECK_INTERVAL,
  STORAGE_KEYS,
  VERSION,
  PLATFORM,
  SUPPORTS_SCREENSHOTS,
} from "../constants";
import { TizenStorage } from "../storage/tizen-storage";
import { Logger } from "../utils/logger";

/**
 * Remote kill-switch / approval gate.
 *
 * Matches the live browser SDK: GET https://api.mellow.tel/approval with query
 * params, response shape { approval: boolean }. Lets Mellowtel pause a
 * misbehaving integration without shipping a new build. Result cached 30 min.
 *
 * Param names mirror the live SDK (device_id, plugin_id, version, speed_download,
 * platform, ...). Tizen has no Pascoli/Meucci/Burke features, so those flags are
 * sent as false for protocol compatibility. `screenshots` advertises capability.
 */

interface ApprovalCache {
  timestamp: number;
  isApproved: boolean;
}

export interface ApprovalParams {
  device_id: string;
  plugin_id: string;
  speed_download: number;
}

export class ApprovalChecker {
  /** Returns true if the node is approved to connect. Cached for 30 min. */
  static async isApproved(params: ApprovalParams): Promise<boolean> {
    const cached = await TizenStorage.getJSON<ApprovalCache>(
      STORAGE_KEYS.approvalCache
    );
    const now = Date.now();
    if (cached && now - cached.timestamp < APPROVAL_CHECK_INTERVAL) {
      Logger.debug("[Approval] using cached result:", cached.isApproved);
      return cached.isApproved;
    }

    const query = new URLSearchParams({
      device_id: params.device_id,
      plugin_id: params.plugin_id,
      version: VERSION,
      speed_download: String(params.speed_download),
      platform: PLATFORM,
      manifest_version: "tizen",
      pascoli: "false",
      burke: "false",
      meucci: "false",
      screenshots: String(SUPPORTS_SCREENSHOTS),
      ws_client: "new_ws",
    });

    try {
      const res = await fetch(`${APPROVAL_API_URL}?${query.toString()}`);
      const json = await res.json();
      if (!res.ok) {
        throw new Error(`approval HTTP ${res.status}`);
      }
      const isApproved = json && json.approval === true;
      await TizenStorage.setJSON(STORAGE_KEYS.approvalCache, {
        timestamp: now,
        isApproved,
      } as ApprovalCache);
      Logger.info("[Approval] result:", isApproved);
      return isApproved;
    } catch (e) {
      Logger.error("[Approval] check failed:", e);
      // Fail-closed: if we cannot confirm approval, do not connect.
      return false;
    }
  }

  /** Clears the cached approval (e.g. after a forced reconnect). */
  static async clearCache(): Promise<void> {
    await TizenStorage.remove(STORAGE_KEYS.approvalCache);
  }
}
