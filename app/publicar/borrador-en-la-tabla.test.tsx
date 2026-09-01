import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StoredPublicationDraft } from "@/modules/listing-publication/domain/publication-steps";
import { DRAFT_COOKIE, DRAFT_COOKIE_PATH, DRAFT_TEXT_COOKIE } from "./draft";

/**
 * **El borrador se lee de la tabla, y las dos cookies no sobreviven a escribirla**
 * (tasks.md 18.30).
 *
 * Esto es lo que la rebanada tiene de peligroso dicho como aserción. El día del
 * despliegue hay dos fuentes vivas del mismo borrador —la fila nueva y la cookie
 * que quien está a mitad de publicar todavía trae—, y **el orden anterior era
 * cookie primero**: bastaba con no borrarla para que una cookie vieja ganara en
 * silencio sobre lo que la persona acaba de guardar. Las dos mitades se afirman
 * por separado, porque una tapa a la otra: que la fila gane se mide en los BYTES
 * SERVIDOS de la ruta, y que la cookie se muera se mide en la acción que escribe.
 *
 * **Se sirve la ruta y no el componente**, la convención de `riel-y-boton` y
 * `negativa-de-campo`: lo que se dibuja sale de `readPublicationContext`, que es
 * justamente la pieza que cambió de fuente. Escribirle el borrador a mano al
 * componente mediría una pantalla que nadie sirve.
 *
 * **Y el `path` del borrado es media prueba.** `delete(nombre)` a secas pone una
 * cookie vencida en `/` y deja viva la de `/publicar` — el modo de falla exacto
 * que este puente cierra, y el que tenía el `publishFromReview` anterior.
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

/** La cookie del despliegue anterior, codificada como la escribía. */
function cookieDe(draft: StoredPublicationDraft): void {
  const { description, ...listing } = draft.listing;
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value), "utf8").toString("base64url");

  jar.get.mockImplementation((name: string) =>
    name === DRAFT_COOKIE
      ? { value: encode({ listing, photos: draft.photos, violations: draft.violations }) }
      : { value: encode(description ?? "") },
  );
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
  it("la fila gana sobre la cookie, y la cookie ni se lee", async () => {
    load.mockResolvedValue(completo("El de la tabla"));
    cookieDe(completo("El de la cookie"));

    const markup = await servirPasoTitulo();

    expect(markup).toContain("El de la tabla");
    expect(markup).not.toContain("El de la cookie");
    // El par: el control sigue dibujado. Un `not.toContain` sobre un campo que
    // desapareció pasa solo.
    expect(markup).toContain('name="title"');
    expect(load).toHaveBeenCalledWith(MARIA, expect.any(Date));
  });

  it("sin fila, la cookie de la entrega anterior dibuja el formulario", async () => {
    // El puente, servido: quien estaba a mitad de publicar el día del despliegue
    // no encuentra el formulario vacío.
    cookieDe(completo("El de la cookie"));

    expect(await servirPasoTitulo()).toContain("El de la cookie");
  });

  it("vencido a las 24 horas: se vuelve al paso 1, no a un paso 6 vacío", async () => {
    // **El modo de falla de un borrador vencido, medido.** `load` filtra por
    // `expires_at > $ahora`, así que pasadas las 24 horas es indistinguible de
    // no haber empezado — y la guarda del servidor manda al paso que falta en
    // vez de dibujar el paso 6 con los campos en blanco. Es el MISMO modo de
    // falla que la cookie de treinta minutos tenía, 48 veces menos frecuente.
    await expect(servirPasoTitulo()).rejects.toThrow("NEXT_REDIRECT:/publicar/paso/tipo");

    // Y el par: adonde manda es una pantalla servible, no un rebote.
    const primerPaso = await StepPage({
      params: Promise.resolve({ paso: "tipo" }),
      searchParams: Promise.resolve({}),
    });
    expect(renderToStaticMarkup(primerPaso)).toContain('name="propertyType"');
  });
});

describe("las dos cookies no sobreviven a una escritura de la tabla", () => {
  function formDelTitulo(): FormData {
    const form = new FormData();
    form.set("step", "titulo");
    form.set("title", "Apartamento en Altamira con vista");
    return form;
  }

  it("guardar un paso escribe la fila y borra LAS DOS cookies, con su path", async () => {
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
    for (const name of [DRAFT_COOKIE, DRAFT_TEXT_COOKIE]) {
      expect(jar.delete).toHaveBeenCalledWith({ name, path: DRAFT_COOKIE_PATH });
    }
    // Y nada las vuelve a escribir: `serialiseStoredDraft` ya no existe, y una
    // cookie escrita después del borrado sería la segunda fuente de vuelta.
    expect(jar.set).not.toHaveBeenCalled();
  });

  it("si la tabla no aceptó la escritura, la cookie NO se borra", async () => {
    // Borrar antes de que la fila exista deja a quien publica sin ninguna de
    // las dos fuentes por una falla en la que no tuvo parte.
    load.mockResolvedValue(completo("El de la tabla"));
    save.mockRejectedValueOnce(new Error("la base dijo que no"));

    await expect(submitStep(formDelTitulo())).rejects.toThrow("la base dijo que no");
    expect(jar.delete).not.toHaveBeenCalled();
  });

  it("publicar descarta la fila y las dos cookies, para que el aviso no vuelva como borrador", async () => {
    load.mockResolvedValue(completo("El de la tabla"));

    await expect(publishFromReview()).rejects.toThrow(/NEXT_REDIRECT/);

    expect(discard).toHaveBeenCalledWith(MARIA);
    expect(jar.delete).toHaveBeenCalledTimes(2);
  });
});
