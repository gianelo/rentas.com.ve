import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReadingWidth } from "./ReadingWidth";

describe("ReadingWidth", () => {
  it("renders its children", () => {
    const markup = renderToStaticMarkup(
      <ReadingWidth>
        <p>content</p>
      </ReadingWidth>,
    );

    expect(markup).toContain("<p>content</p>");
  });
});
