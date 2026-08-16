import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SidebarLayout } from "./SidebarLayout";

describe("SidebarLayout", () => {
  it("renders both the sidebar slot and the content slot", () => {
    const markup = renderToStaticMarkup(
      <SidebarLayout sidebar={<nav>filters</nav>}>
        <ul>results</ul>
      </SidebarLayout>,
    );

    expect(markup).toContain("<nav>filters</nav>");
    expect(markup).toContain("<ul>results</ul>");
  });
});
