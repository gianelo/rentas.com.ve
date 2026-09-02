import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  currentStepId,
  draftListingOf,
} from "@/modules/listing-publication/domain/publication-steps";
import {
  type CuratedZone,
  validatePublishableListing,
} from "@/modules/listing-publication/domain/publishable-listing";
import type { PriceBucketTally } from "@/modules/listing-search/domain/price-histogram";
import type { StoredDraft } from "../../draft";

/**
 * **El histograma del paso 3, en los bytes que salen de la ruta** (18.9).
 *
 * Se renderiza la RUTA y no el componente: `page.tsx` decide si consulta, con
 * qué zona y qué precio le pasa a la frase, y un `PublishStep` con props
 * escritas a mano mediría una pantalla que nadie sirve — el defecto que la
 * rebanada A encontró con `draft.violations`. `renderToStaticMarkup` devuelve
 * la respuesta del servidor sin una línea de cliente: el paso 3 no es la
 * excepción del paso 8 (AGENTS.md §2).
 */

const { redirect, notFound, tallyForZone } = vi.hoisted(() => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  }),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  tallyForZone: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect, notFound }));
vi.mock("@/shared/db/client", () => ({ db: {} }));
vi.mock("@/modules/listing-search/infrastructure/drizzle-zone-price-tally", () => ({
  DrizzleZonePriceTally: class {
    tallyForZone = tallyForZone;
  },
}));
vi.mock("@/modules/listing-publication/infrastructure/drizzle-zone-vocabulary", () => ({
  DrizzleZoneVocabulary: class {
    lookup = async () => ({ cities: [], zones: [], aliases: [] });
  },
}));
vi.mock("../../../_lib/require-session", () => ({
  requireSession: async () => ({ userId: "publicador-1", email: "dueno@ejemplo.com" }),
}));
vi.mock("../../actions", () => ({ submitStep: vi.fn() }));
vi.mock("../../fotos/PhotoUploader", () => ({ PhotoUploader: () => null }));
vi.mock("../../publication-context", () => ({
  readPublicationContext: async () => contextoDe(borrador),
}));

import StepPage from "./page";

const ZONES: readonly CuratedZone[] = [{ id: "chacao", cityId: "dc" }];

/** La misma cuenta de la lámina: la mayoría cae en $380–$620. */
const CHACAO: readonly PriceBucketTally[] = [
  { count: 1, lowestUsd: 200, highestUsd: 200 },
  { count: 2, lowestUsd: 310, highestUsd: 340 },
  { count: 5, lowestUsd: 380, highestUsd: 450 },
  { count: 6, lowestUsd: 500, highestUsd: 620 },
  { count: 3, lowestUsd: 650, highestUsd: 700 },
  { count: 2, lowestUsd: 720, highestUsd: 800 },
  { count: 1, lowestUsd: 900, highestUsd: 1000 },
  { count: 0 },
];

/** Los dos primeros pasos contestados; el 3 es el paso abierto. */
function borradorHastaElDos(): StoredDraft {
  return {
    listing: { propertyType: "apartamento", cityId: "dc", zoneId: "chacao" },
    photos: [],
    violations: [],
  };
}

/** Las violaciones y el paso actual se calculan, nunca se escriben a mano. */
function contextoDe(draft: StoredDraft) {
  const violations = validatePublishableListing(draftListingOf(draft), ZONES);
  return {
    draft,
    violations,
    currentStep: currentStepId(draft, violations),
    ...(draft.listing.zoneId ? { zoneName: "Chacao" } : {}),
  };
}

let borrador: StoredDraft = borradorHastaElDos();

beforeEach(() => {
  borrador = borradorHastaElDos();
  redirect.mockClear();
  tallyForZone.mockReset();
  tallyForZone.mockResolvedValue(CHACAO);
});

async function servido(): Promise<string> {
  return renderToStaticMarkup(
    await StepPage({
      params: Promise.resolve({ paso: "precio" }),
      searchParams: Promise.resolve({}),
    }),
  );
}

