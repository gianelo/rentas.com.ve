import { describe, expect, it } from "vitest";
import { resolveListingRoute } from "./listing-detail-route";

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
});
