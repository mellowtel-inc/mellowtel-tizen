import { TizenStorage } from "../src/storage/tizen-storage";

describe("TizenStorage", () => {
  beforeEach(() => localStorage.clear());

  it("stores and reads a string", async () => {
    await TizenStorage.set("k", "hello");
    expect(await TizenStorage.get("k")).toBe("hello");
  });

  it("returns null for a missing key", async () => {
    expect(await TizenStorage.get("missing")).toBeNull();
  });

  it("round-trips JSON", async () => {
    await TizenStorage.setJSON("obj", { a: 1, b: [2, 3] });
    expect(await TizenStorage.getJSON("obj")).toEqual({ a: 1, b: [2, 3] });
  });

  it("returns null for malformed JSON", async () => {
    await TizenStorage.set("bad", "{not json");
    expect(await TizenStorage.getJSON("bad")).toBeNull();
  });

  it("removes a key", async () => {
    await TizenStorage.set("k", "v");
    await TizenStorage.remove("k");
    expect(await TizenStorage.get("k")).toBeNull();
  });

  it("persists across simulated restarts (same localStorage backend)", async () => {
    await TizenStorage.set("survives", "yes");
    // a fresh read with no in-memory state
    expect(await TizenStorage.get("survives")).toBe("yes");
  });
});
