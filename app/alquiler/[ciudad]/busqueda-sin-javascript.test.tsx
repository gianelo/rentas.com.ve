import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SearchCriteria } from "@/modules/listing-search/domain/search-criteria";
import {
  CITIES,
  coversFor,
  DC_ALTAMIRA,
  DC_CHACAO,
  facetsFor,
  matching,
  ZONES,
} from "../catalogo-de-prueba";

/**
 * **La búsqueda con el script apagado** (tasks.md 11.2, 11.3 y 11.4).
 *
 * `renderToStaticMarkup` devuelve el marcado del servidor **sin marcas de
 * hidratación y sin ejecutar nada del cliente**: es la respuesta que sale de la
 * ruta, que es lo único que ve un rastreador o el navegador de WhatsApp cuando
 * el bundle no llega. Una prueba que pasara porque el navegador corrió el
 * script no estaría afirmando la pregunta.
 *
 * **No se comprueba leyendo `page.tsx`.** Este repositorio ya tuvo una prueba
 * que leía la hoja de estilos y afirmaba `grid-template-columns: 250px 1fr
 * 250px` mientras el encabezado se dibujaba invertido en los cuatro anchos: el
 * texto del archivo era verdad y el resultado era falso. La 11.4 en particular
 * se afirma por su resultado observable —el servidor ya filtró, y los controles
 * son direcciones— y no por la ausencia de una cadena en un archivo.
 *
 * **Ninguna pudo fallar primero, y se dice acá en vez de fingir un ciclo.** Las
 * tres describen comportamiento ya servido: son pruebas de caracterización.
 * Los dientes se los dan las mutaciones anotadas en `tasks.md`.
 */

const { search, countFacets } = vi.hoisted(() => ({
  search: vi.fn(),
  countFacets: vi.fn(),
}));

vi.mock("@/shared/db/client", () => ({ db: {} }));
vi.mock("@/modules/identity/infrastructure/session-port", () => ({
  nextAuthSessionPort: { getSession: async () => null },
}));
vi.mock("@/modules/listing-catalogue/infrastructure/drizzle-catalogue", () => ({
  DrizzleCatalogue: class {
    listCities = async () => CITIES;
    listZones = async () => ZONES;
  },
}));
vi.mock("@/modules/listing-search/infrastructure/drizzle-listing-search", () => ({
  DrizzleListingSearch: class {
    search = search;
  },
}));
vi.mock("@/modules/listing-search/infrastructure/drizzle-faceted-search", () => ({
  DrizzleFacetedSearch: class {
    countFacets = countFacets;
  },
}));
vi.mock("@/modules/listing-discovery/infrastructure/drizzle-listing-photos", () => ({
  DrizzleListingPhotos: class {
    coversFor = async (ids: readonly string[]) => coversFor(ids);
  },
}));

import CiudadPage from "./page";

beforeEach(() => {
  process.env.R2_BUCKET_PUBLIC_URL = "https://fotos.rentas.test";
  search.mockReset();
  countFacets.mockReset();
  search.mockImplementation(async (criteria: SearchCriteria) => matching(criteria));
  countFacets.mockImplementation(async (criteria: SearchCriteria, offered: readonly string[]) =>
    facetsFor(criteria, offered),
  );
});

/** El cuerpo servido de `/alquiler/<ciudad>`, sin ejecutar un solo script. */
async function servedBody(query: Record<string, string> = {}): Promise<string> {
  return renderToStaticMarkup(
    await CiudadPage({
      params: Promise.resolve({ ciudad: "distrito-capital" }),
      searchParams: Promise.resolve(query),
    }),
  );
}

/**
 * **El histograma viaja en el cuerpo servido** (14.12 rebanada C). Es una
 * decoración encima de un formulario `GET`: si necesitara un script para
 * aparecer, el panel de precio llegaría mudo justo donde el bundle no llega,
 * que es el navegador de WhatsApp (D13).
 */
