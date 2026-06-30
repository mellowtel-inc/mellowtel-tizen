import { MellowtelOptions, Stats } from "./types";
import { Logger } from "./utils/logger";
import { IdentityHelpers } from "./identity/identity-helpers";
import { ConsentManager } from "./consent/consent-manager";
import { showConsentDialog, ConsentDialogOptions } from "./consent/consent-dialog";
import { WebSocketClient } from "./websocket/websocket-client";
import { ApprovalChecker } from "./approval/approval-checker";
import { SpeedTest } from "./speed-test/speed-test";
import { RequestCounter } from "./utils/request-counter";
import { IframePool } from "./jobs/iframe-pool";
import { TizenStorage } from "./storage/tizen-storage";
import { STORAGE_KEYS } from "./constants";

/**
 * Public SDK facade for Samsung Tizen TV Web apps.
 *
 * Lifecycle:
 *   const m = new Mellowtel('PUBLIC_KEY');
 *   await m.initBackground();              // identity + config, no network
 *   if (await m.showConsentDialog()) {     // OFF by default
 *     await m.start();                     // gates → connect → receive jobs
 *   }
 *   ...
 *   await m.stop();                        // disconnect, stay opted-in
 *
 * The facade is intentionally thin; all real work lives in the modules it wires.
 */
export class Mellowtel {
  private publicKey: string;
  private nodeId = "";
  private initialized = false;
  private started = false;
  private ws = WebSocketClient.getInstance();

  constructor(publicKey: string, options: MellowtelOptions = {}) {
    if (!publicKey) throw new Error("[Mellowtel] publicKey is required");
    this.publicKey = publicKey;
    Logger.configure(options.disableLogs !== false, options.logLevel);
  }

  /** Resolve identity + persist config. No network, no consent prompt. */
  async initBackground(): Promise<void> {
    if (this.initialized) return;
    this.nodeId = await IdentityHelpers.getOrCreateNodeId(this.publicKey);
    await TizenStorage.set(STORAGE_KEYS.publicKey, this.publicKey);
    this.initialized = true;
    Logger.info("[Mellowtel] initialized, node:", this.nodeId);

    // If the user previously opted in, auto-start on launch.
    if (await ConsentManager.isOptedIn()) {
      await this.start();
    }
  }

  /**
   * Begin operating: opt-in gate → approval (kill switch) → connect.
   * No-op (with a warning) if the user is not opted in.
   */
  async start(): Promise<boolean> {
    if (!this.initialized) await this.initBackground();
    if (this.started && this.ws.isConnected()) return true;

    if (!(await ConsentManager.isOptedIn())) {
      Logger.warn("[Mellowtel] start() ignored — user not opted in");
      return false;
    }

    // Remote kill switch can disable an integration without a new build.
    if (await this.isDisabled()) {
      Logger.warn("[Mellowtel] integration disabled locally; not starting");
      return false;
    }

    const speed = await SpeedTest.measure();
    const approved = await ApprovalChecker.isApproved({
      device_id: this.nodeId,
      plugin_id: this.publicKey,
      speed_download: speed,
    });
    if (!approved) {
      Logger.warn("[Mellowtel] not approved by /approval; not connecting");
      return false;
    }

    const ok = this.ws.connect({
      nodeId: this.nodeId,
      publicKey: this.publicKey,
      speedDownload: speed,
    });
    this.started = ok;
    return ok;
  }

  /** Stop operating (disconnect) without changing opt-in state. */
  async stop(): Promise<void> {
    this.ws.disconnect();
    IframePool.getInstance().shutdown();
    this.started = false;
    Logger.info("[Mellowtel] stopped");
  }

  // --- consent ---

  /** Show the TV consent modal; persists + returns the user's choice. */
  async showConsentDialog(options?: ConsentDialogOptions): Promise<boolean> {
    // Only prompt if the user hasn't already decided.
    if (await ConsentManager.hasDecided()) {
      return (await ConsentManager.getOptInStatus()) === true;
    }
    const accepted = await showConsentDialog(options);
    if (accepted) {
      await this.optIn();
    } else {
      await ConsentManager.optOut();
    }
    return accepted;
  }

  async optIn(): Promise<void> {
    await ConsentManager.optIn();
    if (this.initialized) await this.start();
  }

  async optOut(): Promise<void> {
    await ConsentManager.optOut();
    await this.stop();
  }

  async getOptInStatus(): Promise<boolean | undefined> {
    return ConsentManager.getOptInStatus();
  }

  // --- info / stats ---

  getNodeId(): string {
    return this.nodeId;
  }

  async getStats(): Promise<Stats> {
    return RequestCounter.getStats();
  }

  private async isDisabled(): Promise<boolean> {
    return (await TizenStorage.get(STORAGE_KEYS.disabled)) === "true";
  }
}
