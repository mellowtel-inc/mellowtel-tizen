import { ApprovalChecker } from "../src/approval/approval-checker";
import { STORAGE_KEYS } from "../src/constants";

describe("ApprovalChecker", () => {
  const params = { device_id: "mllwtl_K_abc", plugin_id: "K", speed_download: 50 };

  beforeEach(() => {
    localStorage.clear();
    (global as any).fetch = undefined;
  });

  it("returns true and caches when approval is granted", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ approval: true }),
    });
    (global as any).fetch = fetchMock;

    const result = await ApprovalChecker.isApproved(params);
    expect(result).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // call URL carries the real param names
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("device_id=mllwtl_K_abc");
    expect(url).toContain("platform=tizen-tv");
    expect(url).toContain("screenshots=false");
    expect(localStorage.getItem(STORAGE_KEYS.approvalCache)).toBeTruthy();
  });

  it("uses the cache on a second call (no second fetch)", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ approval: true }),
    });
    (global as any).fetch = fetchMock;

    await ApprovalChecker.isApproved(params);
    await ApprovalChecker.isApproved(params);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("fails closed (false) on network error", async () => {
    (global as any).fetch = jest.fn().mockRejectedValue(new Error("offline"));
    expect(await ApprovalChecker.isApproved(params)).toBe(false);
  });

  it("returns false when approval is denied", async () => {
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ approval: false }),
    });
    expect(await ApprovalChecker.isApproved(params)).toBe(false);
  });
});
