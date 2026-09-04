import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SEARCH_QUERY_NAMES } from "@/modules/listing-search/domain/search-query";

/**
 * **Los filtros viven sólo en el modal, y la ubicación sólo en la ruta** —
 * tasks.md 14.32, 14.33 y la resolución de ubicación del fundador (2026-08-26),
 * atados sobre las DOS pantallas de resultados a la vez.
 *
 * Mismo mecanismo que `nav-contract.test.ts`, `indexing-contract.test.ts` y
 * `pagination-contract.test.ts` al lado: se lee el archivo, porque lo que puede
 * fallar es **una relación entre la página y el dominio**, y el suelo de
 * cobertura del 90 % no llega a `app/`. Sobre las dos porque la de zona es la
 * de ciudad con un segmento más: cablearlas por separado es cómo empiezan a
 * discrepar, y ya pasó una vez con `filterCount`.
 */
const PAGES = {
  ciudad: readFileSync(new URL("./page.tsx", import.meta.url), "utf8"),
  zona: readFileSync(new URL("./[zona]/page.tsx", import.meta.url), "utf8"),
};

const ENTRIES = Object.entries(PAGES);

describe("los filtros salen de la barra lateral y entran en el modal (14.33)", () => {
  it("la guarda: los dos archivos que se están midiendo son los que se creen", () => {
    expect(PAGES.ciudad).toContain("export default async function CiudadPage");
    expect(PAGES.zona).toContain("export default async function ZonaPage");
  });

  for (const [name, page] of ENTRIES) {
    describe(`/alquiler/<ciudad>${name === "zona" ? "/<zona>" : ""}`, () => {
      /**
       * Lámina 7c: *"Sin barra lateral: los filtros viven solo en el modal 7b"*.
       * El fundador lo cerró en **todos los anchos**, no sólo después de haber
       * buscado, que era la pregunta abierta de la 14.33.
       */
      it("ya no dibuja la barra lateral, en ningún ancho", () => {
        expect(page).not.toContain("SidebarLayout");
      });

      it("el panel se dibuja igual, y quién lo abre lo decide el dominio", () => {
        // Sigue en el marcado: `SearchPanel` devuelve `null` cuando la
        // dirección no lo pide, así que la condición no se escribe acá.
        expect(page).toContain("<SearchPanel");
        expect(page).not.toMatch(/panel\.open\s*\?/);
      });

      /**
       * **Lo que reemplaza a la barra lateral en la lista.** Sin ella y sin la
       * `SearchSummaryBar` que la 14.41 borró, la pantalla se quedaba sin decir
       * qué está filtrando. La lámina 7c lo resuelve con fichas quitables, y
       * cuáles son las arma el dominio.
       */
      it("dibuja las fichas quitables con lo que arma el dominio", () => {
        expect(page).toContain("<FilterChips");
        expect(page).toMatch(/chips=\{panel\.chips\}/);
      });

      /**
       * El filtro de la pastilla abre el panel **sin fijar un grupo**: el
       * acordeón del teléfono abre solo el primero sin contestar, y nombrar
       * «precio» a mano lo rompería. El token es del dominio.
       */
      it("el filtro de la pastilla abre el panel con el token del dominio", () => {
        expect(page).toContain("PANEL_OPEN_TOKEN");
        expect(page).toMatch(/step:\s*PANEL_OPEN_TOKEN/);
        // Y nunca un grupo escrito a mano: `?filtros=ciudad` era el de antes, y
        // ese grupo ya no existe.
        expect(page).not.toMatch(/step:\s*"(ciudad|zona|precio|habitaciones)"/);
      });
    });
  }
});

