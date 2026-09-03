import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CatalogueZone } from "@/modules/listing-catalogue/domain/catalogue";
// El nombre del parámetro lo pone el dominio, acá también: escrito a mano, un
// renombre dejaría a esta prueba midiendo la ficha SIN origen y pasando por eso.
import { RETURN_PARAM } from "@/modules/listing-discovery/domain/return-to-results";
import type { ListingSearchResult } from "@/modules/listing-search/application/ports/listing-search.port";
import type { SearchCriteria } from "@/modules/listing-search/domain/search-criteria";

/**
 * **La ficha servida, en los bytes que salen de la ruta** (tareas 11.8, 11.10,
 * 11.11, 11.21 y 15.8).
 *
 * Quien abre esta pantalla llegó por un enlace pegado en un grupo de WhatsApp
 * hace meses, o por un resultado de Google que sigue indexado. `design.md` lo
 * dice sin rodeos: es **el visitante más valioso que el sitio recibe** —
 * escribió la zona exacta y la intención exacta— y un 404 lo tira a la calle.
 *
 * `renderToStaticMarkup` es el punto entero: devuelve el marcado del servidor
 * sin ejecutar una línea de cliente, así que lo que estas pruebas leen es la
 * respuesta que sale de la ruta. Es la misma disciplina de
 * `zona-sin-javascript.test.tsx`, y por la misma razón: este repositorio ya
 * tuvo una prueba que afirmaba una cadena del fuente mientras la pantalla se
 * dibujaba mal.
 */

const {
  search,
  listZones,
  findForDetail,
  coversFor,
  allFor,
  notFound,
  permanentRedirect,
  redirect,
} = vi.hoisted(() => ({
  search: vi.fn(),
  listZones: vi.fn(),
  findForDetail: vi.fn(),
  coversFor: vi.fn(),
  allFor: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  permanentRedirect: vi.fn((to: string) => {
    throw new Error(`NEXT_PERMANENT_REDIRECT:${to}`);
  }),
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  }),
}));

vi.mock("next/navigation", () => ({ notFound, permanentRedirect, redirect }));
vi.mock("@/shared/db/client", () => ({ db: {} }));
// Anónimo, y sin arrastrar Auth.js: el mismo doble que el resto de las pruebas
// de render de este repositorio.
vi.mock("../../../../_lib/session", () => ({
  readSession: async () => null,
  requestSessionPort: { getSession: async () => null },
}));
vi.mock("@/modules/contact-reveal/infrastructure/drizzle-contact-reveal", () => ({
  DrizzleContactRevealEvents: class {
    findLatestMessage = async () => null;
  },
  DrizzleContactRevealMetrics: class {
    findUniquePairs = async () => [];
  },
  DrizzleRevealableListing: class {
    findRevealable = async () => null;
  },
}));
vi.mock("@/modules/listing-discovery/infrastructure/drizzle-listing-detail", () => ({
  DrizzleListingDetail: class {
    findForDetail = findForDetail;
  },
}));
vi.mock("@/modules/listing-discovery/infrastructure/drizzle-listing-photos", () => ({
  DrizzleListingPhotos: class {
    coversFor = coversFor;
    allFor = allFor;
  },
}));
vi.mock("@/modules/listing-search/infrastructure/drizzle-listing-search", () => ({
  DrizzleListingSearch: class {
    search = search;
  },
}));
vi.mock("@/modules/listing-catalogue/infrastructure/drizzle-catalogue", () => ({
  DrizzleCatalogue: class {
    listCities = async () => [];
    listZones = listZones;
  },
}));
// La acción de servidor arrastra `next/headers` y Auth.js; lo que se prueba acá
// es lo que sale del servidor, no lo que la acción hace al recibir el POST.
vi.mock("./reveal-actions", () => ({
  revealListingContact: vi.fn(),
  continueWithGoogle: vi.fn(),
}));

import FichaPage from "./page";

const MARACAIBO = { id: "ciudad-mcbo", name: "Maracaibo" };
const DISTRITO = { id: "ciudad-dc", name: "Distrito Capital" };
const TIERRA_NEGRA = { id: "zona-tierra-negra", name: "Tierra Negra", cityId: MARACAIBO.id };
const BELLA_VISTA = { id: "zona-bella-vista", name: "Bella Vista", cityId: MARACAIBO.id };
const CHACAO = { id: "zona-chacao", name: "Chacao", cityId: DISTRITO.id };

