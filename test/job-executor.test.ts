import { JobExecutor } from "../src/jobs/job-executor";
import { DataRequest } from "../src/jobs/data-request";
import { RequestCounter } from "../src/utils/request-counter";

/**
 * End-to-end proof that when the server sends a scrape job, the SDK actually
 * DOES the work: fetch the page -> clean/convert to Markdown -> build the correct
 * result upload body. fetch is mocked so nothing hits production; every other
 * step is the real SDK code running in jsdom (which mirrors the emulator's DOM).
 */
describe("JobExecutor — real job execution (Option A)", () => {
  const PAGE = `<html><head><title>Doc</title></head><body>
      <nav>site menu</nav>
      <h1>Breaking News</h1>
      <p>The quick brown fox jumps over the lazy dog.</p>
      <script>evil()</script>
    </body></html>`;

  let fetchMock: jest.Mock;

  beforeEach(() => {
    localStorage.clear();
    fetchMock = jest.fn((url: any) => {
      const u = String(url);
      if (u.indexOf("request.mellow.tel") !== -1) {
        // the result-upload endpoint
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve('{"ok":true}'),
          json: () => Promise.resolve({ ok: true }),
        });
      }
      // the page being scraped
      return Promise.resolve({
        ok: true,
        status: 200,
        url: u,
        text: () => Promise.resolve(PAGE),
      });
    });
    (global as any).fetch = fetchMock;
  });

  it("fetches, converts to Markdown, and uploads a correct result body", async () => {
    const job = DataRequest.fromJson({
      url: "https://news.example.com/article",
      recordID: "rec_demo_1",
      orgId: "org_42",
      saveMarkdown: true,
      saveHtml: true,
      fetchInstead: true, // routes to Option A (ParserJob) for a deterministic test
    });

    const nodeId = "mllwtl_intgr-DjKu4Hccr6_abc123";
    const ok = await new JobExecutor(nodeId).execute(job);
    expect(ok).toBe(true);

    // 1) it fetched the target page
    expect(
      fetchMock.mock.calls.some(
        (c) => String(c[0]).indexOf("news.example.com/article") !== -1
      )
    ).toBe(true);

    // 2) it POSTed a result to the Mellowtel result endpoint
    const uploadCall = fetchMock.mock.calls.find(
      (c) => String(c[0]).indexOf("request.mellow.tel") !== -1
    );
    expect(uploadCall).toBeDefined();

    const body = JSON.parse(uploadCall![1].body);
    // 3) the body matches the live wire contract
    expect(body.recordID).toBe("rec_demo_1");
    expect(body.node_identifier).toBe(nodeId);
    expect(body.orgId).toBe("org_42");
    expect(body.saveMarkdown).toBe(true);

    // 4) real Markdown was produced from the page
    expect(body.markDown).toContain("# Breaking News");
    expect(body.markDown).toContain("quick brown fox");
    // noise stripped: script gone, default selectors (nav) removed
    expect(body.markDown).not.toContain("evil()");
    expect(body.markDown).not.toContain("site menu");

    // 5) raw HTML included because saveHtml was true
    expect(body.content).toContain("Breaking News");

    // 6) the job counted toward local stats
    expect(await RequestCounter.getTotal()).toBe(1);
  });

  it("reports website_unreachable (and does NOT count) when the fetch fails", async () => {
    (global as any).fetch = jest.fn((url: any) => {
      const u = String(url);
      if (u.indexOf("request.mellow.tel") !== -1) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) , text: () => Promise.resolve("") });
      }
      return Promise.reject(new Error("network down"));
    });

    const job = DataRequest.fromJson({
      url: "https://down.example.com",
      recordID: "rec_down_1",
      fetchInstead: true,
    });
    const ok = await new JobExecutor("node1").execute(job);
    // result still uploaded (so the backend poll resolves), but not counted
    expect(ok).toBe(true);
    expect(await RequestCounter.getTotal()).toBe(0);
  });
});
