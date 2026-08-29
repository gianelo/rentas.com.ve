import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SearchCriteria } from "@/modules/listing-search/domain/search-criteria";
import {
  CITIES,
  coversFor,
  DC_ALTAMIRA,
  DC_CHACAO,
  facetsFor,
  MARACAIBO,
  MCBO_BARATO,
  MCBO_CARO,
  matching,
  ZONES,
} from "../../catalogo-de-prueba";

/**
 * **La página de zona, con el script apagado** (tasks.md 11.5 y 11.6).
 *
 * `renderToStaticMarkup` es exactamente el punto: devuelve el marcado del
 * servidor **sin una sola marca de hidratación y sin ejecutar nada del
 * cliente**. Lo que estas pruebas leen es la respuesta que sale de la ruta, que
 * es lo único que un rastreador y un navegador de WhatsApp con el bundle caído
 * llegan a ver. Una prueba que pasara porque el navegador corrió el script no
 * estaría afirmando la pregunta.
 *
 * Es la misma disciplina que `app/mis-avisos/mis-avisos-contract.test.tsx` ya
 * dejó escrita —«se renderiza el servidor, no se lee el fuente»— y la razón por
 * la que no se comprueba leyendo `page.tsx`: este repositorio ya tuvo una
 * prueba que afirmaba `grid-template-columns` contra la hoja de estilos
 * mientras el encabezado se dibujaba invertido en los cuatro anchos. El texto
 * del archivo era verdad y el resultado era falso.
 *
 * **Estas dos NO pudieron fallar primero, y se dice acá en vez de fingir un
 * ciclo.** La página ya servía los avisos desde el servidor cuando se
 * escribieron: son pruebas de caracterización. Los dientes se los dan las
 * mutaciones, anotadas en la 11.5 y la 11.6 de `tasks.md`. La medición, tal
 * como salió: romper el render de las tarjetas —`results.map` → `[].map`— pone
 * en rojo las DOS, porque la 11.6 empieza afirmando que los avisos de Maracaibo
 * están y esa guarda cae con ellos; y concatenar una segunda `search` con la
 * ciudad hermana —la fuga de verdad— pone en rojo **exactamente una de 1791**,
 * la 11.6. Se anota así en vez de prometer un uno a uno que no se cumple.
 */

const { search, countFacets } = vi.hoisted(() => ({
  search: vi.fn(),
  countFacets: vi.fn(),
}));

vi.mock("@/shared/db/client", () => ({ db: {} }));
// Arrastra Auth.js entero y esta pantalla es anónima: el mismo doble que
// `mis-avisos-contract.test.tsx` usa por la misma razón.
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

import ZonaPage from "./page";

beforeEach(() => {
  process.env.R2_BUCKET_PUBLIC_URL = "https://fotos.rentas.test";
  search.mockReset();
  countFacets.mockReset();
  search.mockImplementation(async (criteria: SearchCriteria) => matching(criteria));
  countFacets.mockImplementation(async (criteria: SearchCriteria, offered: readonly string[]) =>
    facetsFor(criteria, offered),
  );
});

/** El cuerpo servido de `/alquiler/<ciudad>/<zona>`, sin ejecutar un solo script. */
async function servedBody(
  ciudad: string,
  zona: string,
  query: Record<string, string> = {},
): Promise<string> {
  return renderToStaticMarkup(
    await ZonaPage({
      params: Promise.resolve({ ciudad, zona }),
      searchParams: Promise.resolve(query),
    }),
  );
}

