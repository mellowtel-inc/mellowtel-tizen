import { RequestCounter } from "../src/utils/request-counter";

describe("RequestCounter", () => {
  beforeEach(() => localStorage.clear());

  it("starts at zero", async () => {
    const stats = await RequestCounter.getStats();
    expect(stats.total).toBe(0);
    expect(stats.daily).toBe(0);
    expect(stats.dailyHistory).toEqual({});
  });

  it("increments total and today's bucket", async () => {
    await RequestCounter.increment();
    await RequestCounter.increment();
    const stats = await RequestCounter.getStats();
    expect(stats.total).toBe(2);
    expect(stats.daily).toBe(2);
    const today = new Date().toISOString().split("T")[0];
    expect(stats.dailyHistory[today]).toBe(2);
  });

  it("persists totals across restarts", async () => {
    await RequestCounter.increment();
    expect(await RequestCounter.getTotal()).toBe(1);
  });
});
