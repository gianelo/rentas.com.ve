import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FILTER_KEYS } from "@/modules/listing-discovery/domain/zone-route";
import { SEARCH_QUERY_NAMES } from "@/modules/listing-search/domain/search-query";

/**
 * **La regla de indexación y los nombres que la página lee, atados.**
 *
 * Existe por la misma razón que `signin-return.test.ts`, y atrapa un bug de la
 * misma forma: no falla el render de ninguno de los dos lados, falla que **usen
 * la misma lista**. `SEARCH_QUERY_NAMES` dice cómo se llama cada campo en la
 * dirección; `isFilteredZoneRoute` decide con `FILTER_KEYS` si esa dirección se
 * indexa.
 *
 * Ya pasó una vez: llegaron el tipo, el publicador, los cinco atributos y la
 * paginación, y ninguno entró en `FILTER_KEYS`. Cada combinación se publicaba
 * como una dirección indexable propia — y las combinaciones son combinatorias.
 * Nada fallaba; la página se dibujaba perfecta.
 *
 * **Cambió de forma con el acordeón, y a mejor.** La tabla de nombres vivía
 * dentro de `page.tsx` y este test la sacaba con una expresión regular, así que
 * comprobaba la relación entre un archivo de dominio y un archivo de pantalla
 * leyendo texto. Ahora la tabla ES del dominio, y las dos listas se comparan
 * como listas. Lo que queda leyéndose como texto es la otra mitad del contrato:
 * que la página **no vuelva a escribir sus propios nombres** — porque una
 * segunda tabla que casualmente coincide es exactamente el bug que este archivo
 * existe para atrapar.
 */
const PAGE = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

describe("el contrato de indexación de la ruta de zona", () => {
  it("la tabla de nombres declara algo", () => {
    // Si esta guarda falla, el resto de la suite estaría midiendo el vacío y
    // pasaría por eso — que es la peor forma de verde.
    expect(Object.keys(SEARCH_QUERY_NAMES).length).toBeGreaterThan(5);
  });

  it("todo parámetro de búsqueda marca la ruta como refinada", () => {
    const missing = Object.values(SEARCH_QUERY_NAMES).filter(
      (name) => !(FILTER_KEYS as readonly string[]).includes(name),
    );

    expect(missing).toEqual([]);
  });

  it("la paginación también, porque la página 2 es casi la misma página", () => {
    expect(FILTER_KEYS as readonly string[]).toContain(SEARCH_QUERY_NAMES.page);
  });

  it("el estado del acordeón también, aunque no filtre ningún aviso", () => {
    expect(FILTER_KEYS as readonly string[]).toContain(SEARCH_QUERY_NAMES.step);
    expect(FILTER_KEYS as readonly string[]).toContain(SEARCH_QUERY_NAMES.zoneSearch);
  });

  it("la ciudad NO está en la tabla: es el contexto, y la afirma la ruta", () => {
    expect(Object.values(SEARCH_QUERY_NAMES)).not.toContain("ciudad");
  });

  it("la página usa la tabla del dominio en vez de escribir la suya", () => {
    expect(PAGE).toContain("SEARCH_QUERY_NAMES");
    // Una segunda tabla escrita a mano en la pantalla es el bug original con
    // otra cara: coincide hoy y deja de coincidir en el próximo parámetro.
    expect(PAGE).not.toMatch(/const QUERY_NAMES/);
  });

  it("el slug de la zona lo da el dominio: la página no lo deriva ni recorta por ciudad", () => {
    // «Nunca más coloques una regla de negocio en el front, nunca». El slug de
    // una zona es un dato del dominio, no un formateo de la pantalla — y la
    // ruta canónica y el `?zona=` tienen que salir del MISMO slug, o la query
    // deja de nombrar lo que nombra la ruta.
    expect(PAGE).toContain("toSearchZones");
    expect(PAGE).toContain("toPanelZones");
    expect(PAGE).not.toMatch(/\$\{cityPath\}\/\$\{slugify/);
    // Recortar las zonas a la ciudad es la garantía de aislamiento del D5 y
    // vive en `toPanelZones`. Escrita acá quedaría fuera del suelo de
    // cobertura del 90 %, que llega a `domain/` y no llega a `app/`.
    expect(PAGE).not.toMatch(/cityId === place\.city\.id/);
  });
});