const ZONES: readonly CatalogueZone[] = [TIERRA_NEGRA, BELLA_VISTA, CHACAO].map((zone) => ({
  ...zone,
  kind: "elemento" as const,
  category: null,
  parentName: null,
}));

const VENCIDO_ID = "3f2a91cb-04d7-b8e0-1a55-9c7e2d4f6b03";
const VENCIDO_TITLE = "Apartamento 3 habitaciones en Tierra Negra";
const VENCIDO_SLUG = `apartamento-3-habitaciones-en-tierra-negra-${VENCIDO_ID}`;

/** El teléfono que ninguna de estas respuestas puede contener (11.11). */
const TELEFONO = "+58 412 7654321";

/**
 * **Relativas al reloj de la corrida, no fijas** (11.23). Una fecha futura
 * escrita a mano es una prueba con fecha de caducidad: el día que el calendario
 * la alcanza, la prueba cambia de sujeto sin que nadie la toque. Una hora de
 * margen sobra para cualquier render.
 */
const HORA = 60 * 60 * 1000;
const VIGENTE = () => new Date(Date.now() + HORA);
const VENCIDO_POR_RELOJ = () => new Date(Date.now() - HORA);

function detail(overrides: Record<string, unknown> = {}) {
  return {
    id: VENCIDO_ID,
    cityId: MARACAIBO.id,
    cityName: MARACAIBO.name,
    zoneId: TIERRA_NEGRA.id,
    zoneName: TIERRA_NEGRA.name,
    zoneParentName: null,
    zoneCategory: null,
    title: VENCIDO_TITLE,
    description:
      "Planta eléctrica propia y tanque de agua. Tres habitaciones con aire acondicionado. Puesto de estacionamiento techado.",
    propertyType: "apartamento" as const,
    publisherType: "owner" as const,
    publisherName: "Publicante de ejemplo",
    priceUsd: 480,
    rooms: 3,
    bathrooms: 3,
    areaM2: 120,
    parkingSpots: 2,
    hasPowerPlant: true,
    hasRegularWater: true,
    isFurnished: false,
    hasSecurity: false,
    hasAppliances: false,
    contactMethod: "whatsapp" as const,
    // **Contaminado a propósito**: la fila del detalle no lleva contacto, pero
    // si algún día lo llevara, esta prueba lo vería salir por la respuesta.
    contactValue: TELEFONO,
    status: "expired" as const,
    publishedAt: new Date("2026-06-13T12:00:00Z"),
    expiresAt: new Date("2026-07-13T12:00:00Z"),
    ...overrides,
  };
}

function activo(id: string, title: string, zone: { id: string; cityId: string }) {
  return {
    id,
    cityId: zone.cityId,
    zoneId: zone.id,
    title,
    priceUsd: 380,
    rooms: 2,
    areaM2: 68,
    publisherType: "owner" as const,
    publishedAt: new Date("2026-08-01T12:00:00Z"),
    // La misma contaminación, del lado de la búsqueda: es la fila que alimenta
    // las tarjetas sugeridas.
    contactValue: TELEFONO,
  } as unknown as ListingSearchResult;
}

const VECINO_1 = activo("mcbo-1", "Apartamento en Tierra Negra con planta", TIERRA_NEGRA);
const VECINO_2 = activo("mcbo-2", "Casa amoblada en Tierra Negra", TIERRA_NEGRA);
const OTRA_ZONA = activo("mcbo-9", "Estudio amoblado en Bella Vista", BELLA_VISTA);
const OTRA_CIUDAD = activo("dc-1", "Penthouse en Chacao", CHACAO);

/** Portadas para todos: sin las dos derivadas, la regla F9 los saca de la cuadrícula. */
function covers(ids: readonly string[]) {
  return new Map(
    ids.map((id) => [id, { keys: { thumb: `${id}/thumb.webp`, card: `${id}/card.webp` } }]),
  );
}