/**
 * **Un campo que el dominio nombra y la página no lee es un filtro inalcanzable
 * desde una pantalla** (14.45 rebanada C).
 *
 * Es la clase entera, no el caso: `RawSearchParams` tiene todos sus campos
 * **opcionales** —tiene que tenerlos, porque una dirección puede no traer
 * ninguno—, así que olvidarse de pasar uno **compila, pasa el `typecheck` y
 * deja el filtro muerto**. Ya pasó y está anotado: la 14.45 midió que
 * `minAreaM2` existe en el criterio, se parsea y se aplica en las dos
 * consultas, y ninguna de las dos páginas lo pasa — «criterio sin dirección».
 * Con esta prueba, el próximo nombre corto que alguien agregue a
 * `SEARCH_QUERY_NAMES` no puede quedarse a mitad de camino en silencio.
 *
 * `filtros` y `busca` quedan afuera con nombre propio: no son filtros del
 * criterio, los lee el panel (`resolveFilterPanel`) y no `buildSearchCriteria`.
 */
describe("cada nombre corto llega al criterio desde las dos páginas", () => {
  const NOT_CRITERIA = ["step", "zoneSearch"] as const;
  const FIELDS = (Object.keys(SEARCH_QUERY_NAMES) as (keyof typeof SEARCH_QUERY_NAMES)[]).filter(
    (field) => !NOT_CRITERIA.includes(field as (typeof NOT_CRITERIA)[number]),
  );

  for (const [name, page] of ENTRIES) {
    it(`/alquiler/<ciudad>${name === "zona" ? "/<zona>" : ""} los lee todos, por la tabla del dominio`, () => {
      const missing = FIELDS.filter((field) => !page.includes(`SEARCH_QUERY_NAMES.${field}`));

      expect(missing).toEqual([]);
    });
  }
});

/**
 * **Un dato, un lugar** (resolución del fundador, 2026-08-26). La ubicación
 * nunca aparece dos veces adentro de una dirección: la ruta de zona rechaza
 * `?zona=` y la de ciudad es la única que lo admite.
 */
describe("dónde vive la ubicación de la búsqueda", () => {
  /**
   * **Cada página declara SU forma de ruta, y la afirmación nombra cuál.**
   *
   * La primera versión de esta prueba aceptaba `"city"` o `"zone"` en las dos,
   * y una mutación lo destapó: cambiar la de zona a `route: "city"` le devolvía
   * el `?zona=` combinado con O —exactamente lo que la resolución prohíbe— **sin
   * poner nada en rojo**. Una afirmación que acepta las dos respuestas no está
   * afirmando la pregunta.
   */
  it.each([
    ["ciudad", "city"],
    ["zona", "zone"],
  ])("la de %s le pregunta al dominio con su propia forma de ruta", (name, route) => {
    const page = PAGES[name as keyof typeof PAGES];

    expect(page).toContain("resolveSearchLocation(");
    expect(page).toMatch(new RegExp(`route:\\s*"${route}"`));
  });

  it("la de zona afirma su zona de la ruta, que es la única que busca", () => {
    expect(PAGES.zona).toMatch(/routeZoneId:\s*place\.zone\.id/);
    // Y la de ciudad no tiene ninguna que afirmar: su ubicación entra entera
    // por la query.
    expect(PAGES.ciudad).not.toContain("routeZoneId");
  });

  it("la de zona no arma su propia lista de zonas extra", () => {
    // Antes filtraba `?zona=` a mano y las combinaba con la de la ruta. Esa
    // regla se mudó entera al dominio, y dejar la mitad acá es cómo las dos
    // versiones empiezan a decir cosas distintas.
    expect(PAGES.zona).not.toContain("extraZones");
  });

  it("la de zona dice cuando ignoró un «zona» que no le correspondía", () => {
    // Se ignora con un aviso en vez de romper la página (14.23b), y el texto lo
    // escribe el dominio.
    expect(PAGES.zona).toMatch(/location\.notice/);
  });

  it("las dos componen sus enlaces con la query que el dominio saneó", () => {
    for (const [, page] of ENTRIES) {
      // Un parámetro que viaja en cada enlace y no aplica es un medio-aplicado
      // con otra cara.
      expect(page).toContain("const query = location.query");
    }
  });
});
