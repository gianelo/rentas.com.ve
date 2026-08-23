import { describe, expect, it } from "vitest";
import { resolveListingRoute } from "./listing-detail-route";
import { RETURN_PARAM } from "./return-to-results";

const ID = "3f2a91cb-04d7-b8e0-1a55-9c7e2d4f6b03";

const LISTING = {
  id: ID,
  cityName: "Caracas",
  zoneName: "Chacao",
  title: "Apartamento 2 habitaciones con puesto de estacionamiento",
};

describe("resolveListingRoute", () => {
  /**
   * **La deuda que la tarea 11.1 dejó, y ahora vence.** Su decisión fue que
   * *sólo el id identifica un aviso* — ciudad, zona y slug son para un rastreador
   * y para quien decide si tocar un enlace pegado en un grupo de WhatsApp.
   *
   * El costo quedó escrito ahí: como toda ruta que termina en el mismo id
   * resuelve al mismo aviso, servirlas todas publicaría **URLs duplicadas sin
   * límite para un solo aviso**. Esta función es la que paga esa deuda.
   */
  it("sirve la ruta canónica sin redirigir", () => {
    const canonical =
      "/alquiler/caracas/chacao/apartamento-2-habitaciones-con-puesto-de-estacionamiento-" + ID;

    expect(resolveListingRoute(LISTING, canonical)).toEqual({ kind: "render" });
  });

  it("redirige cualquier ruta que termine en el mismo id pero difiera", () => {
    // El caso real: alguien corrige una falta de ortografía en el título y la
    // URL vieja sigue circulando por WhatsApp. Resuelve, y redirige.
    const resolution = resolveListingRoute(LISTING, `/alquiler/caracas/chacao/titulo-viejo-${ID}`);

    expect(resolution.kind).toBe("redirect");
    expect(resolution.kind === "redirect" && resolution.to).toContain(ID);
  });

  it("redirige cuando la zona de la ruta no es la del aviso", () => {
    // Un aviso que se mudó de zona, o un enlace armado a mano. El id manda.
    const resolution = resolveListingRoute(LISTING, `/alquiler/caracas/altamira/lo-que-sea-${ID}`);

    expect(resolution.kind).toBe("redirect");
  });

  /**
   * **Sin esto, un solo aviso publica infinitas URLs.** Cada variante que
   * alguien invente resolvería con 200, Google las indexaría todas como páginas
   * distintas con el mismo contenido, y la penalización cae sobre el dominio.
   */
  it("la ruta a la que redirige es siempre la misma, sea cual sea la entrada", () => {
    const entradas = [
      `/alquiler/x/y/z-${ID}`,
      `/alquiler/caracas/chacao/${ID}`,
      `/alquiler/CARACAS/Chacao/otra-cosa-${ID}`,
    ];
    const destinos = entradas.map((entrada) => {
      const resolution = resolveListingRoute(LISTING, entrada);
      return resolution.kind === "redirect" ? resolution.to : entrada;
    });

    expect(new Set(destinos).size).toBe(1);
  });

  it("acepta el id en mayúsculas y redirige a la forma canónica", () => {
    // Postgres compara `text` exactamente. Una URL mayúsculada tiene que
    // resolver, pero no puede quedarse: sería una segunda dirección viva.
    const resolution = resolveListingRoute(
      LISTING,
      `/alquiler/caracas/chacao/algo-${ID.toUpperCase()}`,
    );

    expect(resolution.kind).toBe("redirect");
  });

  it("ignora una barra final en vez de tratarla como otra ruta", () => {
    const canonical =
      "/alquiler/caracas/chacao/apartamento-2-habitaciones-con-puesto-de-estacionamiento-" + ID;

    expect(resolveListingRoute(LISTING, `${canonical}/`)).toEqual({ kind: "render" });
  });

  /**
   * **La redirección canónica y el origen de la vuelta (16.9), que se pisan.**
   * El origen viaja en la query de la ficha; la canonicalización compara rutas.
   * Con la query adentro de la comparación, la ruta canónica *con* parámetro no
   * sería nunca igual a la canónica y la ficha se redirigiría a sí misma para
   * siempre — un bucle que sólo aparece cuando alguien llega desde una
   * búsqueda, es decir, en el camino normal del producto.
   */
  it("sirve la ruta canónica aunque traiga el parámetro de vuelta", () => {
    const canonical = `/alquiler/caracas/chacao/apartamento-2-habitaciones-con-puesto-de-estacionamiento-${ID}`;

    expect(
      resolveListingRoute(LISTING, `${canonical}?${RETURN_PARAM}=%2Falquiler%2Fx%2Fy`),
    ).toEqual({ kind: "render" });
  });

  it("conserva el origen al redirigir: la vuelta no se pierde en el camino", () => {
    const resolution = resolveListingRoute(
      LISTING,
      `/alquiler/caracas/chacao/titulo-viejo-${ID}`,
      "/alquiler/caracas/chacao?min=200&hab=2",
    );

    expect(resolution.kind).toBe("redirect");
    expect(
      resolution.kind === "redirect" &&
        new URL(resolution.to, "https://rentas.com.ve").searchParams.get(RETURN_PARAM),
    ).toBe("/alquiler/caracas/chacao?min=200&hab=2");
  });

  it("el destino de la redirección ya no redirige: una sola vez y para", () => {
    const first = resolveListingRoute(
      LISTING,
      `/alquiler/caracas/chacao/titulo-viejo-${ID}`,
      "/alquiler/caracas/chacao?min=200",
    );
    const second =
      first.kind === "redirect"
        ? resolveListingRoute(LISTING, first.to, "/alquiler/caracas/chacao?min=200")
        : first;

    expect(second).toEqual({ kind: "render" });
  });

  it("un origen inseguro no se lleva puesto en la redirección", () => {
    const resolution = resolveListingRoute(
      LISTING,
      `/alquiler/caracas/chacao/titulo-viejo-${ID}`,
      "https://evil.test/alquiler/x",
    );

    expect(resolution.kind === "redirect" && resolution.to).not.toContain("evil.test");
  });
});
