import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import HomePage from "./page";

// The `/` route exists to close tasks.md 0.7 ("Deploy skeleton to Vercel;
// confirm live Neon connection"), which could never be confirmed because
// there was no page to open — every visit to the site's root returned
// Next's built-in 404. It is also what turns two gates from decorative into
// real: budget:bundle stops measuring only the shared framework baseline
// and starts measuring an actual read-path route, and the Lighthouse
// budget stops auditing a 404 body.
//
// These assertions are about what the page PROMISES, not how it looks.
// The strongest one here is the last: a home page that links to a search
// or publication flow neither of which exists (Phase 3 and Phase 5) would
// be a 404 dressed as a working product — the exact failure this page was
// added to fix, moved one click deeper.
describe("HomePage", () => {
  const markup = renderToStaticMarkup(<HomePage />);

  it("renders exactly one <h1>", () => {
    expect(markup.match(/<h1[\s>]/g) ?? []).toHaveLength(1);
  });

  it("wraps its content in exactly one <main> landmark", () => {
    expect(markup.match(/<main[\s>]/g) ?? []).toHaveLength(1);
  });

  it("carries <header> and <footer> landmarks around <main>", () => {
    expect(markup.indexOf("<header")).toBeGreaterThanOrEqual(0);
    expect(markup.indexOf("<header")).toBeLessThan(markup.indexOf("<main"));
    expect(markup.indexOf("<footer")).toBeGreaterThan(markup.indexOf("</main>"));
  });

  it("offers the sign-in route, the only navigable destination that exists", () => {
    expect(markup).toContain('href="/signin"');
  });

  it("links to no route that has not shipped yet", () => {
    const hrefs = [...markup.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);

    // `/signin` is the whole navigable surface today. `/alquiler/**` is
    // Phase 11's URL scheme (tasks.md 11.1) and `/publicar` is Phase 3's;
    // neither route exists, so linking to either would send a visitor from
    // a working page straight into the 404 this page was created to remove.
    expect(hrefs).toEqual(["/signin"]);
  });

  it("ships no search or publication control it cannot honour yet", () => {
    // Search is Phase 5 (tasks.md 5.x) and publication is Phase 3. A form
    // or input here would be a control that accepts a visitor's intent and
    // does nothing with it.
    expect(markup).not.toContain("<form");
    expect(markup).not.toContain("<input");
    expect(markup).not.toContain("<select");
  });

  it('declares no "use client" boundary (design.md D13 — no JS on the read path)', () => {
    expect(readFileSync("app/page.tsx", "utf-8")).not.toContain('"use client"');
  });
});
