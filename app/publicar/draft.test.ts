import { describe, expect, it } from "vitest";
import type { PublicationDraft } from "../../src/modules/listing-publication/domain/publication-steps";
import {
  MAX_DESCRIPTION_CHARACTERS,
  MAX_TITLE_CHARACTERS,
} from "../../src/modules/listing-publication/domain/publishable-listing";
import {
  DRAFT_TTL_SECONDS,
  emptyDraft,
  MAX_RAW_LENGTH,
  parseStoredDraft,
  type StoredDraft,
  serialiseStoredDraft,
} from "./draft";

/**
 * El borrador que atraviesa los nueve pasos.
 *
 * La aseveracion que mas pesa es la del `publisherId`: lo que sale de aca se
 * vuelca en el formulario y en el pedido de publicacion, asi que todo lo que
 * esta funcion este dispuesta a cargar es algo que una cookie puede inyectar.
 * Una lista blanca es lo que deja al id del publicador **inalcanzable** en vez
 * de meramente improbable — su unica fuente es la sesion, y eso es lo que hace
 * que la verificacion de propiedad de las fotos signifique algo.
 */

const encode = (json: string) => Buffer.from(json, "utf8").toString("base64url");

const stored: StoredDraft = {
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
  },
  photos: [{ key: "publisher/a.webp", name: "Sala", bytes: 168_000 }],
  featuresDeclared: true,
  reference: "Al lado de la panaderia",
  violations: ["description.tooShort"],
  raw: { priceUsd: "quinientos" },
};

function roundTrip(draft: StoredDraft): StoredDraft | null {
  const { draft: rawDraft, text } = serialiseStoredDraft(draft);
  return parseStoredDraft(rawDraft, text);
}

describe("vencimiento", () => {
  it("dura 30 minutos, no 10", () => {
    // Nueve pasos mas el estado de las fotos no caben en diez minutos: elegir
    // fotos de la galeria en un telefono lento se come varios. Es el minimo
    // que la seccion 5 acepta cuando el borrador no vive del lado del
    // servidor.
    expect(DRAFT_TTL_SECONDS).toBe(30 * 60);
  });
});

describe("ida y vuelta", () => {
  it("conserva los nueve pasos tal cual", () => {
    expect(roundTrip(stored)).toEqual(stored);
  });

  it("conserva un borrador recien empezado", () => {
    expect(roundTrip(emptyDraft())).toEqual(emptyDraft());
  });

  it("distingue un atributo en false de uno sin declarar", () => {
    // "No lo declaro" y "no lo tiene" son la misma fila en la base y dos
    // frases distintas en la pantalla. Si el borrador los confundiera, el
    // paso 5 perderia su salida explicita en el primer redirect.
    const sinDeclarar: StoredDraft = {
      ...stored,
      listing: { ...stored.listing, isFurnished: false, hasSecurity: undefined },
      featuresDeclared: undefined,
    };
    const parsed = roundTrip(sinDeclarar);

    expect(parsed?.listing.isFurnished).toBe(false);
    expect(parsed?.listing.hasSecurity).toBeUndefined();
    expect(parsed?.featuresDeclared).toBeUndefined();
  });

  it("la descripcion viaja en su propia cookie", () => {
    // Es lo unico grande del borrador: 1.200 caracteres acentuados solos ya
    // rozan el techo de ~4 KB de una cookie. Separarla es lo que deja que el
    // resto crezca -- fotos, referencia, atributos -- sin que un dia el
    // pedido llegue sin cookie y el formulario se vacie sin explicacion.
    const { draft: rawDraft, text } = serialiseStoredDraft(stored);

    expect(Buffer.from(text, "base64url").toString("utf8")).toContain("x".repeat(140));
    expect(Buffer.from(rawDraft, "base64url").toString("utf8")).not.toContain("x".repeat(140));
  });
});