describe("el histograma de precio se sirve desde el servidor", () => {
  it("las ocho barras y la frase salen en la respuesta, sin un solo script", async () => {
    // Doce avisos repartidos: por debajo del piso el dominio se niega, así que
    // una fixture más chica probaría la negativa y no el dibujo.
    countFacets.mockImplementation((criteria: SearchCriteria, offered: readonly string[]) => ({
      ...facetsFor(criteria, offered),
      byPriceBucket: [
        { count: 1, lowestUsd: 200, highestUsd: 240 },
        { count: 2, lowestUsd: 300, highestUsd: 380 },
        { count: 4, lowestUsd: 400, highestUsd: 495 },
        { count: 2, lowestUsd: 505, highestUsd: 590 },
        { count: 1, lowestUsd: 610, highestUsd: 690 },
        { count: 1, lowestUsd: 720, highestUsd: 780 },
        { count: 0 },
        { count: 1, lowestUsd: 1000, highestUsd: 1000 },
      ],
    }));

    const html = await servedBody({ filtros: "precio", min: "300", max: "700" });

    expect(html.split("data-placement=").length - 1).toBe(8);
    expect(html).toContain("la mayoría está entre");
    // Los dos rótulos del eje son avisos reales, no una escala fija.
    expect(html).toContain(">$200<");
    expect(html).toContain(">$1000<");
    // Y sigue sin costar un byte de cliente. Se afirma sobre el trozo del
    // histograma y no sobre la página entera: la pastilla trae los dos únicos
    // SVG en línea que el sistema permite, así que un `not.toMatch` global
    // estaría midiendo la pastilla y no el dibujo.
    // Los dos extremos del recorte se afirman antes de recortar: con uno
    // ausente `indexOf` devuelve -1 y el trozo sale vacío, que pasaría solo.
    expect(html).toContain('role="img"');
    const dibujo = html.slice(html.indexOf('role="img"'), html.indexOf("la mayoría"));
    expect(dibujo).not.toMatch(/<script|onclick|<canvas|<svg|<img/i);
    expect(dibujo).toContain("<span");
  });
});