beforeEach(() => {
  process.env.R2_BUCKET_PUBLIC_URL = "https://fotos.rentas.test";
  process.env.SITE_URL = "https://rentas.test";
  vi.clearAllMocks();
  findForDetail.mockResolvedValue(detail());
  allFor.mockResolvedValue([]);
  coversFor.mockImplementation(async (ids: readonly string[]) => covers(ids));
  listZones.mockResolvedValue(ZONES);
  search.mockResolvedValue([]);
});

/** El cuerpo servido de la ficha, sin ejecutar un solo script. */
async function servedBody(slug: string = VENCIDO_SLUG, query: Record<string, string> = {}) {
  return renderToStaticMarkup(
    await FichaPage({
      params: Promise.resolve({ ciudad: "maracaibo", zona: "tierra-negra", slug }),
      searchParams: Promise.resolve(query),
    }),
  );
}

/** La zona trae dos activos; la ciudad nunca debería preguntarse. */
function zonaConAvisos() {
  search.mockImplementation(async (criteria: SearchCriteria) =>
    criteria.zoneIds ? [VECINO_1, VECINO_2] : [OTRA_ZONA],
  );
}

/** Extrae el JSON-LD servido, que es el unico canal de indexacion de la ficha. */
function jsonLd(html: string): string {
  const match = /<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  if (!match?.[1]) throw new Error("la ficha no emitio JSON-LD");
  return match[1];
}

/**
 * tasks.md 14.54 — **la vuelta se va del encabezado y entra al contenido.**
 *
 * La ficha era la única pantalla del camino de lectura donde la vuelta vivía en
 * la barra; `/alquiler/[ciudad]` y `/alquiler/[ciudad]/[zona]` la dibujan
 * adentro desde siempre. Y el enlace **no siempre dice «← Resultados»**:
 * `resultsLink` es una regla de dominio que devuelve «Ver avisos en Tierra
 * Negra» cuando no hay origen, una etiqueta que no entra en una barra de 60 px
 * y sí entra en una fila arriba del contenido.
 *
 * Se mide sobre los bytes servidos y no sobre el texto del archivo porque lo
 * que cambió es **dónde** se dibuja: una afirmación sobre el fuente no
 * distingue un enlace dentro del `<header>` de uno dentro del `<main>`.
 */
describe("la vuelta vive dentro del contenido, no en la barra (14.54)", () => {
  /** El encabezado servido: todo lo que va antes de que cierre el `<header>`. */
  function encabezado(html: string): string {
    const fin = html.indexOf("</header>");
    if (fin < 0) throw new Error("la ficha no sirvió ningún encabezado");
    return html.slice(0, fin);
  }

  it("el encabezado no lleva ninguna vuelta: ni la etiqueta con origen ni la de sin él", async () => {
    const conOrigen = encabezado(
      await servedBody(VENCIDO_SLUG, { [RETURN_PARAM]: "/alquiler/maracaibo?min=200" }),
    );
    const sinOrigen = encabezado(await servedBody());

    expect(conOrigen).not.toContain("Resultados");
    expect(sinOrigen).not.toContain("Ver avisos en");
  });

  it("la dibuja dentro del <main>, arriba del contenido", async () => {
    const html = await servedBody();

    // Posiciones y no `toContain`: lo que esta prueba existe para ver es el
    // SITIO, y «está en el documento» seguía en verde con el enlace en la barra.
    const main = html.indexOf("<main");
    const vuelta = html.indexOf("Ver avisos en Tierra Negra");
    // El `<h1>` y no el texto del título: éste sale ANTES dentro del JSON-LD,
    // que la ficha emite arriba del contenido. Buscar el texto medía el script.
    const titulo = html.indexOf("<h1");

    expect(main).toBeGreaterThanOrEqual(0);
    expect(vuelta).toBeGreaterThan(main);
    expect(vuelta).toBeLessThan(titulo);
  });

  /**
   * **La regla no se movió, se movió el marcado.** `resultsLink` sigue
   * decidiendo las dos cosas —a dónde va y qué dice—, y las dos respuestas se
   * comprueban acá: un destino fijo con etiqueta variable, o al revés, es el
   * defecto original de la 16.9 escrito de nuevo un nivel más abajo.
   */
  it("el destino y la etiqueta los sigue decidiendo el dominio", async () => {
    const origen = "/alquiler/maracaibo?min=200";
    const conOrigen = await servedBody(VENCIDO_SLUG, { [RETURN_PARAM]: origen });

    expect(conOrigen).toContain(">← Resultados<");
    expect(conOrigen).toContain(`href="${origen.replace("&", "&amp;")}"`);

    const sinOrigen = await servedBody();

    expect(sinOrigen).toContain(">Ver avisos en Tierra Negra<");
    expect(sinOrigen).toContain('href="/alquiler/maracaibo/tierra-negra"');
  });
});

