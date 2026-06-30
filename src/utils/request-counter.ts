import { TizenStorage } from "../storage/tizen-storage";
import { STORAGE_KEYS } from "../constants";
import { Stats } from "../types";

/**
 * Cumulative stats counter (never resets), separate from the rate limiter.
 * Mirrors the Electron SDK: a running total plus a { "YYYY-MM-DD": count } map.
 */

function today(): string {
  return new Date().toISOString().split("T")[0];
}

export class RequestCounter {
  /** Increment total + today's bucket after a successful job. */
  static async increment(): Promise<void> {
    const totalRaw = await TizenStorage.get(STORAGE_KEYS.totalRequests);
    const total = totalRaw ? parseInt(totalRaw, 10) || 0 : 0;
    await TizenStorage.set(STORAGE_KEYS.totalRequests, String(total + 1));

    const history =
      (await TizenStorage.getJSON<{ [date: string]: number }>(
        STORAGE_KEYS.dailyHistory
      )) || {};
    const d = today();
    history[d] = (history[d] || 0) + 1;
    await TizenStorage.setJSON(STORAGE_KEYS.dailyHistory, history);
  }

  static async getTotal(): Promise<number> {
    const raw = await TizenStorage.get(STORAGE_KEYS.totalRequests);
    return raw ? parseInt(raw, 10) || 0 : 0;
  }

  static async getDailyHistory(): Promise<{ [date: string]: number }> {
    return (
      (await TizenStorage.getJSON<{ [date: string]: number }>(
        STORAGE_KEYS.dailyHistory
      )) || {}
    );
  }

  static async getToday(): Promise<number> {
    const history = await RequestCounter.getDailyHistory();
    return history[today()] || 0;
  }

  static async getStats(): Promise<Stats> {
    return {
      total: await RequestCounter.getTotal(),
      daily: await RequestCounter.getToday(),
      dailyHistory: await RequestCounter.getDailyHistory(),
    };
  }
}