describe("la búsqueda sin JavaScript", () => {
  /** 11.3 */
  it("trae los resultados en el cuerpo de la respuesta", async () => {
    const html = await servedBody();

    expect(html).toContain(DC_CHACAO.title);
    expect(html).toContain(DC_ALTAMIRA.title);
    expect(html).toContain("$450");
    expect(html).toContain("2 propiedades activas");
  });

  /**
   * 11.2 — **la dirección copiada es el estado de la búsqueda.**
   *
   * Los avisos circulan acá por WhatsApp: quien pega una búsqueda filtrada y
   * quien la abre tienen que ver lo mismo. Reabrir con otros filtros no es una
   * molestia, es una mentira sobre lo que se compartió.
   *
   * Se afirma sobre las tres caras de la selección a la vez, porque cada una
   * puede sobrevivir sola mientras las otras se pierden: las fichas de filtro
   * puesto, los campos del panel con su valor, y los resultados ya recortados.
   */
  it("una dirección con filtros reabre con esos mismos filtros puestos", async () => {
    const html = await servedBody({ min: "300", max: "800", hab: "2", filtros: "precio" });

    // Las fichas de «filtro puesto» dicen cuáles están puestos y cómo sacarlos.
    // Se afirma sobre la etiqueta del «×» y no sobre el texto suelto: «2 hab»
    // también lo escribe la línea de cada tarjeta, y una afirmación que dos
    // lugares distintos pueden satisfacer no está afirmando cuál de los dos.
    expect(html).toContain('data-testid="filter-chips"');
    expect(html).toContain('aria-label="Quitar $300 – $800"');
    expect(html).toContain('aria-label="Quitar 2 hab"');

    // Y el panel abierto vuelve con los dos extremos escritos: reabrir un panel
    // vacío obligaría a teclear otra vez lo que la dirección ya traía.
    expect(html).toMatch(/name="min"[^>]*value="300"/);
    expect(html).toMatch(/name="max"[^>]*value="800"/);

    // El recorte es el mismo que vio quien copió: el de $450 entra, el de
    // $1200 no. Sin esta afirmación las dos de arriba pasarían sobre una
    // pantalla que dibuja los filtros y devuelve el catálogo entero.
    expect(html).toContain(DC_CHACAO.title);
    expect(html).not.toContain(DC_ALTAMIRA.title);
  });

  /**
   * 11.4 — **el servidor ya filtró, y los controles son direcciones.**
   *
   * Se afirma por el resultado observable y no por lo que diga el archivo: que
   * la respuesta CAMBIE con la dirección es lo que prueba que el recorte ocurrió
   * antes de que existiera la respuesta, y no en una capa de cliente que nunca
   * llega. Un `not.toContain("use client")` sobre el fuente sería verde con el
   * filtrado hecho dentro de un componente hijo.
   */
  it("el recorte ocurre antes de la respuesta y no en una capa de cliente", async () => {
    const barata = await servedBody({ max: "500" });
    const cara = await servedBody({ min: "1000" });

    // Dos direcciones, dos cuerpos distintos: el servidor decidió, no el
    // navegador.
    expect(barata).toContain(DC_CHACAO.title);
    expect(barata).not.toContain(DC_ALTAMIRA.title);
    expect(cara).toContain(DC_ALTAMIRA.title);
    expect(cara).not.toContain(DC_CHACAO.title);

    // Y el criterio le llegó al puerto ya traducido desde la query.
    expect(search).toHaveBeenCalledWith(expect.objectContaining({ maxPriceUsd: 500 }));
    expect(search).toHaveBeenCalledWith(expect.objectContaining({ minPriceUsd: 1000 }));
  });

  /**
   * 11.4, la otra mitad: **la paginación es una dirección, no un manejador.**
   *
   * Recortar a 24 sin ofrecer los enlaces ya estuvo publicado acá, y truncar en
   * silencio es peor que no traer nada porque nadie puede verlo. Con el script
   * apagado, un botón que pagina en el cliente es exactamente ese truncamiento.
   */
  it("pasar de página es seguir un enlace, con el script apagado", async () => {
    countFacets.mockImplementation(
      async (criteria: SearchCriteria, offered: readonly string[]) => ({
        ...facetsFor(criteria, offered),
        total: 30,
      }),
    );

    const html = await servedBody();

    expect(html).toContain('aria-label="Paginación"');
    expect(html).toContain('href="/alquiler/distrito-capital?pag=2"');
    expect(html).toContain('rel="next"');
    // Un `<button>` acá sería la capa de cliente: sin script no envía nada, y
    // la dirección de la página 2 deja de poder pegarse en un chat.
    expect(html).not.toMatch(/<button[^>]*>\s*Siguiente/);
    // El panel de filtros es un formulario nativo por la misma razón.
    expect(await servedBody({ filtros: "precio" })).toMatch(
      /<form[^>]*action="\/alquiler\/distrito-capital"[^>]*method="get"/,
    );
  });

  /**
   * **La 16.9 en la ruta de la ciudad, que también ES una búsqueda** (14.24).
   *
   * Va acá y no sólo en la zona porque las dos pantallas tienen que componer el
   * MISMO origen y son dos archivos distintos: la que se olvidara del cuarto
   * argumento dejaría a media mitad del producto perdiendo los filtros al
   * volver, sin romper nada visible. Es exactamente la forma en que la 16.9
   * estuvo abierta con todo su dominio ya escrito y probado.
   *
   * Se lee sobre el cuerpo servido: probar la regla y probar que la pantalla la
   * INSTALA son dos afirmaciones distintas, y sólo una la ve un render.
   */
  it("cuelga de cada tarjeta la búsqueda entera, para que la vuelta la traiga (16.9)", async () => {
    const html = await servedBody({ max: "500", pag: "2", filtros: "precio" });

    const ficha = /href="(\/alquiler\/distrito-capital\/[^"]+)"/.exec(html)?.[1];
    expect(ficha).toBeDefined();

    const volver = new URL(
      (ficha as string).replaceAll("&amp;", "&"),
      "https://rentas.com.ve",
    ).searchParams.get("volver");

    // Literal, no derivado de las mismas funciones que compone la página: la
    // página en la que alguien estaba parado viaja, el panel abierto no.
    expect(volver).toBe("/alquiler/distrito-capital?max=500&pag=2");
  });
});