describe("la página de zona sin JavaScript", () => {
  /** 11.5 */
  it("trae los avisos activos de la zona en el cuerpo de la respuesta", async () => {
    const html = await servedBody("maracaibo", "tierra-negra");

    // El título, el precio y el enlace a la ficha: los tres salen del servidor.
    // El enlace es lo que decide si un rastreador puede seguir desde acá.
    expect(html).toContain(MCBO_BARATO.title);
    expect(html).toContain(MCBO_CARO.title);
    expect(html).toContain("$300");
    expect(html).toContain(`href="/alquiler/maracaibo/tierra-negra/`);
    // Y la cuenta que la pantalla escribe es la de la búsqueda entera.
    expect(html).toContain("2 propiedades activas");
  });

  /**
   * 11.6 — **el aislamiento, medido sobre el cuerpo servido.**
   *
   * Que el `WHERE` filtre lo prueba `tests/integration/listing-search.test.ts`
   * contra Postgres real. Lo que esta prueba cubre es el escalón que aquélla no
   * alcanza: que ESTA pantalla le pase al puerto la ciudad de SU ruta, y que
   * dibuje la respuesta del puerto y no el catálogo.
   *
   * Se afirma **cero de los de la otra ciudad**, no «algunos de los nuestros».
   * Y antes se afirma que los nuestros están, porque dos listas vacías también
   * son iguales: sin esa guarda, una página rota que no dibujara ningún aviso
   * pasaría esta prueba con las dos manos.
   */
  it("una zona de Maracaibo no trae ni un aviso de Distrito Capital", async () => {
    const html = await servedBody("maracaibo", "tierra-negra");

    expect(html).toContain(MCBO_BARATO.title);
    expect(html).toContain(MCBO_CARO.title);

    expect(html).not.toContain(DC_CHACAO.title);
    expect(html).not.toContain(DC_ALTAMIRA.title);
    // Ni el nombre de la otra ciudad como zona de un aviso: la tarjeta escribe
    // la zona, y una zona de Caracas acá sería el mismo defecto por otra vía.
    expect(html).not.toContain("Penthouse");

    // Y sin depender del falso: al puerto se le preguntó por Maracaibo y por
    // ninguna otra ciudad. Un `cityId` equivocado es la forma en que esta
    // pantalla puede romper el aislamiento sin que el SQL tenga nada que ver.
    for (const [criteria] of search.mock.calls) {
      expect((criteria as SearchCriteria).cityId).toBe(MARACAIBO.id);
    }
    expect(search).toHaveBeenCalledTimes(1);
  });

  /**
   * **La 16.9, medida donde falla: el enlace de IDA.**
   *
   * El mecanismo de la vuelta ya existía entero —`safeResultsOrigin`,
   * `withResultsOrigin`, `resultsLink`— y aun así el «← Resultados» de una
   * búsqueda filtrada nunca ocurría, porque **esta página no le pasaba el
   * origen a la cuadrícula**. La ficha caía en su respaldo («Ver avisos en
   * Tierra Negra») y quien había estrechado su búsqueda a un aviso volvía a la
   * zona pelada. Nada se veía roto: ése es exactamente el modo de fallo que la
   * tarea nombra.
   *
   * Se lee sobre el cuerpo servido y no sobre `page.tsx`, porque probar la
   * regla y probar que la pantalla la INSTALA son dos afirmaciones distintas
   * (`resultsOriginHref` ya tiene la suya en `search-query.test.ts`). Un
   * `toContain("resultsOriginHref")` seguiría verde con el argumento sin pasar.
   *
   * La dirección se pide con el panel abierto a propósito: lo que viaja es la
   * búsqueda, no el estado del acordeón. Volver con `filtros=precio` puesto le
   * devuelve el modal encima a quien pidió sus resultados.
   */
  it("cuelga de cada tarjeta la búsqueda entera, para que la vuelta la traiga (16.9)", async () => {
    const html = await servedBody("maracaibo", "tierra-negra", {
      max: "500",
      filtros: "precio",
    });

    const ficha = /href="(\/alquiler\/maracaibo\/tierra-negra\/[^"]+)"/.exec(html)?.[1];
    expect(ficha).toBeDefined();

    const volver = new URL(
      (ficha as string).replaceAll("&amp;", "&"),
      "https://rentas.com.ve",
    ).searchParams.get("volver");

    // El literal, no una expresión derivada de las mismas funciones que la
    // página usa: eso último pasaría en verde con las dos partes equivocadas.
    expect(volver).toBe("/alquiler/maracaibo/tierra-negra?max=500");
  });
});