/**
 * tasks.md 18.7 — **la referencia se muestra y no se indexa, y las dos mitades
 * se afirman sobre los MISMOS bytes.**
 *
 * La seña es el campo que reemplaza a Google Places, y la razon por la que se
 * rechazo aquel servicio es que una direccion formateada no es la taxonomia
 * del producto: el filtro, los conteos, la URL y las paginas de zona dependen
 * de que la zona sea una lista cerrada. Emitir la seña en el JSON-LD la
 * entregaria a un buscador como un dato de ubicacion al lado de la zona — que
 * es una forma de indexarla, aunque no exista un filtro.
 */
describe("la referencia se lee en la ficha y no se indexa (18.7)", () => {
  const SENA = "A dos calles de la plaza Altamira, edificio azul";

  it("dibuja la seña debajo de la ubicacion", async () => {
    findForDetail.mockResolvedValue(
      detail({ status: "active", expiresAt: VIGENTE(), reference: SENA }),
    );

    const html = await servedBody();

    expect(html).toContain(SENA);
  });

  it("no la emite en el JSON-LD, que es el canal que un buscador cita sin abrir la pagina", async () => {
    findForDetail.mockResolvedValue(
      detail({ status: "active", expiresAt: VIGENTE(), reference: SENA }),
    );

    const html = await servedBody();

    // La misma respuesta lleva la seña en el cuerpo y no la lleva en el
    // documento estructurado. Afirmar solo lo segundo pasaria tambien si la
    // ficha hubiera dejado de dibujarla.
    expect(html).toContain(SENA);
    expect(jsonLd(html)).not.toContain("plaza Altamira");
    // Y la zona, que SI es taxonomia, sigue estando donde corresponde.
    expect(jsonLd(html)).toContain(TIERRA_NEGRA.name);
  });

  it("un aviso sin seña no dibuja una linea vacia debajo de la ubicacion", async () => {
    findForDetail.mockResolvedValue(
      detail({ status: "active", expiresAt: VIGENTE(), reference: null }),
    );

    const html = await servedBody();

    expect(html).not.toContain(SENA);
    // El parrafo de la seña no existe cuando no hay seña: un `<p>` vacio bajo
    // la ubicacion se lee como un dato que falta y no como uno que no hay.
    expect(html).not.toMatch(/<p class="[^"]*reference[^"]*"><\/p>/);
  });
});

describe("la ficha vencida se sirve en vez de responder 404 (11.8)", () => {
  it("responde con la pantalla del aviso y dice que venció", async () => {
    zonaConAvisos();

    const html = await servedBody();

    expect(notFound).not.toHaveBeenCalled();
    expect(html).toContain("Aviso vencido");
    // La fecha entera, no una abreviatura: es el dato que explica la pantalla.
    expect(html).toContain("13 de julio");
    // Y el aviso sigue siendo legible: quien llegó quiere saber qué era.
    expect(html).toContain(VENCIDO_TITLE);
  });

  /**
   * **La mitad que faltaba.** El bloque de contacto ya decía «vencido» y ya
   * llevaba un enlace a la zona; lo que la 11.8 pide —y lo que `design.md`
   * llama la conversión que rescata al visitante— son los avisos activos
   * dibujados ahí mismo, no un enlace a otra pantalla.
   */
  it("trae los avisos activos de la misma zona en el cuerpo de la respuesta", async () => {
    zonaConAvisos();

    const html = await servedBody();

    expect(html).toContain(VECINO_1.title);
    expect(html).toContain(VECINO_2.title);
    // Con su enlace a la ficha, que es lo que decide si esto rescata a alguien
    // o sólo lo entretiene.
    expect(html).toContain(`/alquiler/maracaibo/tierra-negra/`);
    expect(html).toContain("Otros avisos activos en Tierra Negra");
  });
});

