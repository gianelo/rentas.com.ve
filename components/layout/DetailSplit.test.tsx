import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DetailSplit } from "./DetailSplit";

describe("DetailSplit", () => {
  it("renders both the media slot and the data slot", () => {
    const markup = renderToStaticMarkup(
      <DetailSplit media={<figure>photo</figure>} data={<aside>price</aside>} />,
    );

    expect(markup).toContain("<figure>photo</figure>");
    expect(markup).toContain("<aside>price</aside>");
  });
});
