import {
  STORAGE_KEYS,
  SPEED_TEST_CACHE_MS,
  SPEED_TEST_FALLBACK_MBPS,
} from "../constants";
import { TizenStorage } from "../storage/tizen-storage";
import { Logger } from "../utils/logger";

/**
 * Bandwidth measurement. Downloads a known-size file, times it, computes Mbps.
 * Result cached 24h. Falls back to a conservative stub on any failure so the
 * node still advertises a (modest) speed rather than blocking.
 *
 * The download URL is a Cloudflare speed-test endpoint that serves arbitrary
 * byte counts; swap for a Mellowtel-hosted asset if the backend prefers one.
 */

const DEFAULT_BYTES = 1_000_000; // 1 MB
const SPEED_TEST_URL = `https://speed.cloudflare.com/__down?bytes=${DEFAULT_BYTES}`;

interface SpeedCache {
  timestamp: number;
  mbps: number;
}

export class SpeedTest {
  /** Returns Mbps, using a cached value when fresh (<24h). */
  static async measure(): Promise<number> {
    const cached = await TizenStorage.getJSON<SpeedCache>(
      STORAGE_KEYS.lastSpeedTest
    );
    const now = Date.now();
    if (cached && now - cached.timestamp < SPEED_TEST_CACHE_MS) {
      Logger.debug("[SpeedTest] cached:", cached.mbps, "Mbps");
      return cached.mbps;
    }

    let mbps = SPEED_TEST_FALLBACK_MBPS;
    try {
      const start = Date.now();
      const res = await fetch(SPEED_TEST_URL, { cache: "no-store" });
      const buf = await res.arrayBuffer();
      const elapsedSec = (Date.now() - start) / 1000;
      const bytes = buf.byteLength || DEFAULT_BYTES;
      if (elapsedSec > 0) {
        mbps = Math.round(((bytes * 8) / elapsedSec / 1_000_000) * 100) / 100;
      }
      Logger.info("[SpeedTest] measured:", mbps, "Mbps");
    } catch (e) {
      Logger.error("[SpeedTest] failed, using fallback:", e);
      mbps = SPEED_TEST_FALLBACK_MBPS;
    }

    await TizenStorage.setJSON(STORAGE_KEYS.lastSpeedTest, {
      timestamp: now,
      mbps,
    } as SpeedCache);
    return mbps;
  }
}
