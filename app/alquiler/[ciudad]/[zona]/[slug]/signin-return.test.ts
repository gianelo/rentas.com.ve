import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CatalogueZone } from "@/modules/listing-catalogue/domain/catalogue";

/**
 * **La F19 en una aserción, y desde la 15.10 se puede afirmar sobre
 * comportamiento** (tasks.md 22.17).
 *
 * La ficha emitía `/signin?volver=…` mientras `app/(auth)/signin/page.tsx`
 * sólo leía `callbackUrl`. El parámetro se ignoraba en silencio: la pantalla
 * de entrar se dibujaba igual, quien entraba con Google aterrizaba en `/`, y
 * nada fallaba en ningún lado.
 *
 * **Antes** esta prueba leía el texto de los dos archivos y comparaba
 * subcadenas — quedaba verde con el parámetro adentro de un comentario o con
 * el `href` en una rama muerta, y su propio comentario explicaba por qué:
 * lo que falló fue una relación entre dos archivos, no un render. Esa razón
 * ya no aplica: desde la 15.10 el destino lo juzga `safeSignInReturn`, así
 * que la relación se comprueba renderizando las dos pantallas de verdad y
 * pasando el `href` que UNA sirve como entrada de la OTRA — sin adivinar el
 * nombre del parámetro en ningún lado. Si cualquiera de las dos puntas
 * renombra su lado del contrato, la pantalla de entrar deja de reconocer el
 * destino y esta prueba se pone roja por comportamiento, no por texto.
 */

const {
  search,
  listZones,
  findForDetail,
  coversFor,
  allFor,
  findVerifiedAt,
  notFound,
  permanentRedirect,
} = vi.hoisted(() => ({
  search: vi.fn(async () => []),
  listZones: vi.fn(async (): Promise<readonly unknown[]> => []),
  findForDetail: vi.fn(),
  coversFor: vi.fn(async () => new Map()),
  allFor: vi.fn(async () => []),
  findVerifiedAt: vi.fn(async (): Promise<Date | null> => null),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  permanentRedirect: vi.fn((to: string) => {
    throw new Error(`NEXT_PERMANENT_REDIRECT:${to}`);
  }),
}));

vi.mock("next/navigation", () => ({ notFound, permanentRedirect }));
vi.mock("@/shared/db/client", () => ({ db: {} }));
// Anónimo: es la condición para que la barra dibuje "Entrar" en vez del menú
// de cuenta (Nav.tsx), que es el enlace que esta prueba sigue.
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
vi.mock("@/modules/identity/infrastructure/drizzle-verified-contact", () => ({
  DrizzleContactVerificationEvidence: class {
    findEvidence = async () => null;
  },
  DrizzleListingContactVerification: class {
    findVerifiedAt = findVerifiedAt;
  },
}));
vi.mock("./reveal-actions", () => ({
  revealListingContact: vi.fn(),
  continueWithGoogle: vi.fn(),
}));
vi.mock("../../../../(auth)/signin/actions", () => ({
  requestMagicLink: vi.fn(),
}));
// La pantalla de entrar también se renderiza acá (la otra punta de la F19).
// Sólo `auth.ts` arrastra Auth.js de verdad; `signIn` no se ejecuta al
// renderizar, sólo al enviar el formulario.
vi.mock("@/modules/identity/infrastructure/auth", () => ({
  signIn: vi.fn(async () => undefined),
}));

const { default: FichaPage } = await import("./page");
const { default: SignInPage } = await import("../../../../(auth)/signin/page");

const CIUDAD = { id: "ciudad-mcbo", name: "Maracaibo" };
const ZONA = { id: "zona-tierra-negra", name: "Tierra Negra", cityId: CIUDAD.id };
const ZONES: readonly CatalogueZone[] = [
  { ...ZONA, kind: "elemento" as const, category: null, parentName: null },
];

const AVISO_ID = "3f2a91cb-04d7-b8e0-1a55-9c7e2d4f6b03";
const AVISO_SLUG = `apartamento-en-tierra-negra-${AVISO_ID}`;
const RUTA_FICHA = `/alquiler/maracaibo/tierra-negra/${AVISO_SLUG}`;

