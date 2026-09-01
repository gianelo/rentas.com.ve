import { describe, expect, it } from "vitest";
import type { StoredPublicationDraft } from "./publication-steps";
import { MAX_PHOTOS_PER_LISTING } from "./publishable-listing";
import { MAX_RAW_LENGTH, normaliseStoredDraft } from "./stored-draft";

/**
 * La lista blanca del borrador guardado (tasks.md 18.30).
 *
 * Vivía en `app/publicar/draft.ts` porque la cookie era el único lugar donde un
 * borrador se guardaba. Hoy la única fuente es `publish_draft`, y la regla sigue
 * viva por la razón que nunca fue de la cookie: **una fila escrita por el
 * formulario de ayer vuelve con la forma de ayer** —un campo renombrado, un
 * número que se volvió texto, una foto a medias—, y el tipo del puerto promete
 * una forma que la columna no garantiza.
 */

const completo: StoredPublicationDraft = {
  listing: {
    propertyType: "apartamento",
    cityId: "dc",
    zoneId: "altamira",
    priceUsd: 450,
    rooms: 2,
    bathrooms: 2,
    parkingSpots: 1,
    areaM2: 78,
    hasPowerPlant: true,
    hasRegularWater: true,
    isFurnished: false,
    hasSecurity: true,
    hasAppliances: false,
    title: "Apartamento 2 habitaciones con puesto",
    description: "x".repeat(140),
    publisherType: "owner",
    contactMethod: "whatsapp",
    contactValue: "04125550134",
    reference: "Al lado de la panaderia",
  },
  photos: [{ key: "publisher/a.webp", name: "Sala", bytes: 168_000 }],
  featuresDeclared: true,
  violations: ["description.tooShort"],
  raw: { priceUsd: "quinientos" },
};

describe("normaliseStoredDraft", () => {
  it.each([
    ["nada", undefined],
    ["null", null],
    ["un número", 42],
    ["texto", "no soy un borrador"],
    // Un `jsonb` puede ser un arreglo, y `typeof [] === "object"`. Sin este
    // caso, una fila así saldría de acá como un borrador vacío en vez de como
    // una fila que nadie sabe leer.
    ["un arreglo", []],
  ])("devuelve null para %s: no es un borrador de esta aplicación", (_caso, valor) => {
    expect(normaliseStoredDraft(valor)).toBeNull();
  });

  it("lo contestado vuelve entero, con la descripción adentro del aviso", () => {
    // La descripción viaja con el resto del aviso: la columna es `jsonb` y no
    // tiene el techo de ~4 KB que obligaba a partirla en dos.
    expect(normaliseStoredDraft(structuredClone(completo))).toEqual(completo);
  });

  it("un campo que el formulario no postea no entra, venga de donde venga", () => {
    // La aserción que más pesa: el id del publicador sale de la sesión y de
    // ningún otro lado. Es lo que hace que comprobar de quién son las fotos
    // signifique algo.
    const parsed = normaliseStoredDraft({
      listing: { title: "Real", publisherId: "usr_otra_persona", status: "active" },
      photos: [],
    });

    expect(parsed?.listing).toEqual({ title: "Real" });
    expect(parsed?.listing).not.toHaveProperty("publisherId");
  });

  it("un valor con el tipo cambiado se descarta y el resto del borrador sobrevive", () => {
    // **La fila de ayer, dicha como prueba.** Un precio guardado como texto
    // pasaría el validador como `NaN` y acabaría en una columna `integer`. Se
    // descarta ese campo, no el borrador entero: quien vuelve pierde un paso,
    // no los nueve.
    const parsed = normaliseStoredDraft({
      listing: { title: "Real", rooms: 2, priceUsd: "450", hasSecurity: "si" },
      photos: [],
    });

    expect(parsed?.listing).toEqual({ title: "Real", rooms: 2 });
  });

  it("una foto a medias no es una foto, y nunca entran más de las que un aviso admite", () => {
    const demasiadas = Array.from({ length: 50 }, (_, i) => ({
      key: `k${i}`,
      name: "x",
      bytes: 1,
    }));

    expect(
      normaliseStoredDraft({
        listing: {},
        photos: [{ key: "a", name: "A", bytes: 10 }, { key: "b" }, { name: "C", bytes: 1 }],
      })?.photos,
    ).toEqual([{ key: "a", name: "A", bytes: 10 }]);
    expect(normaliseStoredDraft({ listing: {}, photos: demasiadas })?.photos).toHaveLength(
      MAX_PHOTOS_PER_LISTING,
    );
  });

  it("una lista de violaciones ausente o mal formada vuelve vacía", () => {
    expect(normaliseStoredDraft({ listing: {}, photos: [] })?.violations).toEqual([]);
    expect(
      normaliseStoredDraft({ listing: {}, photos: [], violations: "nope" })?.violations,
    ).toEqual([]);
    expect(
      normaliseStoredDraft({ listing: {}, photos: [], violations: [1, "title.required"] })
        ?.violations,
    ).toEqual(["title.required"]);
  });

  it("lo tecleado que vuelve se recorta, y sólo por los campos que lo pierden al parsear", () => {
    const largo = "z".repeat(MAX_RAW_LENGTH + 50);
    const parsed = normaliseStoredDraft({
      listing: {},
      photos: [],
      raw: { priceUsd: largo, otro: "x" },
    });

    expect(parsed?.raw?.priceUsd).toHaveLength(MAX_RAW_LENGTH);
    // `raw` también se vuelca en controles, así que la lista blanca vale igual.
    expect(parsed?.raw).not.toHaveProperty("otro");
    // Ausente vuelve AUSENTE y no como un objeto vacío: `{}` haría que la
    // pantalla creyera que hay un eco del último intento cuando no lo hay.
    expect(Object.hasOwn(normaliseStoredDraft({ listing: {}, photos: [] }) as object, "raw")).toBe(
      false,
    );
  });

  it("un atributo en false no es un atributo sin declarar, y la marca no se inventa", () => {
    const parsed = normaliseStoredDraft({
      listing: { isFurnished: false },
      photos: [],
      featuresDeclared: "si",
    });

    expect(parsed?.listing.isFurnished).toBe(false);
    expect(parsed?.listing.hasSecurity).toBeUndefined();
    expect(parsed?.featuresDeclared).toBeUndefined();
  });

  it("la descripción vacía se descarta, porque es lo mismo que no haberla escrito", () => {
    // Arrastrar `""` haría que un borrador recién empezado no volviera igual
    // que como salió, y el validador ya trata las dos cosas igual.
    expect(normaliseStoredDraft({ listing: { description: "" }, photos: [] })?.listing).toEqual({});
  });
});
