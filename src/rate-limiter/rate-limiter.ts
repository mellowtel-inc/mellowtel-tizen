import { TizenStorage } from "../storage/tizen-storage";
import {
  STORAGE_KEYS,
  MAX_DAILY_RATE,
  MAX_HOURLY_RATE,
  DAY_MS,
  HOUR_MS,
} from "../constants";
import { Logger } from "../utils/logger";

/**
 * Daily + hourly job gate.
 *
 * Mirrors the Electron SDK's daily counter and adds an hourly cap with burst
 * headroom (MAX_DAILY_RATE / 24 * 1.5). Both windows auto-reset once elapsed.
 *
 * canExecute() is a read-only check (no increment) used before connecting and
 * before accepting a job. incrementCount() is called AFTER a job succeeds, so a
 * job that fails to render does not consume quota.
 */
export class RateLimiter {
  private static async readWindow(
    countKey: string,
    resetKey: string,
    windowMs: number
  ): Promise<{ count: number; resetAt: number; expired: boolean }> {
    const now = Date.now();
    const countRaw = await TizenStorage.get(countKey);
    const resetRaw = await TizenStorage.get(resetKey);
    const count = countRaw ? parseInt(countRaw, 10) || 0 : 0;
    const resetAt = resetRaw ? parseInt(resetRaw, 10) || 0 : 0;
    const expired = resetAt === 0 || now - resetAt >= windowMs;
    return { count, resetAt, expired };
  }

  /** True if BOTH the daily and hourly windows have remaining quota. */
  static async canExecute(): Promise<boolean> {
    const daily = await RateLimiter.readWindow(
      STORAGE_KEYS.dailyCount,
      STORAGE_KEYS.dailyResetAt,
      DAY_MS
    );
    const hourly = await RateLimiter.readWindow(
      STORAGE_KEYS.hourlyCount,
      STORAGE_KEYS.hourlyResetAt,
      HOUR_MS
    );
    const dailyOk = daily.expired || daily.count < MAX_DAILY_RATE;
    const hourlyOk = hourly.expired || hourly.count < MAX_HOURLY_RATE;
    if (!dailyOk) Logger.warn("[RateLimiter] daily limit reached");
    if (!hourlyOk) Logger.warn("[RateLimiter] hourly limit reached");
    return dailyOk && hourlyOk;
  }

  /** Records one executed job, resetting either window if it has elapsed. */
  static async incrementCount(): Promise<void> {
    const now = Date.now();

    const daily = await RateLimiter.readWindow(
      STORAGE_KEYS.dailyCount,
      STORAGE_KEYS.dailyResetAt,
      DAY_MS
    );
    if (daily.expired) {
      await TizenStorage.set(STORAGE_KEYS.dailyCount, "1");
      await TizenStorage.set(STORAGE_KEYS.dailyResetAt, String(now));
    } else {
      await TizenStorage.set(STORAGE_KEYS.dailyCount, String(daily.count + 1));
    }

    const hourly = await RateLimiter.readWindow(
      STORAGE_KEYS.hourlyCount,
      STORAGE_KEYS.hourlyResetAt,
      HOUR_MS
    );
    if (hourly.expired) {
      await TizenStorage.set(STORAGE_KEYS.hourlyCount, "1");
      await TizenStorage.set(STORAGE_KEYS.hourlyResetAt, String(now));
    } else {
      await TizenStorage.set(STORAGE_KEYS.hourlyCount, String(hourly.count + 1));
    }
  }

  /** Current counts (for diagnostics/stats). */
  static async getCounts(): Promise<{ daily: number; hourly: number }> {
    const daily = await RateLimiter.readWindow(
      STORAGE_KEYS.dailyCount,
      STORAGE_KEYS.dailyResetAt,
      DAY_MS
    );
    const hourly = await RateLimiter.readWindow(
      STORAGE_KEYS.hourlyCount,
      STORAGE_KEYS.hourlyResetAt,
      HOUR_MS
    );
    return {
      daily: daily.expired ? 0 : daily.count,
      hourly: hourly.expired ? 0 : hourly.count,
    };
  }
}
