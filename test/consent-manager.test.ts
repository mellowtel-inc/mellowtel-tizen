import { ConsentManager } from "../src/consent/consent-manager";

describe("ConsentManager", () => {
  beforeEach(() => localStorage.clear());

  it("defaults to undefined (no decision) and not opted in", async () => {
    expect(await ConsentManager.getOptInStatus()).toBeUndefined();
    expect(await ConsentManager.isOptedIn()).toBe(false);
    expect(await ConsentManager.hasDecided()).toBe(false);
  });

  it("opts in", async () => {
    await ConsentManager.optIn();
    expect(await ConsentManager.getOptInStatus()).toBe(true);
    expect(await ConsentManager.isOptedIn()).toBe(true);
    expect(await ConsentManager.hasDecided()).toBe(true);
  });

  it("opts out", async () => {
    await ConsentManager.optIn();
    await ConsentManager.optOut();
    expect(await ConsentManager.getOptInStatus()).toBe(false);
    expect(await ConsentManager.isOptedIn()).toBe(false);
    expect(await ConsentManager.hasDecided()).toBe(true);
  });
});
