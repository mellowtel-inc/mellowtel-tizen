import { HtmlProcessor } from "../src/html/html-processor";
import { DataRequest } from "../src/jobs/data-request";

function req(overrides: any = {}) {
  return DataRequest.fromJson({ url: "https://x.com", recordID: "r1", ...overrides });
}

describe("HtmlProcessor", () => {
  it("strips script/style/noscript always", () => {
    const doc = HtmlProcessor.parse(
      "<html><body><p>keep</p><script>bad()</script><style>.a{}</style></body></html>"
    );
    const { html } = HtmlProcessor.process(doc, req({ removeCSSselectors: "none" }));
    expect(html).toContain("keep");
    expect(html).not.toContain("bad()");
    expect(html).not.toContain(".a{}");
  });

  it("removes default selectors (nav/footer) on default mode", () => {
    const doc = HtmlProcessor.parse(
      "<html><body><nav>menu</nav><main>content</main><footer>foot</footer></body></html>"
    );
    const { html } = HtmlProcessor.process(doc, req({ removeCSSselectors: "default" }));
    expect(html).toContain("content");
    expect(html).not.toContain("menu");
    expect(html).not.toContain("foot");
  });

  it("honors a custom selector array", () => {
    const doc = HtmlProcessor.parse(
      '<html><body><div class="ad">ad</div><p>real</p></body></html>'
    );
    const { html } = HtmlProcessor.process(
      doc,
      req({ removeCSSselectors: JSON.stringify([".ad"]) })
    );
    expect(html).toContain("real");
    expect(html).not.toContain(">ad<");
  });

  it("converts to Markdown when saveMarkdown is true", () => {
    const doc = HtmlProcessor.parse(
      "<html><body><h1>Title</h1><p>Body text</p></body></html>"
    );
    const { markdown } = HtmlProcessor.process(doc, req({ saveMarkdown: true }));
    expect(markdown).toContain("# Title");
    expect(markdown).toContain("Body text");
  });

  it("skips Markdown when saveMarkdown is false", () => {
    const doc = HtmlProcessor.parse("<html><body><h1>Title</h1></body></html>");
    const { markdown } = HtmlProcessor.process(doc, req({ saveMarkdown: false }));
    expect(markdown).toBe("");
  });

  it("removes images when removeImages is set", () => {
    const doc = HtmlProcessor.parse(
      '<html><body><img src="x.png"><p>txt</p></body></html>'
    );
    const { html } = HtmlProcessor.process(doc, req({ removeImages: true }));
    expect(html).not.toContain("x.png");
    expect(html).toContain("txt");
  });
});