describe("las sugerencias se amplían a la ciudad y nunca más allá (11.10)", () => {
  it("una zona sin activos ofrece los de la ciudad, y lo dice", async () => {
    search.mockImplementation(async (criteria: SearchCriteria) =>
      criteria.zoneIds ? [] : [OTRA_ZONA],
    );

    const html = await servedBody();

    expect(html).toContain(OTRA_ZONA.title);
    // El encabezado dice el alcance real: sin esto, cuatro tarjetas de Bella
    // Vista saldrían bajo un título que promete Tierra Negra.
    expect(html).toContain("No quedan avisos activos en Tierra Negra");
    expect(html).toContain("Maracaibo");
  });

  /**
   * **Una ciudad sin activos no ofrece nada**, y ésa es la mitad que sólo se
   * puede afirmar por la negativa: se comprueba primero que la pantalla SÍ
   * dibuja sugerencias cuando las hay, porque una página rota que nunca las
   * dibuje pasaría esta prueba con las dos manos.
   */
  it("una ciudad sin activos no ofrece ninguna sugerencia", async () => {
    search.mockResolvedValue([]);

    const html = await servedBody();

    expect(html).toContain("Aviso vencido");
    expect(html).not.toContain("Otros avisos activos en");
    expect(html).not.toContain("No quedan avisos activos en");
  });

  /**
   * **Ni un aviso de la otra ciudad**, aunque el puerto lo devolviera. Es el
   * mismo aislamiento que `ListingSearchPort` garantiza con su `cityId`
   * obligatorio y que la 11.6 mide del lado de la zona; acá se mide en la
   * pantalla donde ampliar es exactamente lo que se hace.
   */
  it("ni una sugerencia de Distrito Capital en una ficha de Maracaibo", async () => {
    search.mockImplementation(async (criteria: SearchCriteria) =>
      criteria.zoneIds ? [] : [OTRA_CIUDAD, OTRA_ZONA],
    );

    const html = await servedBody();

    expect(html).toContain(OTRA_ZONA.title);
    expect(html).not.toContain(OTRA_CIUDAD.title);
    expect(html).not.toContain("Chacao");

    // Y sin depender del falso: al puerto se le preguntó por Maracaibo y por
    // ninguna otra ciudad, en las dos consultas.
    expect(search).toHaveBeenCalled();
    for (const [criteria] of search.mock.calls) {
      expect((criteria as SearchCriteria).cityId).toBe(MARACAIBO.id);
    }
  });
});

describe("un visitante anónimo no ve ningún contacto (11.11)", () => {
  /**
   * **La garantía no es "no lo dibujamos": es que no hay dónde dibujarlo.** El
   * estado bloqueado no tiene propiedad `value`, `ListingSearchResult` no
   * declara contacto y `GridCard` tampoco. Esta prueba pega un teléfono encima
   * de la fila del detalle Y de cada fila sugerida, para que esa garantía se
   * mida en vez de suponerse: si alguien alguna vez esparce la fila cruda hacia
   * la tarjeta, esto se pone rojo.
   */
  it("ningún valor de contacto viaja en la respuesta, ni del aviso ni de los sugeridos", async () => {
    zonaConAvisos();

    const html = await servedBody();

    // La guarda: las sugerencias están dibujadas, así que la ausencia de abajo
    // significa algo.
    expect(html).toContain(VECINO_1.title);
    expect(html).not.toContain(TELEFONO);
    expect(html).not.toContain("7654321");
    expect(html).not.toContain("wa.me");
  });

  /** Ni el botón de revelar: un aviso vencido no tiene contacto para nadie. */
  it("no ofrece revelar el contacto de un aviso vencido", async () => {
    zonaConAvisos();

    const html = await servedBody();

    expect(html).not.toContain("Ver WhatsApp");
    expect(html).toContain("No mostramos el contacto de avisos vencidos");
  });
});

