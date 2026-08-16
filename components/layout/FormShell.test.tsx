import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FormShell } from "./FormShell";

describe("FormShell", () => {
  it("renders its children", () => {
    const markup = renderToStaticMarkup(
      <FormShell>
        <form>fields</form>
      </FormShell>,
    );

    expect(markup).toContain("<form>fields</form>");
  });
});
