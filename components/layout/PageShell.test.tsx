import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PageShell } from "./PageShell";

// design.md D15 — "page structure uses real headings and landmarks".
describe("PageShell", () => {
  it("renders exactly one <main> landmark around its content", () => {
    const markup = renderToStaticMarkup(
      <PageShell>
        <h1>Title</h1>
      </PageShell>,
    );

    expect(markup).toBe("<main><h1>Title</h1></main>");
  });

  it("renders an optional <header> landmark before <main>", () => {
    const markup = renderToStaticMarkup(
      <PageShell header={<p>brand</p>}>
        <h1>Title</h1>
      </PageShell>,
    );

    expect(markup).toBe("<header><p>brand</p></header><main><h1>Title</h1></main>");
  });

  it("renders an optional <footer> landmark after <main>", () => {
    const markup = renderToStaticMarkup(
      <PageShell footer={<p>legal</p>}>
        <h1>Title</h1>
      </PageShell>,
    );

    expect(markup).toBe("<main><h1>Title</h1></main><footer><p>legal</p></footer>");
  });

  it("omits <header> and <footer> entirely when no slot content is given", () => {
    const markup = renderToStaticMarkup(
      <PageShell>
        <h1>Title</h1>
      </PageShell>,
    );

    expect(markup).not.toContain("<header>");
    expect(markup).not.toContain("<footer>");
  });
});