describe("la disponibilidad sale del reloj y no del rótulo (11.23)", () => {
  /**
   * **La ventana dura hasta casi un día, y está medida.** `vercel.json` corre
   * `/api/jobs/expiry-reminders` con `0 13 * * *` — una vez al día, a las 13:00
   * UTC— y `markExpired` vive adentro de ese trabajo: nada más mueve el rótulo.
   * Un aviso vence a los 30 días de la hora en que se publicó, así que entre
   * «vencido por reloj» y «vencido en la base» pasan de 0 a casi 24 horas.
   *
   * En esa ventana la misma pantalla se contradecía: el `<head>` pedía
   * `noindex` porque `resolveListingIndexing` lee el reloj, mientras el cuerpo
   * dibujaba el bloque de contacto con llave y ofrecía revelar. Quien llega
   * desde un enlace de WhatsApp gastaba una de sus 40 revelaciones diarias y
   * escribía un mensaje para que le contestaran «ya lo alquilé» — el mensaje
   * desperdiciado que la 5.5 evita del lado de la búsqueda.
   */
  it("un aviso que todavía dice active pero cuya fecha ya pasó se dibuja vencido", async () => {
    findForDetail.mockResolvedValue(detail({ status: "active", expiresAt: VENCIDO_POR_RELOJ() }));
    zonaConAvisos();

    const html = await servedBody();

    expect(html).toContain("Aviso vencido");
    expect(html).toContain("No mostramos el contacto de avisos vencidos");
    expect(html).not.toContain("Ver WhatsApp del dueño");
  });

  /**
   * **La otra mitad, y sin ella la de arriba no afirma nada.** Una página que
   * dibujara siempre el estado vencido pasaría aquélla con las dos manos. Ésta
   * es la que obliga a que el reloj se lea de verdad en vez de responder que
   * todo venció.
   */
  it("un aviso active cuya fecha no pasó sigue ofreciendo el contacto", async () => {
    findForDetail.mockResolvedValue(detail({ status: "active", expiresAt: VIGENTE() }));

    const html = await servedBody();

    expect(html).toContain("Ver WhatsApp del dueño");
    expect(html).not.toContain("Aviso vencido");
  });

  /**
   * Y el rescate de la 11.8 alcanza a esa ventana: si la pantalla dice que
   * venció, tiene que ofrecer la salida que la pantalla vencida ofrece. Sin
   * esto, la corrección dejaría a ese visitante en una ficha muerta y sin
   * ninguna puerta.
   */
  it("y rescata al visitante con los avisos vivos de su zona", async () => {
    findForDetail.mockResolvedValue(detail({ status: "active", expiresAt: VENCIDO_POR_RELOJ() }));
    zonaConAvisos();

    const html = await servedBody();

    expect(html).toContain("Otros avisos activos en Tierra Negra");
    expect(html).toContain(VECINO_1.title);
  });
});

describe("el deber canónico de la ruta de la ficha (11.21)", () => {
  /**
   * **Sólo el id identifica un aviso** (11.1), así que toda ruta que termine en
   * el mismo id resuelve a este aviso. Servirlas todas publicaría direcciones
   * duplicadas sin techo para un solo aviso, y Google reparte la autoridad
   * entre todas.
   */
  it("un camino que no es el canónico redirige al canónico", async () => {
    zonaConAvisos();

    await expect(servedBody(`titulo-viejo-${VENCIDO_ID}`)).rejects.toThrow(/PERMANENT_REDIRECT/);

    expect(permanentRedirect).toHaveBeenCalledTimes(1);
    expect(permanentRedirect.mock.calls[0]?.[0]).toBe(
      `/alquiler/maracaibo/tierra-negra/${VENCIDO_SLUG}`,
    );
  });

  /**
   * **308 y no 307, y ésa era la pregunta que la 11.21 dejó abierta.** Un 307 es
   * temporal: le dice al rastreador que conserve la dirección vieja en el
   * índice, que es exactamente el problema que esta redirección existe para
   * resolver. Un 308 mueve el índice a la dirección canónica y deja de repartir
   * la autoridad del aviso entre dos páginas.
   */
  it("es permanente: un rastreador tiene que poder mover el índice", async () => {
    zonaConAvisos();

    await expect(servedBody(`titulo-viejo-${VENCIDO_ID}`)).rejects.toThrow();

    expect(redirect).not.toHaveBeenCalled();
  });

  it("el camino canónico se sirve sin redirigir", async () => {
    zonaConAvisos();

    const html = await servedBody();

    expect(permanentRedirect).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
    expect(html).toContain(VENCIDO_TITLE);
  });

  /**
   * **`listingIdFromSlug` devolviendo `null` es la guarda, no una comodidad**:
   * su resultado se convierte en un `WHERE id = $1`.
   */
  it("un segmento que no termina en un id no llega nunca a la base", async () => {
    await expect(servedBody("apartamento-lindo")).rejects.toThrow("NEXT_NOT_FOUND");

    expect(findForDetail).not.toHaveBeenCalled();
  });
});

