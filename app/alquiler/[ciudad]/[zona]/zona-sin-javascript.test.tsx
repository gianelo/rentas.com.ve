import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { slugify } from "@/modules/listing-discovery/domain/listing-url";
import type { SearchCriteria } from "@/modules/listing-search/domain/search-criteria";
import {
  activeZonesFor,
  BARRIO_NUEVO_CRISTO,
  BARRIO_NUEVO_JUANA,
  CITIES,
  coversFor,
  DC_ALTAMIRA,
  DC_CHACAO,
  facetsFor,
  MARACAIBO,
  MCBO_BARATO,
  MCBO_BARRIO_NUEVO_CRISTO,
  MCBO_BARRIO_NUEVO_JUANA,
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

const { search, countFacets, findZoneBySlug } = vi.hoisted(() => ({
  search: vi.fn(),
  countFacets: vi.fn(),
  findZoneBySlug: vi.fn(),
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
    // 27.1 slice C: el panel y las sugerencias ya no piden la taxonomía
    // entera — piden sólo las zonas de la ciudad con avisos, ya contadas.
    listActiveZones = async (cityId: string) => activeZonesFor(cityId);
    // El mismo espía en las dos instancias que la página crea (ruta y panel):
    // `vi.hoisted` lo comparte, así que la aserción de más abajo ve las dos
    // llamadas sin volver a resolver la fábrica del mock.
    findZoneBySlug = findZoneBySlug;
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
  process.env.R2_BUCKET_PUBLIC_URL = "https://fotos.rentoru.test";
  search.mockReset();
  countFacets.mockReset();
  findZoneBySlug.mockReset();
  search.mockImplementation(async (criteria: SearchCriteria) => matching(criteria));
  countFacets.mockImplementation(async (criteria: SearchCriteria, offered: readonly string[]) =>
    facetsFor(criteria, offered),
  );
  // Lo mismo que `DrizzleCatalogue.findZoneBySlug` real: la ciudad por su
  // slug y, dentro de ella, las zonas cuyo slug coincide — nunca la primera
  // encontrada en un arreglo sin filtrar.
  findZoneBySlug.mockImplementation(async (citySlug: string, zoneSlug: string) => {
    const city = CITIES.find((candidate) => slugify(candidate.name) === citySlug);
    if (!city) return null;

    return {
      city,
      zones: ZONES.filter((zone) => zone.cityId === city.id && slugify(zone.name) === zoneSlug),
    };
  });
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

/**
 * **27.1, slice B — la ruta se resuelve por índice, no escaneando el
 * catálogo entero.**
 *
 * `loadCatalogue` seguía siendo lo único que existía para responder «¿qué
 * ciudad y qué zona nombran estos dos segmentos?», así que la respuesta
 * pasaba entera por la red para contestar una pregunta de una fila. Esto
 * afirma el cable, no la consulta — que `findZoneBySlug` (`DrizzleCatalogue`,
 * probado contra Postgres real en `tests/integration/catalogue.test.ts`) es
 * a quien esta página le pregunta, y con los dos segmentos exactos de la URL.
 */
describe("27.1 slice B: la ruta de zona resuelve por índice", () => {
  it("le pregunta a `findZoneBySlug`, con los segmentos de la URL", async () => {
    await servedBody("maracaibo", "tierra-negra");

    expect(findZoneBySlug).toHaveBeenCalledWith("maracaibo", "tierra-negra");
  });

  it("una ciudad o zona que el índice no conoce sigue devolviendo 404", async () => {
    // `toThrow()` a secas aceptaba CUALQUIER excepción: si la consulta al
    // índice reventara, la prueba seguiría en verde e informaría un 404 que
    // nunca ocurrió. Se afirma la señal exacta de `notFound()` en Next 15 —el
    // `digest`, que es por donde el enrutador decide servir la página 404—, no
    // que algo haya fallado.
    await expect(servedBody("ciudad-fantasma", "tierra-negra")).rejects.toMatchObject({
      digest: "NEXT_HTTP_ERROR_FALLBACK;404",
    });
  });
});

/**
 * **27.7 — la ruta de zona nombra un LUGAR, no una fila.**
 *
 * `/alquiler/maracaibo/barrio-nuevo` tiene que buscar en las DOS parroquias
 * de la semilla que se llaman "Barrio Nuevo", no sólo en la primera que
 * `findZoneBySlug` devuelva. Antes de esta tarea, `resolveZoneRoute` elegía
 * una sola zona del arreglo con `.find()` — el RED real es que sin el
 * arreglo entero yendo a la búsqueda, uno de los dos avisos nunca aparecería
 * bajo esta dirección.
 */
describe("27.7: la ruta de zona busca en todas las zonas que comparten el nombre", () => {
  it("trae avisos de las DOS parroquias que se llaman «Barrio Nuevo»", async () => {
    const html = await servedBody("maracaibo", "barrio-nuevo");

    expect(html).toContain(MCBO_BARRIO_NUEVO_CRISTO.title);
    expect(html).toContain(MCBO_BARRIO_NUEVO_JUANA.title);
    expect(html).toContain("2 propiedades activas");

    // Y sin depender del falso: las dos zonas viajaron juntas al puerto de
    // búsqueda, no una elegida en silencio sobre la otra.
    const [criteria] = search.mock.calls.at(-1) as [SearchCriteria];
    expect(criteria.zoneIds).toEqual(
      expect.arrayContaining([BARRIO_NUEVO_CRISTO.id, BARRIO_NUEVO_JUANA.id]),
    );
  });

  /**
   * **La decisión del fundador, 2026-09-08: la tarjeta nombra la parroquia,
   * y sólo cuando el nombre está compartido.** Cada tarjeta de este lugar
   * dice DE CUÁL parroquia habla, sin que la URL ni el `<h1>` cambien de
   * forma.
   */
  it("cada tarjeta dice de cuál parroquia habla, porque el nombre está compartido", () => {
    return servedBody("maracaibo", "barrio-nuevo").then((html) => {
      expect(html).toContain("Barrio Nuevo, Cristo de Aranza");
      expect(html).toContain("Barrio Nuevo, Juana de Ávila");
    });
  });

  /**
   * **El otro lado, y no por simetría.** Una zona cuyo nombre NO se comparte
   * —"Tierra Negra" es la única en la semilla— no debe ganar una coma que
   * nadie pidió: eso sería inventar ambigüedad donde no la hay.
   */
  it("una zona sin nombre compartido no gana una parroquia de más", async () => {
    const html = await servedBody("maracaibo", "tierra-negra");

    // El `<span>` de la meta de la tarjeta sigue cerrando justo después del
    // nombre, sin una coma ni una parroquia colgando detrás. El texto
    // alternativo de la foto ya llevaba una coma antes de esta tarea (título,
    // zona) y no es lo que esta prueba mira.
    expect(html).toContain(MCBO_BARATO.title);
    expect(html).toMatch(/Tierra Negra<\/span> · /);
  });

  it("el `<h1>` y el enlace de la ficha siguen nombrando el lugar, no la fila", async () => {
    const html = await servedBody("maracaibo", "barrio-nuevo");

    expect(html).toContain("Alquiler en Barrio Nuevo");
    // La URL de la ficha sigue siendo `.../barrio-nuevo/...`: la parroquia no
    // se cuela en la dirección canónica.
    expect(html).toContain('href="/alquiler/maracaibo/barrio-nuevo/');
  });
});

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
      "https://rentoru.com",
    ).searchParams.get("volver");

    // El literal, no una expresión derivada de las mismas funciones que la
    // página usa: eso último pasaría en verde con las dos partes equivocadas.
    expect(volver).toBe("/alquiler/maracaibo/tierra-negra?max=500");
  });
});