/** Sólo el bloque del histograma: el riel de al lado también tiene renglones. */
function bloque(html: string): string {
  const desde = html.indexOf("<figure");
  expect(desde).toBeGreaterThan(-1);
  return html.slice(desde, html.indexOf("</figure>", desde));
}

describe("el paso 3 sirve el histograma sin una línea de JavaScript (18.9)", () => {
  it("dibuja las ocho barras servidas, con el eje y la frase", async () => {
    const html = await servido();
    const dibujo = bloque(html);

    expect(dibujo.match(/data-band=/g)).toHaveLength(8);
    // **Las dos marcadas son las que la frase dice**, y por eso se afirma el
    // valor y no sólo que el atributo esté: marcarlas todas dejaba el dibujo
    // contradiciendo su propio `aria-label` sin que nada se pusiera rojo.
    expect(dibujo.match(/data-band="typical"/g)).toHaveLength(2);
    expect(dibujo.match(/data-band="rest"/g)).toHaveLength(6);
    expect(dibujo).toContain("Precios en Chacao");
    expect(dibujo).toContain("$200");
    expect(dibujo).toContain("$1000");
    expect(dibujo).toContain("La mayoría pide entre $380 y $620.");
    // Y el campo sigue entero debajo: el dibujo lo acompaña, no lo reemplaza.
    expect(html).toContain('name="priceUsd"');
  });

  it("no trae ni script ni lienzo: es marcado del servidor", async () => {
    const dibujo = bloque(await servido());

    expect(dibujo).not.toContain("<script");
    expect(dibujo).not.toContain("<canvas");
  });

  it("la fila de barras se anuncia como una imagen con el dibujo en palabras", async () => {
    const dibujo = bloque(await servido());

    expect(dibujo).toContain('role="img"');
    expect(dibujo).toContain("2 marcan la franja donde se concentra la oferta");
  });

  it("le pide los cubos a la zona del paso 2, no a la ciudad entera", async () => {
    await servido();

    expect(tallyForZone).toHaveBeenCalledWith("dc", "chacao");
  });

  it("sin precio escrito la frase no juzga nada, y con uno sí", async () => {
    expect(bloque(await servido())).not.toContain("Tu precio");

    borrador = { ...borrador, listing: { ...borrador.listing, priceUsd: 450 } };
    const conPrecio = bloque(await servido());
    expect(conPrecio).toContain("Tu precio está en el medio.");
    // El dibujo no se angosta con el precio: el histograma ignora ese filtro.
    expect(conPrecio.match(/data-band=/g)).toHaveLength(8);
  });

  it("con lo tecleado que el validador rechazó calla la posición y sigue dibujando", async () => {
    borrador = {
      ...borrador,
      listing: { ...borrador.listing, priceUsd: 450 },
      raw: { priceUsd: "cuatrocientos" },
    };
    const dibujo = bloque(await servido());

    expect(dibujo).not.toContain("Tu precio");
    expect(dibujo.match(/data-band=/g)).toHaveLength(8);
  });

  it("por debajo del piso de doce no dibuja barras y devuelve la decisión", async () => {
    tallyForZone.mockResolvedValue([{ count: 3, lowestUsd: 400, highestUsd: 600 }]);
    const html = await servido();

    expect(html).toContain("Con 3 avisos en Chacao no alcanza");
    expect(html).not.toContain("data-band=");
    // El formulario sigue entero: no se dibuja, pero se publica igual.
    expect(html).toContain('name="priceUsd"');
  });
});

describe("el paso 3 no se dibuja sin zona, y lo garantiza el dominio (18.9)", () => {
  it("aterrizar en precio sin el paso 2 contestado devuelve al paso que falta", async () => {
    borrador = { listing: { propertyType: "apartamento" }, photos: [], violations: [] };

    await expect(servido()).rejects.toThrow("NEXT_REDIRECT:/publicar/paso/zona");
    // La consulta no llega a salir: no hay «acá» del que contar precios.
    expect(tallyForZone).not.toHaveBeenCalled();
  });
});
