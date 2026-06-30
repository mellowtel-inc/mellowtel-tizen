import { IdentityHelpers } from "../src/identity/identity-helpers";
import { STORAGE_KEYS } from "../src/constants";

describe("IdentityHelpers", () => {
  beforeEach(() => {
    localStorage.clear();
    IdentityHelpers._resetCache();
  });

  it("generates an id in the mllwtl_<key>_<rand10> format", async () => {
    const id = await IdentityHelpers.getOrCreateNodeId("PUBKEY");
    expect(id).toMatch(/^mllwtl_PUBKEY_[a-z0-9]{10}$/);
  });

  it("persists and returns the same id across calls (restart)", async () => {
    const id1 = await IdentityHelpers.getOrCreateNodeId("PUBKEY");
    IdentityHelpers._resetCache(); // simulate process restart
    const id2 = await IdentityHelpers.getOrCreateNodeId("PUBKEY");
    expect(id2).toBe(id1);
  });

  it("preserves the random tail when the public key changes", async () => {
    const id1 = await IdentityHelpers.getOrCreateNodeId("KEY_A");
    const tail = id1.split("_")[2];
    IdentityHelpers._resetCache();
    const id2 = await IdentityHelpers.getOrCreateNodeId("KEY_B");
    expect(id2).toBe(`mllwtl_KEY_B_${tail}`);
  });

  it("writes the id to storage", async () => {
    const id = await IdentityHelpers.getOrCreateNodeId("PUBKEY");
    expect(localStorage.getItem(STORAGE_KEYS.nodeId)).toBe(id);
  });
});
