import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StoredPublicationDraft } from "@/modules/listing-publication/domain/publication-steps";

/**
 * **La tabla es la única fuente del borrador, y el flujo no toca una cookie**
 * (tasks.md 18.30/18.33).
 *
 * Lo que se afirma acá es un negativo —«ninguna cookie se lee ni se escribe»— y
 * un negativo pasa igual de bien cuando la pantalla está rota. Por eso cada uno
 * viene **pareado con su positivo**: que la fila se dibuja, que el control sigue
 * dibujado, que la fila se guardó con lo tecleado. El frasco de cookies sigue
 * espiado a propósito aunque ya no lo llame nadie: es lo que pone en rojo el día
 * que alguien vuelva a abrir esa segunda fuente.
 *
 * **Se sirve la ruta y no el componente**, la convención de `riel-y-boton` y
 * `negativa-de-campo`: lo que se dibuja sale de `readPublicationContext`, y
 * `page.tsx` le pasa `draft.violations` —lo guardado del intento anterior, no algo
 * recalculado—, así que escribirle el borrador a mano al componente mediría una
 * pantalla que nadie sirve.
 */

const { redirect, notFound, load, save, discard, jar, publishListing } = vi.hoisted(() => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  }),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  load: vi.fn(),
  save: vi.fn(async () => undefined),
  discard: vi.fn(async () => undefined),
  jar: { get: vi.fn(), set: vi.fn(), delete: vi.fn() },
  publishListing: vi.fn(async () => ({ listingId: "avs_1" })),
}));

vi.mock("next/navigation", () => ({ redirect, notFound }));
vi.mock("next/headers", () => ({ cookies: async () => jar }));
vi.mock("@/shared/db/client", () => ({ db: {} }));
vi.mock("@/modules/listing-publication/infrastructure/drizzle-publication-draft-store", () => ({
  DrizzlePublicationDraftStore: class {
    load = load;
    save = save;
    discard = discard;
  },
}));
vi.mock("@/modules/listing-publication/infrastructure/drizzle-zone-vocabulary", () => ({
  DrizzleZoneVocabulary: class {
    lookup = async () => ({ cities: [], zones: [], aliases: [] });
  },
}));
vi.mock("@/modules/listing-publication/infrastructure/drizzle-listing-repository", () => ({
  DrizzleZoneCatalogue: class {
    listZonesForCity = async () => [];
  },
}));
vi.mock("@/modules/listing-publication/application/publish-listing", async () => {
  const real = await vi.importActual<
    typeof import("@/modules/listing-publication/application/publish-listing")
  >("@/modules/listing-publication/application/publish-listing");
  return { ...real, publishListing };
});
vi.mock("./fotos/publication", () => ({ publishListingDependencies: () => ({}) }));
vi.mock("./fotos/PhotoUploader", () => ({ PhotoUploader: () => null }));
vi.mock("../_lib/require-session", () => ({
  requireSession: async () => ({ userId: MARIA, email: "maria@ejemplo.com" }),
}));

import { publishFromReview, submitStep } from "./actions";
import StepPage from "./paso/[paso]/page";

const MARIA = "usr_maria";

/** El borrador entero y válido: cada prueba le cambia sólo lo que mide. */
function completo(title: string): StoredPublicationDraft {
  return {
    listing: {
      propertyType: "apartamento",
      priceUsd: 450,
      rooms: 2,
      bathrooms: 1,
      parkingSpots: 1,
      areaM2: 78,
      title,
      description: "d".repeat(140),
      publisherType: "owner",
      contactMethod: "whatsapp",
      contactValue: "04125550134",
    },
    photos: [{ key: `${MARIA}/a.webp`, name: "Sala", bytes: 10 }],
    violations: [],
  };
}

/** Ninguna de las tres, nunca: leer una cookie es media segunda fuente y
 *  escribirla es la otra media. */
function expectSinCookies(): void {
  expect(jar.get).not.toHaveBeenCalled();
  expect(jar.set).not.toHaveBeenCalled();
  expect(jar.delete).not.toHaveBeenCalled();
}

async function servirPasoTitulo(): Promise<string> {
  const page = await StepPage({
    params: Promise.resolve({ paso: "titulo" }),
    searchParams: Promise.resolve({}),
  });
  return renderToStaticMarkup(page);
}

beforeEach(() => {
  vi.clearAllMocks();
  jar.get.mockReturnValue(undefined);
  load.mockResolvedValue(null);
  save.mockResolvedValue(undefined);
  discard.mockResolvedValue(undefined);
});

describe("de dónde sale el borrador que se dibuja", () => {
  it("la fila es lo único que se lee, y es lo que se dibuja", async () => {
    load.mockResolvedValue(completo("El de la tabla"));

    const markup = await servirPasoTitulo();

    expect(markup).toContain("El de la tabla");
    // El par del negativo: el control sigue dibujado. Un `not.toHaveBeenCalled`
    // sobre una pantalla que dejó de renderizar pasa solo.
    expect(markup).toContain('name="title"');
    expect(load).toHaveBeenCalledWith(MARIA, expect.any(Date));
    expectSinCookies();
  });

  it("vencido a las 24 horas: se vuelve al paso 1, no a un paso 6 vacío", async () => {
    // **El modo de falla de un borrador vencido, medido.** `load` filtra por
    // `expires_at > $ahora`, así que pasadas las 24 horas es indistinguible de
    // no haber empezado — y la guarda del servidor manda al paso que falta en
    // vez de dibujar el paso 6 con los campos en blanco.
    await expect(servirPasoTitulo()).rejects.toThrow("NEXT_REDIRECT:/publicar/paso/tipo");

    // Y el par: adonde manda es una pantalla servible, no un rebote.
    const primerPaso = await StepPage({
      params: Promise.resolve({ paso: "tipo" }),
      searchParams: Promise.resolve({}),
    });
    expect(renderToStaticMarkup(primerPaso)).toContain('name="propertyType"');
  });
});

describe("escribir el borrador no deja una cookie detrás", () => {
  function formDelTitulo(): FormData {
    const form = new FormData();
    form.set("step", "titulo");
    form.set("title", "Apartamento en Altamira con vista");
    return form;
  }

  it("guardar un paso escribe la fila y ninguna cookie", async () => {
    load.mockResolvedValue(completo("El de la tabla"));

    await expect(submitStep(formDelTitulo())).rejects.toThrow(/NEXT_REDIRECT/);

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(
      MARIA,
      expect.objectContaining({
        listing: expect.objectContaining({ title: "Apartamento en Altamira con vista" }),
      }),
      expect.any(Date),
    );
    expectSinCookies();
  });

  it("publicar descarta la fila y tampoco toca ninguna cookie", async () => {
    load.mockResolvedValue(completo("El de la tabla"));

    await expect(publishFromReview()).rejects.toThrow(/NEXT_REDIRECT/);

    expect(discard).toHaveBeenCalledWith(MARIA);
    expectSinCookies();
  });
});
