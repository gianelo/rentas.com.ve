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

  // tasks.md 22.16 — el slug ahora tiene que terminar en un id con forma de
  // UUID: desde esa tarea, uno que no la tiene es "malformado" y toma el
  // camino del rewrite de más abajo en vez de éste. `av_1` bastaba antes de
  // que esa distinción existiera.
  const ID_DE_PRUEBA = "a1b2c3d4-0000-4000-8000-0123456789ab";

  it("stamps a listing detail request with x-hide-site-footer", () => {
    const request = new NextRequest(
      `https://rentoru.test/alquiler/caracas/altamira/av-${ID_DE_PRUEBA}`,
    );

    const response = middleware(request);

    expect(response.headers.get("x-middleware-request-x-hide-site-footer")).toBe("1");
  });

  it("stamps a photo viewer request with x-hide-site-footer", () => {
    const request = new NextRequest(
      `https://rentoru.test/alquiler/caracas/altamira/av-${ID_DE_PRUEBA}/foto/2`,
    );

    const response = middleware(request);

    expect(response.headers.get("x-middleware-request-x-hide-site-footer")).toBe("1");
  });

  /**
   * tasks.md 22.16 — a fast unit check of the rewrite DECISION, not proof of
   * what a browser receives. The body served through the actual routing
   * layer (status, `<h1>`, exit link, no `<script>`) is asserted against the
   * real production build in `tests/e2e/aviso-malformado-sin-javascript.spec.ts`
   * — this file cannot see any of that, because `NextRequest`/`NextResponse`
   * here never touch Next's router.
   */
  it("rewrites a malformed listing slug to the pre-rendered 404, keeping the 404 status", () => {
    const request = new NextRequest(
      "https://rentoru.test/alquiler/maracaibo/tierra-negra/apartamento-que-nunca-existio",
    );

    const response = middleware(request);

    expect(response.status).toBe(404);
    const rewriteTarget = response.headers.get("x-middleware-rewrite");
    expect(rewriteTarget).not.toBeNull();
    expect(new URL(rewriteTarget ?? "").pathname).not.toBe(
      "/alquiler/maracaibo/tierra-negra/apartamento-que-nunca-existio",
    );
  });

  it("does not rewrite a listing slug that carries a syntactically valid id", () => {
    const id = "a1b2c3d4-0000-4000-8000-0123456789ab";
    const request = new NextRequest(`https://rentoru.test/alquiler/caracas/altamira/av-1-${id}`);

    const response = middleware(request);

    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
    expect(response.headers.get("x-middleware-request-x-hide-site-footer")).toBe("1");
  });
});
