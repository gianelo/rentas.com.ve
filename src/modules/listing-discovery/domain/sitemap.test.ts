import { describe, expect, it } from "vitest";
import type { FooterLinkDefinition } from "../../site-footer/domain/footer-links";
import { ayudaSitemapPaths, buildSitemap, type SitemapListing } from "./sitemap";

const BASE = "https://rentas.com.ve";

function listing(overrides: Partial<SitemapListing> = {}): SitemapListing {
  return {
    id: "9f1c0d2e-0000-4000-8000-000000000001",
    cityName: "Maracaibo",
    zoneName: "Bella Vista",
    title: "Apartamento 2 habitaciones",
    publishedAt: new Date("2026-08-10T00:00:00Z"),
    ...overrides,
  };
}

describe("buildSitemap", () => {
  it("siempre publica el inicio, incluso sin un solo aviso activo", () => {
    // Un sitio recién desplegado no tiene avisos, y un sitemap vacío le dice a
    // Google que no hay nada que rastrear. El inicio existe siempre.
    const entries = buildSitemap(BASE, []);

    expect(entries.map((entry) => entry.url)).toEqual([BASE]);
  });

  it("publica cada aviso activo en su ruta canónica", () => {
    const entries = buildSitemap(BASE, [listing()]);

    expect(entries.map((entry) => entry.url)).toContain(
      `${BASE}/alquiler/maracaibo/bella-vista/apartamento-2-habitaciones-9f1c0d2e-0000-4000-8000-000000000001`,
    );
  });

  /**
   * **La página de zona se DERIVA de los avisos, nunca se consulta aparte.**
   *
   * Esa es la garantía entera y por eso el puerto tiene un solo método: una
   * zona sólo puede entrar al sitemap si hay un aviso suyo en el mismo sitemap.
   * Con dos consultas la lista de zonas y la de avisos pueden discrepar, y el
   * resultado es una dirección enviada a Google que responde "todavía no hay
   * avisos publicados acá" — contenido delgado sobre el dominio entero.
   */
  it("deriva la página de zona de los avisos, y sólo de ellos", () => {
    const entries = buildSitemap(BASE, [listing()]);

    expect(entries.map((entry) => entry.url)).toContain(`${BASE}/alquiler/maracaibo/bella-vista`);
  });

  it("no repite una zona cuando varios avisos la comparten", () => {
    const entries = buildSitemap(BASE, [
      listing({ id: "aaaaaaaa-0000-4000-8000-000000000001" }),
      listing({ id: "bbbbbbbb-0000-4000-8000-000000000002" }),
    ]);

    const zoneUrls = entries.filter(
      (entry) => entry.url === `${BASE}/alquiler/maracaibo/bella-vista`,
    );
    expect(zoneUrls).toHaveLength(1);
  });

  it("no emite dos veces la misma dirección", () => {
    const entries = buildSitemap(BASE, [
      listing({ id: "aaaaaaaa-0000-4000-8000-000000000001" }),
      listing({ id: "bbbbbbbb-0000-4000-8000-000000000002", zoneName: "Tierra Negra" }),
    ]);

    const urls = entries.map((entry) => entry.url);
    expect(new Set(urls).size).toBe(urls.length);
  });

  /**
   * **Defensivo, y probado como tal.** Dos avisos con el mismo id no deberian
   * existir — la base lo impide con su clave primaria. Pero el sitemap no es
   * el lugar donde enterarse: un documento con direcciones repetidas es una
   * senal de baja calidad para Google, y se emitiria sin que nada fallara.
   */
  it("colapsa dos avisos que resuelven a la misma direccion", () => {
    const entries = buildSitemap(BASE, [listing(), listing()]);

    const urls = entries.map((entry) => entry.url);
    expect(new Set(urls).size).toBe(urls.length);
    expect(urls).toHaveLength(3);
  });

  /**
   * `Centro` existe en Maracaibo y en Distrito Capital. Sin la ciudad en la
   * ruta las dos zonas colapsan en una sola dirección y la mitad de los avisos
   * desaparece del sitemap sin que nada falle.
   */
  it("distingue dos zonas homónimas de ciudades distintas", () => {
    const entries = buildSitemap(BASE, [
      listing({
        id: "aaaaaaaa-0000-4000-8000-000000000001",
        cityName: "Maracaibo",
        zoneName: "Centro",
      }),
      listing({
        id: "bbbbbbbb-0000-4000-8000-000000000002",
        cityName: "Distrito Capital",
        zoneName: "Centro",
      }),
    ]);

    expect(entries.map((entry) => entry.url)).toEqual(
      expect.arrayContaining([
        `${BASE}/alquiler/maracaibo/centro`,
        `${BASE}/alquiler/distrito-capital/centro`,
      ]),
    );
  });

  it("fecha la zona con el aviso más reciente que contiene", () => {
    const entries = buildSitemap(BASE, [
      listing({
        id: "aaaaaaaa-0000-4000-8000-000000000001",
        publishedAt: new Date("2026-08-01T00:00:00Z"),
      }),
      listing({
        id: "bbbbbbbb-0000-4000-8000-000000000002",
        publishedAt: new Date("2026-08-20T00:00:00Z"),
      }),
    ]);

    const zone = entries.find((entry) => entry.url === `${BASE}/alquiler/maracaibo/bella-vista`);
    expect(zone?.lastModified).toEqual(new Date("2026-08-20T00:00:00Z"));
  });

  it("fecha el inicio con el aviso más reciente del catálogo", () => {
    const entries = buildSitemap(BASE, [
      listing({
        id: "aaaaaaaa-0000-4000-8000-000000000001",
        publishedAt: new Date("2026-08-01T00:00:00Z"),
      }),
      listing({
        id: "bbbbbbbb-0000-4000-8000-000000000002",
        zoneName: "Tierra Negra",
        publishedAt: new Date("2026-08-20T00:00:00Z"),
      }),
    ]);

    expect(entries[0]).toMatchObject({
      url: BASE,
      lastModified: new Date("2026-08-20T00:00:00Z"),
    });
  });

  it("deja el inicio sin fecha cuando no hay nada publicado", () => {
    // Inventar `new Date()` acá haría la función impura y su test irrepetible,
    // y le diría a Google que el inicio cambió cuando no cambió nada.
    expect(buildSitemap(BASE, [])[0]?.lastModified).toBeUndefined();
  });

  it("une la base y la ruta con una sola barra, sobre o sin barra final", () => {
    // La barra final de la base es un detalle de configuracion, no una
    // direccion distinta. Sin normalizarla el documento emite
    // `https://rentas.com.ve//alquiler/...`, que Google trata como OTRA URL —
    // y el sitemap termina publicando exactamente el contenido duplicado que
    // la ficha se redirige a evitar.
    const withSlash = buildSitemap("https://rentas.com.ve/", [listing()]);
    const withoutSlash = buildSitemap("https://rentas.com.ve", [listing()]);

    expect(withSlash.map((entry) => entry.url)).toEqual(withoutSlash.map((entry) => entry.url));
    // El inicio es el origen pelado: una barra final tampoco es una direccion
    // distinta, pero elegir una y sostenerla es lo que evita las dos.
    expect(withSlash[0]?.url).toBe("https://rentas.com.ve");
    for (const entry of withSlash) {
      expect(entry.url).not.toContain("//alquiler");
    }
  });

  it("rechaza una base vacía en vez de emitir direcciones relativas", () => {
    // Silencioso sería lo caro: un sitemap con `/alquiler/…` en vez de
    // `https://…/alquiler/…` es un sitemap que Google descarta entero.
    expect(() => buildSitemap("   ", [listing()])).toThrow(/base/i);
  });

  // Task 23.9 — decided 2026-09-04: the five Ayuda pages enter the sitemap
  // with "monthly" frequency; the five Legal pages stay out.
  describe("Ayuda static pages (task 23.9)", () => {
    it("publishes an Ayuda path as a monthly entry, undated", () => {
      const entries = buildSitemap(BASE, [], ["/ayuda/escribinos"]);

      expect(entries).toContainEqual({
        url: `${BASE}/ayuda/escribinos`,
        changeFrequency: "monthly",
      });
    });

    it("keeps listing/zone entries untouched when Ayuda paths are also present", () => {
      const entries = buildSitemap(BASE, [listing()], ["/ayuda/escribinos"]);

      expect(entries.map((entry) => entry.changeFrequency)).toEqual(
        expect.arrayContaining(["daily", "weekly", "monthly"]),
      );
    });

    it("adds nothing beyond the home entry when no Ayuda path is given", () => {
      // Backward compatible: the third argument defaults to an empty list,
      // so a caller that never learned about Ayuda pages is unaffected.
      const entries = buildSitemap(BASE, []);

      expect(entries).toHaveLength(1);
    });
  });

  describe("ayudaSitemapPaths", () => {
    function footerEntry(overrides: Partial<FooterLinkDefinition> = {}): FooterLinkDefinition {
      return { label: "Escribinos", category: "ayuda", href: "/ayuda/escribinos", ...overrides };
    }

    it("keeps a resolved Ayuda entry and drops a resolved Legal entry", () => {
      const catalogue: readonly FooterLinkDefinition[] = [
        footerEntry(),
        footerEntry({ label: "Términos", category: "legal", href: "/legal/terminos" }),
      ];

      expect(ayudaSitemapPaths(catalogue)).toEqual(["/ayuda/escribinos"]);
    });

    it("drops an Ayuda entry that has not shipped a page yet", () => {
      // A `null` href is the declared reason a footer destination is absent
      // (footer-links.ts) — the sitemap must honour that the same way the
      // footer itself does, never invent a path for a page that isn't live.
      const catalogue: readonly FooterLinkDefinition[] = [footerEntry({ href: null })];

      expect(ayudaSitemapPaths(catalogue)).toEqual([]);
    });
  });
});
