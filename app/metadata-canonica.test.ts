import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * **`metadataBase`, las canónicas y de dónde sale el anfitrión** (tarea 26.12).
 *
 * Antes de esta tarea `rg -n 'metadataBase|alternates|openGraph' app src` no
 * devolvía ni una línea sobre los 27 archivos de `app/` que declaran metadata.
 * Eso no era un descuido de estilo: sin `metadataBase` **toda dirección
 * relativa de metadata se queda sin base**, así que la única forma de escribir
 * una canónica era que cada pantalla repitiera el anfitrión — y un anfitrión
 * repetido 27 veces es un anfitrión que se renombra 26 veces bien y una mal.
 *
 * La regla que este archivo vigila, y que es la decisión de la tarea:
 *
 * 1. El anfitrión se escribe **una sola vez**, en `app/layout.tsx`, y sale de
 *    `readSiteBaseUrl()` — nunca de un literal. Falla cerrado (AGENTS.md §7):
 *    sin `SITE_URL` el build se cae en vez de publicar canónicas que apuntan a
 *    otro sitio.
 * 2. Toda canónica es **relativa**. `metadataBase` la resuelve, y así una
 *    vista previa de Vercel canoniza contra su propio origen sin tocar código.
 * 3. **Sólo se canoniza lo que pide ser indexado.** Una página con
 *    `index: false` y una canónica a la vez le manda a Google dos señales que
 *    se contradicen; acá una excluye a la otra.
 */
const APP_ROOT = new URL("../app/", import.meta.url).pathname;

/** Todas las pantallas de `app/`, recorridas y no enumeradas a mano. */
function pageFiles(directory: string): readonly string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) return pageFiles(full);
    return entry.name === "page.tsx" ? [full] : [];
  });
}

const PAGES = pageFiles(APP_ROOT).map((path) => ({
  path: path.slice(APP_ROOT.length),
  source: readFileSync(path, "utf8"),
}));

const LAYOUT = readFileSync(join(APP_ROOT, "layout.tsx"), "utf8");

/** Las que declaran algo de metadata — el resto no tiene nada que canonizar. */
const WITH_METADATA = PAGES.filter(
  ({ source }) => /export const metadata\b/.test(source) || /generateMetadata\b/.test(source),
);

/**
 * El layout se importa a mano y no arriba: su `metadataBase` se evalúa al
 * cargar el módulo, así que **el import es el que falla cerrado** cuando no
 * hay origen, y eso es justamente lo que se quiere poder observar acá.
 */
async function loadLayoutMetadata(siteUrl: string | undefined) {
  vi.resetModules();
  if (siteUrl === undefined) {
    delete process.env.SITE_URL;
    delete process.env.VERCEL_URL;
  } else {
    process.env.SITE_URL = siteUrl;
  }
  return (await import("./layout")).metadata;
}

const ORIGINAL_ENV = { ...process.env };
afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("el anfitrión se escribe una sola vez", () => {
  it("el layout arma metadataBase desde readSiteBaseUrl, no desde un literal", () => {
    expect(LAYOUT).toContain("readSiteBaseUrl");
    expect(LAYOUT).toMatch(/metadataBase:\s*new URL\(readSiteBaseUrl\(\)\)/);
  });

  it("y el origen que sale es el del entorno, no uno horneado", async () => {
    const metadata = await loadLayoutMetadata("https://ejemplo.test");

    expect(metadata.metadataBase?.toString()).toBe("https://ejemplo.test/");
  });

  /**
   * AGENTS.md §7 y la 26.10: sin `SITE_URL` el build se cae acá en vez de
   * publicar canónicas y tarjetas sociales que apuntan a otro sitio. Una
   * canónica equivocada no la reporta nadie — simplemente se obedece.
   */
  it("y sin origen no publica nada: se cae", async () => {
    await expect(loadLayoutMetadata(undefined)).rejects.toThrow(/SITE_URL/);
  });

  it("y ninguna pantalla escribe el dominio a mano", () => {
    const offenders = [...PAGES, { path: "layout.tsx", source: LAYOUT }].filter(({ source }) =>
      /https?:\/\/(?:www\.)?rentoru\.com/.test(source),
    );

    expect(offenders.map(({ path }) => path)).toEqual([]);
  });
});

describe("las canónicas", () => {
  it("hay pantallas con metadata que mirar", () => {
    // La guarda: sin esto, un `pageFiles` roto dejaría la suite entera
    // pasando sobre una lista vacía, que es la peor forma de verde.
    expect(WITH_METADATA.length).toBeGreaterThan(20);
  });

  it("toda pantalla indexable declara la suya", () => {
    const missing = WITH_METADATA.filter(
      ({ source }) => !/alternates:/.test(source) && !/index:\s*false/.test(source),
    );

    expect(missing.map(({ path }) => path)).toEqual([]);
  });

  it("y son relativas: la base la pone metadataBase, no cada pantalla", () => {
    const absolute = WITH_METADATA.filter(({ source }) => /canonical:\s*[`"']https?:/.test(source));

    expect(absolute.map(({ path }) => path)).toEqual([]);
  });

  /**
   * Las cuatro pantallas dinámicas ya arman direcciones, y la canónica tiene
   * que salir de ESA misma función. Una segunda construcción de la misma
   * dirección arranca idéntica y se separa en el primer arreglo apurado — es
   * literalmente lo que documenta `resolveViewerRoute` en `photo-viewer.ts`.
   */
  it("las dinámicas la derivan del dominio en vez de rearmarla", () => {
    const derived = (path: string, symbol: string) => {
      const page = WITH_METADATA.find((candidate) => candidate.path === path);
      expect(page, `falta ${path}`).toBeDefined();
      const metadata = (page?.source ?? "").slice(
        (page?.source ?? "").indexOf("export async function generateMetadata"),
      );
      expect(metadata, path).toContain(symbol);
    };

    derived("alquiler/[ciudad]/page.tsx", "cityRoutePath");
    derived("alquiler/[ciudad]/[zona]/page.tsx", "zoneRoutePath");
    derived("alquiler/[ciudad]/[zona]/[slug]/page.tsx", "buildListingPath");
    derived("alquiler/[ciudad]/[zona]/[slug]/foto/[n]/page.tsx", "photoViewerPath");
  });
});

/**
 * Los valores por defecto de la tarjeta social. Van en el layout y no en cada
 * pantalla por la misma razón que `metadataBase`: escritos 27 veces, se
 * separan. Next.js adjunta `app/opengraph-image.tsx` a todas las rutas por
 * convención de archivo, así que la imagen no se nombra acá.
 */
describe("los valores por defecto de Open Graph", () => {
  it("el layout declara sitio, idioma y tipo", () => {
    expect(LAYOUT).toMatch(/openGraph:\s*\{/);
    expect(LAYOUT).toContain('siteName: "Rentoru"');
    expect(LAYOUT).toContain('locale: "es_VE"');
    expect(LAYOUT).toContain('type: "website"');
  });

  it("y la tarjeta grande de X, que es la que usa la imagen de 1200×630", () => {
    expect(LAYOUT).toMatch(/twitter:\s*\{/);
    expect(LAYOUT).toContain('card: "summary_large_image"');
  });
});