function detalleActivo() {
  return {
    id: AVISO_ID,
    cityId: CIUDAD.id,
    cityName: CIUDAD.name,
    zoneId: ZONA.id,
    zoneName: ZONA.name,
    zoneParentName: null,
    zoneCategory: null,
    title: "Apartamento en Tierra Negra",
    description: "Dos habitaciones, un baño, sin planta eléctrica.",
    propertyType: "apartamento" as const,
    publisherType: "owner" as const,
    publisherName: "Publicante de ejemplo",
    priceUsd: 380,
    rooms: 2,
    bathrooms: 1,
    areaM2: 68,
    parkingSpots: 1,
    hasPowerPlant: false,
    hasRegularWater: true,
    isFurnished: false,
    hasSecurity: false,
    hasAppliances: false,
    contactMethod: "whatsapp" as const,
    contactValue: "+58 412 0000000",
    status: "active" as const,
    publishedAt: new Date(Date.now() - 60 * 60 * 1000),
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  };
}

beforeEach(() => {
  process.env.R2_BUCKET_PUBLIC_URL = "https://fotos.rentoru.test";
  process.env.SITE_URL = "https://rentoru.test";
  vi.clearAllMocks();
  findForDetail.mockResolvedValue(detalleActivo());
  allFor.mockResolvedValue([]);
  coversFor.mockResolvedValue(new Map());
  listZones.mockResolvedValue(ZONES);
  search.mockResolvedValue([]);
});

/** El cuerpo servido de la ficha, sin ejecutar un solo script. */
async function fichaServida(): Promise<string> {
  return renderToStaticMarkup(
    await FichaPage({
      params: Promise.resolve({ ciudad: "maracaibo", zona: "tierra-negra", slug: AVISO_SLUG }),
      searchParams: Promise.resolve({}),
    }),
  );
}

/** El `href` que la barra sirve para "Entrar", tal como salió del render. */
function entrarHref(html: string): string {
  const match = /<a[^>]*href="([^"]*)"[^>]*>Entrar<\/a>/.exec(html);
  if (!match?.[1]) throw new Error("la ficha no dibujó el enlace para entrar (¿hay sesión?)");
  return match[1];
}

/**
 * Traduce el `href` servido a los mismos `searchParams` que Next le pasaría a
 * la pantalla de entrar en producción — sin asumir cuál es el nombre del
 * parámetro: se pasan TODOS los que la ficha haya puesto en la URL.
 */
function searchParamsDe(href: string): Record<string, string> {
  const query = href.split("?")[1] ?? "";
  return Object.fromEntries(new URLSearchParams(query));
}

describe("la vuelta a la ficha después de entrar (F19)", () => {
  it("la pantalla de entrar reconoce el destino y promete volver al mismo aviso", async () => {
    const href = entrarHref(await fichaServida());

    const entrarHtml = renderToStaticMarkup(
      await SignInPage({ searchParams: Promise.resolve(searchParamsDe(href)) }),
    );

    // Si la ficha y la pantalla de entrar dejan de compartir el nombre del
    // parámetro, `searchParamsDe` no trae la clave que ésta lee y estas dos
    // afirmaciones caen: la pantalla no reconoce ningún destino y sirve la
    // puerta de cuenta genérica en vez de la de este aviso.
    expect(entrarHtml).toContain("Entrá y volvés a este aviso");
    expect(entrarHtml).toContain("Volvés a este mismo aviso al terminar.");
    // Y la salida visible («×» / «← Volver al aviso») apunta a ESTA ficha, no
    // a la raíz del sitio.
    expect(entrarHtml).toContain(`href="${RUTA_FICHA}"`);
  });

  it("el destino sale codificado en la URL, porque la ruta de la ficha lleva barras", async () => {
    const href = entrarHref(await fichaServida());
    const cruda = href.split("?")[1] ?? "";

    // Sin codificar, las barras de la ruta se leerían como parte de la
    // dirección de entrar y no como el valor de un solo parámetro. `%2F` en
    // los bytes servidos es la prueba de que sí se escaparon.
    expect(cruda).toContain("%2Falquiler%2Fmaracaibo%2Ftierra-negra%2F");
    // Y decodifica exactamente a la ficha de origen, sin perder ni agregar
    // ningún segmento por el camino.
    expect(searchParamsDe(href).callbackUrl).toBe(RUTA_FICHA);
  });
});
