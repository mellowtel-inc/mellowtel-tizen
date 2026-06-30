import { TizenStorage } from "../storage/tizen-storage";
import { STORAGE_KEYS } from "../constants";
import { randomString } from "../utils/uuid";
import { Logger } from "../utils/logger";

/**
 * Node identity.
 *
 * Format matches the live Mellowtel SDKs exactly:  mllwtl_<publicKey>_<rand10>
 * - stable across app restarts (persisted under STORAGE_KEYS.nodeId)
 * - the publicKey is embedded IN the id; it is never sent as a separate param
 * - if the stored id was minted for a different publicKey, the 10-char random
 *   tail is preserved and only the key segment is swapped (mirrors Electron's
 *   getOrGenerateIdentifier), so a device keeps a stable tail across key changes.
 *
 * This is the `device_id` sent on the WebSocket connect and /approval calls.
 */
export class IdentityHelpers {
  private static cached: string | null = null;

  /** Returns the persisted node id, generating + storing one on first call. */
  static async getOrCreateNodeId(publicKey: string): Promise<string> {
    if (IdentityHelpers.cached) return IdentityHelpers.cached;

    const existing = await TizenStorage.get(STORAGE_KEYS.nodeId);

    if (!existing) {
      return IdentityHelpers.generate(publicKey);
    }
    if (existing.indexOf(`mllwtl_${publicKey}_`) === 0) {
      IdentityHelpers.cached = existing;
      return existing;
    }
    if (existing.indexOf("mllwtl_") === 0) {
      // keep the random tail, swap the key segment
      const parts = existing.split("_");
      const tail = parts.length >= 3 ? parts[2] : randomString(10);
      return IdentityHelpers.generate(publicKey, tail);
    }
    return IdentityHelpers.generate(publicKey);
  }

  /** Returns the node id if one has been created this session, else null. */
  static getCachedNodeId(): string | null {
    return IdentityHelpers.cached;
  }

  private static async generate(publicKey: string, tail?: string): Promise<string> {
    const rand = tail || randomString(10);
    const id = `mllwtl_${publicKey}_${rand}`;
    await TizenStorage.set(STORAGE_KEYS.nodeId, id);
    IdentityHelpers.cached = id;
    Logger.debug("[Identity] node id:", id);
    return id;
  }

  /** Test/utility hook to clear the in-memory cache. */
  static _resetCache(): void {
    IdentityHelpers.cached = null;
  }
}
