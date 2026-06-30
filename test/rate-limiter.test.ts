import { RateLimiter } from "../src/rate-limiter/rate-limiter";
import { STORAGE_KEYS, MAX_HOURLY_RATE } from "../src/constants";

describe("RateLimiter", () => {
  beforeEach(() => localStorage.clear());

  it("allows execution with empty counters", async () => {
    expect(await RateLimiter.canExecute()).toBe(true);
  });

  it("increments daily and hourly counts", async () => {
    await RateLimiter.incrementCount();
    const counts = await RateLimiter.getCounts();
    expect(counts.daily).toBe(1);
    expect(counts.hourly).toBe(1);
  });

  it("blocks when the hourly limit is reached", async () => {
    const now = Date.now();
    localStorage.setItem(STORAGE_KEYS.hourlyCount, String(MAX_HOURLY_RATE));
    localStorage.setItem(STORAGE_KEYS.hourlyResetAt, String(now));
    expect(await RateLimiter.canExecute()).toBe(false);
  });

  it("resets the hourly window after it elapses", async () => {
    const old = Date.now() - 2 * 60 * 60 * 1000; // 2h ago
    localStorage.setItem(STORAGE_KEYS.hourlyCount, String(MAX_HOURLY_RATE));
    localStorage.setItem(STORAGE_KEYS.hourlyResetAt, String(old));
    expect(await RateLimiter.canExecute()).toBe(true);
  });

  it("counters persist across restarts", async () => {
    await RateLimiter.incrementCount();
    await RateLimiter.incrementCount();
    const counts = await RateLimiter.getCounts();
    expect(counts.daily).toBe(2);
  });
});