describe("lo que se rechaza", () => {
  it.each([
    ["nada", undefined],
    ["una cadena vacia", ""],
    ["texto que no decodifica a nada util", "no-soy-json"],
    ["algo que no es un objeto", Buffer.from("42").toString("base64url")],
  ])("devuelve null para %s en vez de reventar", (_caso, raw) => {
    // Una cookie truncada o editada a mano deja un formulario vacio, que se
    // puede recuperar. Un error deja un 500, que no.
    expect(parseStoredDraft(raw, undefined)).toBeNull();
  });

  it("nunca carga el id del publicador, ni ningun campo que el formulario no postea", () => {
    const inyectado = encode(
      JSON.stringify({
        listing: { title: "Real", publisherId: "usr_otra_persona", status: "active" },
        photos: [],
      }),
    );

    const parsed = parseStoredDraft(inyectado, undefined);

    expect(parsed?.listing).toEqual({ title: "Real" });
    expect(parsed?.listing).not.toHaveProperty("publisherId");
    expect(parsed?.listing).not.toHaveProperty("status");
  });

  it("descarta un valor cuyo tipo no es el que el campo lleva", () => {
    // Un precio que llega como texto pasaria por el validador como NaN y
    // acabaria en una columna `integer`. Se descarta antes.
    const parsed = parseStoredDraft(
      encode('{"listing":{"title":"Real","priceUsd":"450","hasSecurity":"si"},"photos":[]}'),
      undefined,
    );

    expect(parsed?.listing).toEqual({ title: "Real" });
  });

  it("descarta una foto a la que le falta algo, en vez de guardar media", () => {
    const parsed = parseStoredDraft(
      encode(
        '{"listing":{},"photos":[{"key":"a","name":"A","bytes":10},{"key":"b"},{"name":"C","bytes":1}]}',
      ),
      undefined,
    );

    expect(parsed?.photos).toEqual([{ key: "a", name: "A", bytes: 10 }]);
  });

  it("nunca guarda mas fotos de las que un aviso admite", () => {
    // Seis es el tope del dominio. Una cookie con cincuenta claves seria
    // cincuenta descargas y cincuenta decodificados de `sharp` dentro de una
    // funcion con memoria fija: el pedido decidiendo cuanto computo gasta.
    const photos = Array.from({ length: 50 }, (_, index) => ({
      key: `k${index}`,
      name: "x",
      bytes: 1,
    }));
    const parsed = parseStoredDraft(
      encode(JSON.stringify({ listing: {}, photos })),
      undefined,
    );

    expect(parsed?.photos).toHaveLength(6);
  });

  it("tolera una lista de violaciones ausente o mal formada", () => {
    expect(parseStoredDraft(encode('{"listing":{},"photos":[]}'), undefined)?.violations).toEqual(
      [],
    );
    expect(
      parseStoredDraft(encode('{"listing":{},"photos":[],"violations":"nope"}'), undefined)
        ?.violations,
    ).toEqual([]);
    expect(
      parseStoredDraft(
        encode('{"listing":{},"photos":[],"violations":[1,"title.required"]}'),
        undefined,
      )?.violations,
    ).toEqual(["title.required"]);
  });

  it("recorta lo tecleado que vuelve para mostrarse al lado del error", () => {
    // `raw` existe para devolver "quinientos" al campo de precio junto a su
    // mensaje. Sin tope, es un canal para meter kilobytes en la cookie.
    const largo = "z".repeat(MAX_RAW_LENGTH + 50);
    const parsed = parseStoredDraft(
      encode(JSON.stringify({ listing: {}, photos: [], raw: { priceUsd: largo, otro: "x" } })),
      undefined,
    );

    expect(parsed?.raw?.priceUsd).toHaveLength(MAX_RAW_LENGTH);
    // Solo campos del formulario: `raw` tambien se vuelca en controles.
    expect(parsed?.raw).not.toHaveProperty("otro");
  });
});

describe("tamano", () => {
  it("el peor caso real entra en las dos cookies", () => {
    // El tope de 1.200 caracteres deja de ser una preferencia y pasa a ser
    // una restriccion tecnica en cuanto el borrador vive en una cookie: sin
    // el, la falla llega en produccion, a un tamano que nadie puede
    // reproducir, y se ve como un formulario que se vacia solo.
    const maximal: StoredDraft = {
      ...stored,
      listing: {
        ...stored.listing,
        title: "á".repeat(MAX_TITLE_CHARACTERS),
        description: "á".repeat(MAX_DESCRIPTION_CHARACTERS),
      },
      reference: "á".repeat(200),
      photos: Array.from({ length: 6 }, (_, index) => ({
        // Las claves reales llevan el id del publicador y un uuid.
        key: `usr_${"0".repeat(24)}/incoming/${"0".repeat(36)}-${index}.webp`,
        name: "á".repeat(60),
        bytes: 999_999,
      })),
      violations: ["description.tooLong", "photos.tooMany"],
      raw: { priceUsd: "z".repeat(MAX_RAW_LENGTH), areaM2: "z".repeat(MAX_RAW_LENGTH) },
    };

    const { draft: rawDraft, text } = serialiseStoredDraft(maximal);

    // Percent-encoded, que es como viaja: en espanol acentuado cada caracter
    // son dos bytes en UTF-8 y tres mas al codificarse.
    for (const value of [rawDraft, text]) {
      expect(Buffer.byteLength(encodeURIComponent(value), "utf8")).toBeLessThan(4096);
    }
  });
});
