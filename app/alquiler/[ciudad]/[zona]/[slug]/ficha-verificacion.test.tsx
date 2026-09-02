import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **«Desde cuándo está verificado», en los bytes que salen de la ruta**
 * (tasks.md 16.12 y 16.34, lámina 10b de las dos Fichas).
 *
 * Esta prueba existe por un defecto que este repositorio ya cometió y pagó:
 * `resultsOrigin` estaba en un dominio al 100 % de cobertura, exportado,
 * leído por la ficha —y **ninguna de las dos páginas de resultados se lo
 * pasaba nunca**. Un módulo probado y muerto en producción. Acá el riesgo era
 * idéntico y estaba escrito con todas las letras: la ficha pasaba
 * `verifiedAt={null}` a mano.
 *
 * Por eso la afirmación no es sobre `viewListingContact` ni sobre
 * `ContactBlock`, que ya tienen la suya: es sobre `renderToStaticMarkup` de la
 * RUTA, que devuelve la respuesta servida sin ejecutar una línea de cliente.
 */

const { findEvidence, findForDetail, findRevealable, notFound, permanentRedirect, redirect } =
  vi.hoisted(() => ({
    findEvidence: vi.fn(),
    findForDetail: vi.fn(),
    findRevealable: vi.fn(),
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

const INQUILINO = { userId: "inquilino-1", email: "inquilino@ejemplo.com", name: "Ana" };

vi.mock("next/navigation", () => ({ notFound, permanentRedirect, redirect }));
vi.mock("@/shared/db/client", () => ({ db: {} }));
// Con sesión Y con revelación hecha: es el único estado en el que la línea de
// verificación se dibuja, y el que la prueba de `ficha-servida` no cubre
// porque ahí el visitante es anónimo a propósito.
vi.mock("../../../../_lib/session", () => ({
  readSession: async () => INQUILINO,
  requestSessionPort: { getSession: async () => INQUILINO },
}));
vi.mock("@/modules/contact-reveal/infrastructure/drizzle-contact-reveal", () => ({
  DrizzleContactRevealEvents: class {
    findLatestMessage = async () => null;
  },
  DrizzleContactRevealMetrics: class {
    findUniquePairs = async () => [{ tenantUserId: INQUILINO.userId, listingId: LISTING_ID }];
  },
  DrizzleRevealableListing: class {
    findRevealable = findRevealable;
  },
}));
vi.mock("@/modules/identity/infrastructure/drizzle-verified-contact", () => ({
  DrizzleContactVerificationEvidence: class {
    findEvidence = findEvidence;
  },
}));
vi.mock("@/modules/listing-discovery/infrastructure/drizzle-listing-detail", () => ({
  DrizzleListingDetail: class {
    findForDetail = findForDetail;
  },
}));
vi.mock("@/modules/listing-discovery/infrastructure/drizzle-listing-photos", () => ({
  DrizzleListingPhotos: class {
    coversFor = async () => new Map();
    allFor = async () => [];
  },
}));
vi.mock("@/modules/listing-search/infrastructure/drizzle-listing-search", () => ({
  DrizzleListingSearch: class {
    search = async () => [];
  },
}));
vi.mock("@/modules/listing-catalogue/infrastructure/drizzle-catalogue", () => ({
  DrizzleCatalogue: class {
    listCities = async () => [];
    listZones = async () => [];
  },
}));
vi.mock("./reveal-actions", () => ({
  revealListingContact: vi.fn(),
  continueWithGoogle: vi.fn(),
}));

import FichaPage from "./page";

const LISTING_ID = "9c1d5f70-3a44-4e2b-8f61-2b7c0d9e5a11";
const SLUG = `apartamento-2-habitaciones-en-tierra-negra-${LISTING_ID}`;
const PUBLICANTE = "publicante-42";
const TELEFONO = "+58 412 555 0134";

/**
 * **Relativo al reloj de la corrida.** Una fecha de vencimiento escrita a mano
 * es una prueba con fecha de caducidad: el día que el calendario la alcanza,
 * el aviso pasa a vencido y esta prueba cambia de sujeto sin que nadie la
 * toque — y el estado vencido no dibuja contacto en absoluto.
 */
const HORA = 60 * 60 * 1000;

/**
 * El instante de la verificación sí es fijo, y puede serlo: es del pasado y
 * lo seguirá siendo. Lo que se afirma es el DÍA que se escribe, no una
 * distancia contra el reloj.
 */
const VERIFICADO_EL_19 = new Date("2026-08-19T12:00:00.000Z");

function detail() {
  return {
    id: LISTING_ID,
    cityId: "ciudad-mcbo",
    cityName: "Maracaibo",
    zoneId: "zona-tierra-negra",
    zoneName: "Tierra Negra",
    zoneParentName: null,
    zoneCategory: null,
    title: "Apartamento 2 habitaciones en Tierra Negra",
    description:
      "Planta eléctrica propia y tanque de agua. Dos habitaciones con aire acondicionado.",
    propertyType: "apartamento" as const,
    publisherType: "owner" as const,
    publisherName: "María F.",
    priceUsd: 380,
    rooms: 2,
    bathrooms: 2,
    areaM2: 68,
    parkingSpots: 1,
    hasPowerPlant: true,
    hasRegularWater: true,
    isFurnished: false,
    hasSecurity: false,
    hasAppliances: false,
    contactMethod: "whatsapp" as const,
    status: "active" as const,
    publishedAt: new Date(Date.now() - HORA),
    expiresAt: new Date(Date.now() + HORA),
  };
}

async function servida() {
  return renderToStaticMarkup(
    await FichaPage({
      params: Promise.resolve({ ciudad: "maracaibo", zona: "tierra-negra", slug: SLUG }),
      searchParams: Promise.resolve({}),
    }),
  );
}

beforeEach(() => {
  process.env.R2_BUCKET_PUBLIC_URL = "https://fotos.rentas.test";
  process.env.SITE_URL = "https://rentas.test";
  vi.clearAllMocks();
  findForDetail.mockResolvedValue(detail());
  findRevealable.mockResolvedValue({
    listingId: LISTING_ID,
    publisherId: PUBLICANTE,
    cityId: "ciudad-mcbo",
    contactMethod: "whatsapp",
    contactValue: TELEFONO,
  });
  findEvidence.mockResolvedValue(null);
});

describe("la ficha servida y la verificación del contacto", () => {
  /**
   * **La 16.12, entera y en la respuesta.** El instante que la F29 pide
   * («desde cuándo está verificado») sale de `verified_contact.verified_at`, y
   * lo que se afirma acá es que llega hasta los bytes — no que exista una
   * función capaz de escribirlo.
   */
  it("dice desde cuándo está verificado cuando el triple tiene fila", async () => {
    findEvidence.mockResolvedValue({
      verifiedAt: VERIFICADO_EL_19,
      accountEmail: "maria@ejemplo.com",
      accountEmailVerifiedAt: null,
    });

    const markup = await servida();

    expect(markup).toContain("verificado por WhatsApp el 19 ago.");
  });

  /**
   * **`null` significa no verificado, y no hay NADA que dibujar** (tasks.md
   * 19.9, AGENTS.md §7). Ni «sin verificar», ni una insignia vacía: las tres
   * láminas del bloque de contacto no dibujan ningún estado negativo, así que
   * cualquier cosa dibujada acá sería una pantalla inventada.
   */
  it("no dice absolutamente nada de la verificación cuando no hay fila", async () => {
    findEvidence.mockResolvedValue({
      verifiedAt: null,
      accountEmail: "maria@ejemplo.com",
      accountEmailVerifiedAt: new Date("2026-08-01T12:00:00.000Z"),
    });

    const markup = await servida();

    // El contacto SÍ está revelado — si no, esta prueba pasaría por el motivo
    // equivocado y no vería nunca la línea que dice vigilar.
    expect(markup).toContain(TELEFONO);
    expect(markup).not.toContain("erificado");
    expect(markup).not.toContain('data-testid="contact-verification"');
  });

  /**
   * **La consulta va por el triple del AVISO** (tasks.md 19.9): la cuenta que
   * publica, el método que el aviso copió y el valor que copió. Con la cuenta
   * de quien mira, la ficha diría que el teléfono del dueño está verificado
   * porque el inquilino verificó el suyo.
   */
  it("pregunta por la cuenta que publica y por el contacto que el aviso copió", async () => {
    await servida();

    expect(findEvidence).toHaveBeenCalledWith({
      userId: PUBLICANTE,
      contact: { method: "whatsapp", value: TELEFONO },
    });
  });

  /**
   * **La 19.12, en los bytes: los dos relojes se cruzan y el aviso no se
   * invalida.** Un aviso vive 30 días y puede publicarse el último día de una
   * verificación, así que a mitad de vuelo la verificación caduca mientras el
   * aviso sigue vivo. Lo que la tarea afirma es que no hay nada que arreglar
   * porque la ficha dice CUÁNDO y nunca «vigente» — y hasta hoy eso no lo
   * medía nadie: las otras pruebas de este archivo y las del dominio fijan un
   * instante reciente, así que una caducidad metida en el camino de dibujo
   * las dejaría a todas en verde.
   *
   * **Corrección al párrafo que este comentario tenía (AGENTS.md §5).** Decía
   * que después de la 19.11 esta misma fila iba a volver como `null`, porque
   * los doce meses iban a ser un `WHERE` del puerto. No fue así, y por esta
   * prueba: el puerto lo comparten publicar y la ficha, así que ese `WHERE`
   * habría hecho fallar justo lo que acá se afirma. La ventana vive en
   * `decideContactVerification`, que la ficha no llama, y **la primera forma
   * es la que llega hoy y va a seguir llegando**. La segunda se conserva
   * porque sigue siendo cierta como respuesta —una cuenta sin fila— y porque
   * mide lo mismo por el otro lado: en las dos el aviso sigue activo y su
   * contacto revelado.
   */
  it("la verificación caducada a mitad de vuelo no invalida el aviso ni afirma vigencia", async () => {
    findEvidence.mockResolvedValue({
      verifiedAt: new Date("2023-08-19T12:00:00.000Z"),
      accountEmail: "maria@ejemplo.com",
      accountEmailVerifiedAt: null,
    });

    const conFilaVieja = await servida();

    // Positiva: el contacto sigue revelado y la frase sigue diciendo el día.
    expect(conFilaVieja).toContain(TELEFONO);
    expect(conFilaVieja).toContain("verificado por WhatsApp el 19 ago.");
    // Y no se convierte en el aviso vencido, que es el único estado en el que
    // esta ficha deja de mostrar contacto.
    expect(conFilaVieja).not.toContain("Aviso vencido");
    // La ficha no AFIRMA vigencia por ninguna de las dos vías: ni un adjetivo
    // de estado, ni una caducidad dibujada.
    expect(conFilaVieja).not.toContain("vigente");
    expect(conFilaVieja).not.toContain("vencida");

    // La forma que la 19.11 va a hacer llegar para esa misma fila caducada.
    findEvidence.mockResolvedValue({
      verifiedAt: null,
      accountEmail: "maria@ejemplo.com",
      accountEmailVerifiedAt: null,
    });

    const yaFiltrada = await servida();

    expect(yaFiltrada).toContain(TELEFONO);
    expect(yaFiltrada).not.toContain("Aviso vencido");
    expect(yaFiltrada).not.toContain("erificado");
  });
});
