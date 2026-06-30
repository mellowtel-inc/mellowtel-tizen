import { DataRequest } from "../src/jobs/data-request";

describe("DataRequest.fromJson", () => {
  it("applies Electron-matching defaults", () => {
    const req = DataRequest.fromJson({ url: "https://x.com", recordID: "r1" });
    expect(req.saveMarkdown).toBe(true);
    expect(req.saveHtml).toBe(false);
    expect(req.removeCSSselectors).toBe("default");
    expect(req.waitBeforeScraping).toBe(1);
    expect(req.save_html_endpoint).toBe("https://request.mellow.tel/");
    expect(req.windowSize).toEqual({ width: 1024, height: 768 });
  });

  it("uses recordID (not jobId) as the identifier", () => {
    const req = DataRequest.fromJson({ url: "https://x.com", recordID: "abc123" });
    expect(req.recordID).toBe("abc123");
  });

  it("parses JSON-string nested fields", () => {
    const req = DataRequest.fromJson({
      url: "https://x.com",
      recordID: "r1",
      actions: JSON.stringify([{ type: "click", selector: ".btn" }]),
      classNamesToBeRemoved: JSON.stringify(["ad", "banner"]),
      method_headers: JSON.stringify({ "X-Test": "1" }),
    });
    expect(req.actions).toEqual([{ type: "click", selector: ".btn" }]);
    expect(req.classNamesToBeRemoved).toEqual(["ad", "banner"]);
    expect(req.method_headers).toEqual({ "X-Test": "1" });
  });

  it("survives malformed nested JSON with safe fallbacks", () => {
    const req = DataRequest.fromJson({
      url: "https://x.com",
      recordID: "r1",
      actions: "{broken",
      classNamesToBeRemoved: "nope",
    });
    expect(req.actions).toEqual([]);
    expect(req.classNamesToBeRemoved).toEqual([]);
  });

  it("parses pixel screen sizes", () => {
    const req = DataRequest.fromJson({
      url: "https://x.com",
      recordID: "r1",
      screen_width: "1709px",
      screen_height: "984px",
    });
    expect(req.windowSize).toEqual({ width: 1709, height: 984 });
  });

  it("retains the raw json for requestMessageInfo", () => {
    const raw = { url: "https://x.com", recordID: "r1", orgId: "org9" };
    const req = DataRequest.fromJson(raw);
    expect(req.json).toBe(raw);
    expect(req.orgId).toBe("org9");
  });
});
