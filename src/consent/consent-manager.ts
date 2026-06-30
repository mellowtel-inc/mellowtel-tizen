import { TizenStorage } from "../storage/tizen-storage";
import { STORAGE_KEYS } from "../constants";
import { Logger } from "../utils/logger";

/**
 * Opt-in state. A single persisted tri-state:
 *   undefined => user has not decided yet (default; SDK fully dormant)
 *   true      => opted in
 *   false     => opted out
 *
 * The entire data-sharing pipeline is gated on this being exactly `true`.
 */
export class ConsentManager {
  /** Returns true/false once decided, or undefined if the user hasn't chosen. */
  static async getOptInStatus(): Promise<boolean | undefined> {
    const raw = await TizenStorage.get(STORAGE_KEYS.optIn);
    if (raw === null) return undefined;
    return raw === "true";
  }

  static async isOptedIn(): Promise<boolean> {
    return (await ConsentManager.getOptInStatus()) === true;
  }

  static async optIn(): Promise<void> {
    await TizenStorage.set(STORAGE_KEYS.optIn, "true");
    Logger.info("[Consent] user opted in");
  }

  static async optOut(): Promise<void> {
    await TizenStorage.set(STORAGE_KEYS.optIn, "false");
    Logger.info("[Consent] user opted out");
  }

  /** Has the user made any decision yet? */
  static async hasDecided(): Promise<boolean> {
    return (await ConsentManager.getOptInStatus()) !== undefined;
  }
}