describe("un aviso activo no arrastra el costo de las sugerencias", () => {
  /**
   * Las sugerencias son de la pantalla vencida. En la ficha activa —la más
   * visitada del sitio— cada consulta de más es un viaje HTTP a Neon que nadie
   * pidió.
   */
  /**
   * **La fecha vigente es parte del sujeto, y antes faltaba** (11.23). Este
   * caso decía `status: "active"` sobre la fila de ejemplo, cuya fecha de
   * vencimiento ya pasó — o sea que describía exactamente la ventana en la que
   * el rótulo y el reloj no coinciden, y afirmaba que ahí SÍ se ofrece el
   * contacto. Con la disponibilidad saliendo del reloj, un aviso activo es el
   * que además no venció.
   */
  it("la ficha activa no consulta el catálogo ni la búsqueda", async () => {
    findForDetail.mockResolvedValue(detail({ status: "active", expiresAt: VIGENTE() }));

    const html = await servedBody();

    expect(search).not.toHaveBeenCalled();
    expect(listZones).not.toHaveBeenCalled();
    expect(html).not.toContain("Otros avisos activos en");
    // Y el bloque de contacto vuelve a su estado con llave.
    expect(html).toContain("Ver WhatsApp del dueño");
  });
});

/**
 * **La puerta de entrar, encima del aviso y no en su lugar** (15.8, F19/F20).
 * Sale del mismo `renderToStaticMarkup`: la abre la dirección, así que quien
 * tiene el script apagado la recibe entera. Y afirma el MEDIO —
 * `sign-in-door.test.ts` prueba la regla, esto prueba que la ficha la usa.
 */
describe("la puerta del WhatsApp no saca al inquilino de la ficha (15.8)", () => {
  const RUTA = `/alquiler/maracaibo/tierra-negra/${VENCIDO_SLUG}`;
  const TITULO_PUERTA = "Entrá para ver el WhatsApp de Publicante de ejemplo";

  beforeEach(() => {
    findForDetail.mockResolvedValue(detail({ status: "active", expiresAt: VIGENTE() }));
  });

  it("no aparece mientras la dirección no la abra", async () => {
    const html = await servedBody();

    expect(html).not.toContain(TITULO_PUERTA);
    expect(html).not.toContain("Seguir mirando sin entrar");
  });

  it("con el token abierto sale entera en el HTML, sin un solo script", async () => {
    const html = await servedBody(VENCIDO_SLUG, { entrar: "si" });

    expect(html).toContain(TITULO_PUERTA);
    expect(html).toContain("Pedimos la cuenta para frenar avisos falsos.");
    expect(html).toContain("Volvés a este mismo aviso al terminar.");
    // Fail closed: dibujar la puerta nunca destapa el número.
    expect(html).not.toContain(TELEFONO);
  });

  /** Lo que la 15.8 pide: el aviso sigue en la respuesta, debajo de la puerta. */
  it("deja el aviso completo detrás, no una pantalla en su lugar", async () => {
    const html = await servedBody(VENCIDO_SLUG, { entrar: "si" });

    expect(html).toContain(VENCIDO_TITLE);
    expect(html).toContain("$480");
  });

  /** Las dos salidas son anclas de verdad, y la vuelta de Google es a la ficha. */
  it("sale por esta misma ficha y vuelve a ella después de Google", async () => {
    const html = await servedBody(VENCIDO_SLUG, { entrar: "si" });

    expect(html).toContain(`href="${RUTA}"`);
    expect(html).toContain('aria-label="Cerrar sin entrar"');
    expect(html).toContain(`name="callbackUrl" value="${RUTA}"`);
  });
});
