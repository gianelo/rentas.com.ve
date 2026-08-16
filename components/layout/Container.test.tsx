import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Container } from "./Container";

describe("Container", () => {
  it("renders its children", () => {
    const markup = renderToStaticMarkup(
      <Container>
        <p>content</p>
      </Container>,
    );

    expect(markup).toContain("<p>content</p>");
  });
});
