import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * **La barra del producto en las dos pantallas de resultados** (tasks.md
 * 14.41), atada a lo que el dominio decide por ellas.
 *
 * Las dos páginas hacen la misma pregunta con el mismo `buildFilterPanel` — la
 * de zona es la de ciudad con un segmento más —, así que la comprobación corre
 * sobre las dos a la vez: **dos pantallas que se cablean por separado es cómo
 * empiezan a discrepar**, y esta suite existe para que discrepar no compile en
 * verde. Es el mismo mecanismo que `indexing-contract.test.ts` y
 * `pagination-contract.test.ts` ya usan al lado: se lee el archivo, porque lo
 * que puede fallar es una relación entre la página y el dominio.
 */
const PAGES = {
  ciudad: readFileSync(new URL("./page.tsx", import.meta.url), "utf8"),
  zona: readFileSync(new URL("./[zona]/page.tsx", import.meta.url), "utf8"),
};

const ENTRIES = Object.entries(PAGES);

describe("las dos pantallas de resultados y la barra del producto", () => {
  it("la guarda: los dos archivos que se están midiendo son los que se creen", () => {
    // Sin esto, un `page.tsx` movido de lugar dejaría a toda la suite midiendo
    // una cadena vacía y pasando por eso — la peor forma de verde.
    expect(PAGES.ciudad).toContain("export default async function CiudadPage");
    expect(PAGES.zona).toContain("export default async function ZonaPage");
  });

  for (const [name, page] of ENTRIES) {
    describe(`/alquiler/<ciudad>${name === "zona" ? "/<zona>" : ""}`, () => {
      it("dibuja el Nav y ya no la barra resumen que sólo existía en móvil", () => {
        expect(page).toContain("<Nav");
        expect(page).not.toContain("SearchSummaryBar");
      });

      it("resuelve el estado de la barra en el dominio y no en la página", () => {
        expect(page).toContain("resolveNavAccount(");
        expect(page).toContain("resolveNavPublish(");
      });

      /**
       * **El estado de la pastilla lo decide `resolveSearchPill`, no la
       * página.** Qué texto lleva, si el filtro aparece, con qué palabra y en
       * qué color: son decisiones de producto, y viven en
       * `listing-catalogue/domain/search-pill.ts` con el suelo del 90 % encima.
       */
      it("pide el estado de la pastilla al dominio", () => {
        expect(page).toContain("resolveSearchPill(");
      });

      /**
       * **El número de la pastilla es `pillFilters`, nunca `activeFilters`.**
       *
       * Son dos conteos distintos y sólo uno abre lo que la pastilla abre: el
       * engranaje del acordeón contaba la zona, y el filtro de la pastilla no
       * la incluye (14i: *"ciudad y zona no están ahí: eso lo resuelve el
       * texto"*; lámina 7c: con dos zonas, precio, habitaciones y dueños
       * puestos, la pastilla dice «3 filtros»). Un «4 filtros» sobre un panel
       * que abre tres se dibuja perfecto y está mal.
       */
      it("cuenta los filtros de la pastilla con pillFilters, no con activeFilters", () => {
        expect(page).toMatch(/filterCount:\s*panel\.pillFilters/);
        expect(page).not.toMatch(/filterCount:\s*panel\.activeFilters/);
      });

      /**
       * El enlace del filtro es la MISMA dirección con el panel abierto desde
       * el servidor (14i, "Cómo se implementa"): un enlace real, no un botón
       * que sólo funciona con el bundle cargado. Es el que la barra resumen
       * llevaba en el engranaje, y sobrevive al cambio de pieza.
       */
      it("el filtro es un enlace real a la misma URL con el panel abierto", () => {
        expect(page).toContain("filtersHref");
        expect(page).toContain("#filtros");
      });

      /**
       * **El texto de la pastilla busca donde el servidor traduce.** La caja es
       * el mismo mecanismo del inicio: un `GET` a `/` con `?q=`, que
       * `resolveSearchDestination` convierte en una redirección a la ruta del
       * lugar (14.24). Escribir el `action` o el nombre del parámetro acá sería
       * una segunda copia del contrato de la URL.
       */
      it("arma la caja con el mismo homeSearchForm que el servidor traduce", () => {
        expect(page).toContain("homeSearchForm(");
        expect(page).toMatch(/action:\s*searchForm\.action/);
        expect(page).toMatch(/name:\s*searchForm\.name/);
      });

      /** Sin JavaScript de cliente: sigue siendo el camino de lectura (D13). */
      it("no agrega JavaScript de cliente", () => {
        expect(page).not.toContain('"use client"');
      });

      /**
       * El adaptador de cartera que `/mis-avisos` consulta para
       * `canImportListings` no se llama acá: la barra no lo mira, y sería una
       * consulta por búsqueda a cambio de nada en la parte del sitio que Google
       * recorre.
       */
      it("no consulta la cartera del importador en el camino de lectura", () => {
        expect(page).not.toContain("BulkImportAccounts");
      });
    });
  }

  /**
   * **La miga de pan es lo que reemplaza a la flecha de la barra resumen.** Esa
   * barra sólo existía bajo 768 px y llevaba un `←` a la ciudad o al inicio; el
   * `Nav` pone la marca en su lugar. Sin la miga, el teléfono se quedaría sin
   * un paso hacia arriba que no sea el botón del navegador.
   */
  it("las dos conservan la miga de pan, que es la salida hacia arriba", () => {
    for (const [, page] of ENTRIES) {
      expect(page).toContain('aria-label="Miga de pan"');
    }
  });
});
