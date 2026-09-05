import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { config, middleware } from "./middleware";

/**
 * tasks.md 23.3 — the header this file proves gets stamped is the only way
 * app/layout.tsx (a plain Server Component, no client hook — design.md
 * D13/D14) can know it is serving the listing detail page or the photo
 * viewer, so it can stay silent there instead of stacking a second footer.
 *
 * Both directions are proven: the `matcher` names exactly these two route
 * shapes and nothing broader, and calling the function once that matcher
 * would have let a request through does set the header.
 */
describe("middleware", () => {
  it("scopes itself to exactly the listing detail and photo viewer routes", () => {
    expect(config.matcher).toEqual([
      "/alquiler/:ciudad/:zona/:slug",
      "/alquiler/:ciudad/:zona/:slug/foto/:n",
    ]);
  });

  it("stamps a listing detail request with x-hide-site-footer", () => {
    const request = new NextRequest("https://rentas.test/alquiler/caracas/altamira/av_1");

    const response = middleware(request);

    expect(response.headers.get("x-middleware-request-x-hide-site-footer")).toBe("1");
  });

  it("stamps a photo viewer request with x-hide-site-footer", () => {
    const request = new NextRequest("https://rentas.test/alquiler/caracas/altamira/av_1/foto/2");

    const response = middleware(request);

    expect(response.headers.get("x-middleware-request-x-hide-site-footer")).toBe("1");
  });
});
