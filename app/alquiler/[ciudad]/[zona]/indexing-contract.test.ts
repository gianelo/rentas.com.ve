import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FILTER_KEYS } from "@/modules/listing-discovery/domain/zone-route";

/**
 * **La regla de indexación y los nombres que la página lee, atados.**
 *
 * Existe por la misma razón que `signin-return.test.ts`, y atrapa un bug de la
 * misma forma: no falla el render de ninguno de los dos lados, falla que **usen
 * la misma lista**. La página traduce la query a criterios con `QUERY_NAMES`;
 * `isFilteredZoneRoute` decide con `FILTER_KEYS` si esa dirección se indexa.
 *
 * Ya pasó una vez: llegaron el tipo, el publicador, los cinco atributos y la
 * paginación, y ninguno entró en `FILTER_KEYS`. Cada combinación se publicaba
 * como una dirección indexable propia — y las combinaciones son combinatorias.
 * Nada fallaba; la página se dibujaba perfecta.
 *
 * Se comprueba leyendo el archivo y no renderizando, a propósito: lo que hay
 * que verificar es una relación entre dos archivos, no el comportamiento de
 * uno.
 */
const PAGE = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

/** El bloque `QUERY_NAMES`, tal como la página lo escribe. */
function queryNames(): string[] {
  const block = /const QUERY_NAMES[^{]*\{([^}]*)\}/s.exec(PAGE)?.[1] ?? "";
  return [...block.matchAll(/:\s*"([^"]+)"/g)].map((match) => match[1] as string);
}

describe("el contrato de indexación de la ruta de zona", () => {
  it("la página declara sus nombres de query", () => {
    // Si esta guarda falla, el resto de la suite estaría midiendo el vacío y
    // pasaría por eso — que es la peor forma de verde.
    expect(queryNames().length).toBeGreaterThan(5);
  });

  it("todo filtro que la página lee marca la ruta como refinada", () => {
    const missing = queryNames()
      // La ciudad NO es un filtro, es el contexto — y acá además la afirma la
      // ruta, así que nunca llega por la query.
      .filter((name) => name !== "ciudad")
      .filter((name) => !(FILTER_KEYS as readonly string[]).includes(name));

    expect(missing).toEqual([]);
  });

  it("la paginación también, porque la página 2 es casi la misma página", () => {
    const pageParam = /const PAGE_PARAM = "([^"]+)"/.exec(PAGE)?.[1];

    expect(pageParam).toBeDefined();
    expect(FILTER_KEYS as readonly string[]).toContain(pageParam as string);
  });
});