/**
 * **Lo mismo acá, y no por simetría** (14.13, F5): son dos archivos, y el que
 * se olvidara del cable dejaría media mitad del producto corrigiendo en
 * silencio sin romper nada visible — la forma de fallo que la 16.9 documentó.
 */
describe("lo que la búsqueda le corrigió al precio, dicho (14.13)", () => {
  it("dice que intercambió los dos extremos, con los números que se pidieron", async () => {
    const html = await servedBody("maracaibo", "tierra-negra", { min: "900", max: "300" });

    expect(html).toContain("Pediste de $900 a $300");
    expect(search).toHaveBeenCalledWith(
      expect.objectContaining({ minPriceUsd: 300, maxPriceUsd: 900 }),
    );
  });

  it("una búsqueda que no se corrigió no dice nada", async () => {
    // El otro lado: una frase que saliera siempre pasaría la de arriba.
    const html = await servedBody("maracaibo", "tierra-negra", { min: "300", max: "900" });

    expect(html).not.toContain("Pediste de");
    expect(html).not.toContain("se ajustó");
  });
});

/**
 * **«Limpiar todo» suelta la zona de la RUTA y conserva la ciudad** (14.22b,
 * F8): *«la ciudad no es un filtro, es el contexto»*.
 *
 * La regla la deciden `clearAllHref` y `buildSearchPanel`, y las dos la tienen
 * afirmada. Lo que **no** estaba afirmado es el cable: esta página elige qué
 * ruta le pasa como `cityPath`, y pasarle la suya —la que ya nombra la zona—
 * dejaría «Limpiar todo» conservando la zona sin poner roja una sola prueba de
 * dominio. Se lee sobre el cuerpo servido porque es la única capa donde esa
 * elección se ve.
 */
describe("«Limpiar todo» vuelve a la ciudad, no a la zona (14.22b)", () => {
  it("suelta la zona del camino y todos los filtros, y deja la ciudad", async () => {
    const html = await servedBody("maracaibo", "tierra-negra", {
      max: "500",
      hab: "2",
      pag: "2",
    });

    expect(html).toContain('href="/alquiler/maracaibo">Limpiar todo');
    // Y el otro lado, porque un enlace a la ciudad pelada podría ser cualquier
    // otro de la miga de pan: la zona no viaja adentro de ESE enlace.
    expect(html).not.toContain('href="/alquiler/maracaibo/tierra-negra">Limpiar todo');
  });
});

/**
 * **Un parámetro que esta ruta no admite se ignora CON aviso** (14.23b).
 *
 * `resolveSearchLocation` lo decide y `search-location.test.ts` lo afirma. Lo
 * que faltaba es que la frase llegue a la pantalla: el dominio puede devolver
 * el aviso perfecto y la página no dibujarlo, que es exactamente el modo de
 * fallo que la 16.9 dejó documentado — nada se ve roto.
 */
describe("el «zona» que esta ruta no admite se dice en la pantalla (14.23b)", () => {
  it("sale el aviso, y el parámetro no se arrastra a ningún enlace", async () => {
    const html = await servedBody("maracaibo", "tierra-negra", {
      zona: "la-lago",
      max: "500",
    });

    expect(html).toContain("Esta dirección ya nombra una zona");
    expect(html).not.toContain("zona=la-lago");
  });

  it("sin el parámetro no hay aviso: no se avisa de lo que nadie pidió", async () => {
    const html = await servedBody("maracaibo", "tierra-negra", { max: "500" });

    expect(html).not.toContain("Esta dirección ya nombra una zona");
  });
});
