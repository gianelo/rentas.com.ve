import { describe, expect, it } from "vitest";
import type { SuggestionVocabulary } from "../../src/modules/listing-catalogue/domain/suggest-filters";
import { readStepAnswers } from "./step-values";

/**
 * Lo que un navegador posteo, traducido al vocabulario del borrador.
 *
 * Cadenas afuera, valores adentro. El parseo no decide **nada** que el
 * dominio decida: un precio escrito "quinientos" sale como `NaN`, que el
 * validador ya rechaza como `priceUsd.invalid`. Traducirlo a 0 aca seria
 * publicar un alquiler gratis por un error de tipeo.
 */

const VOCABULARY: SuggestionVocabulary = {
  cities: [
    { id: "dc", name: "Distrito Capital" },
    { id: "mcbo", name: "Maracaibo" },
  ],
  zones: [
    { id: "altamira", name: "Altamira", cityId: "dc", parentName: "Municipio Chacao" },
    { id: "la-lago", name: "La Lago", cityId: "mcbo", parentName: "Municipio Maracaibo" },
  ],
  aliases: [],
};

function form(entries: Record<string, string | readonly string[]>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    for (const entry of Array.isArray(value) ? value : [value as string]) data.append(key, entry);
  }
  return data;
}

function read(step: Parameters<typeof readStepAnswers>[0], entries: Record<string, unknown>) {
  return readStepAnswers(step, form(entries as Record<string, string>), VOCABULARY);
}

describe("paso 1 · tipo", () => {
  it("lee el tipo elegido", () => {
    expect(read("tipo", { propertyType: "quinta" }).answers.listing.propertyType).toBe("quinta");
  });

  it("sin elegir nada no inventa un tipo", () => {
    // Sin default: un default convierte "al que se le olvido" en "todos son
    // apartamentos", y el tipo es lo que separa un anexo de $150 de un
    // apartamento de $150.
    expect(read("tipo", {}).answers.listing.propertyType).toBeUndefined();
  });
});

describe("paso 2 · zona", () => {
  it("deriva la ciudad de la zona, sin preguntarla nunca", () => {
    const { answers } = read("zona", { zoneId: "la-lago" });

    expect(answers.listing.zoneId).toBe("la-lago");
    expect(answers.listing.cityId).toBe("mcbo");
  });

  it("una zona que no esta en el catalogo no arrastra ciudad", () => {
    // Inventar la ciudad seria empujar contra la clave foranea compuesta de
    // `listing` un par que la base rechaza — un 500 donde corresponde un
    // error de formulario.
    const { answers } = read("zona", { zoneId: "inventada" });

    expect(answers.listing.zoneId).toBeUndefined();
    expect(answers.listing.cityId).toBeUndefined();
  });

  it("guarda la referencia recortando los espacios, y vacia no se guarda", () => {
    expect(
      read("zona", { zoneId: "altamira", reference: "  Frente a la plaza " }).answers.listing
        .reference,
    ).toBe("Frente a la plaza");
    expect(
      read("zona", { zoneId: "altamira", reference: "   " }).answers.listing.reference,
    ).toBeUndefined();
  });
});

describe("paso 3 · precio", () => {
  it("lee un entero", () => {
    expect(read("precio", { priceUsd: "450" }).answers.listing.priceUsd).toBe(450);
  });

  it("un campo vacio queda sin contestar, no en cero", () => {
    // `Number("")` es 0, y un cero silencioso publicaria un alquiler gratis
    // en vez de pedir el precio.
    expect(read("precio", { priceUsd: "" }).answers.listing.priceUsd).toBeUndefined();
    expect(read("precio", {}).answers.listing.priceUsd).toBeUndefined();
  });

  it("no traduce lo que no es un numero: eso lo decide el validador", () => {
    expect(read("precio", { priceUsd: "quinientos" }).answers.listing.priceUsd).toBeNaN();
  });

  it("devuelve lo tecleado para que el error se lea al lado de lo que se escribio", () => {
    expect(read("precio", { priceUsd: "quinientos" }).raw).toEqual({ priceUsd: "quinientos" });
  });
});

describe("paso 4 · tamano", () => {
  it("lee los cuatro numeros", () => {
    const { answers } = read("tamano", {
      rooms: "2",
      bathrooms: "2",
      parkingSpots: "1",
      areaM2: "78",
    });

    expect(answers.listing).toMatchObject({ rooms: 2, bathrooms: 2, parkingSpots: 1, areaM2: 78 });
  });

  it("puestos vacio es cero, y es el unico campo donde vacio es una respuesta", () => {
    // Nadie deberia tener que escribir un cero para publicar un anexo sin
    // estacionamiento. Habitaciones, banos y metros no tienen esa salida:
    // ausentes se quedan ausentes para que el validador los pida.
    const { answers } = read("tamano", { rooms: "", bathrooms: "", areaM2: "", parkingSpots: "" });

    expect(answers.listing.parkingSpots).toBe(0);
    expect(answers.listing.rooms).toBeUndefined();
    expect(answers.listing.bathrooms).toBeUndefined();
    expect(answers.listing.areaM2).toBeUndefined();
  });
});

describe("paso 5 · que tiene", () => {
  it("una casilla marcada llega como true y una sin marcar como false", () => {
    // Ausente es `false`, que significa "no lo declaro" — exactamente lo que
    // paso. La ficha nunca convierte eso en "no lo tiene".
    const { answers } = read("atributos", { hasPowerPlant: "on", hasSecurity: "on" });

    expect(answers.listing).toMatchObject({
      hasPowerPlant: true,
      hasRegularWater: false,
      isFurnished: false,
      hasSecurity: true,
      hasAppliances: false,
    });
  });

  it("mandar el paso ES la respuesta, aunque no se haya marcado ninguna", () => {
    // "No tiene ninguna" es la salida explicita del paso 5. Sin esta marca,
    // no marcar nada seria indistinguible de no haber pasado por el paso.
    expect(read("atributos", {}).answers.featuresDeclared).toBe(true);
  });
});

describe("paso 6 y 7 · titulo y descripcion", () => {
  it("recorta los espacios del titulo", () => {
    expect(read("titulo", { title: "  Apartamento en Altamira  " }).answers.listing.title).toBe(
      "Apartamento en Altamira",
    );
  });

  it("NO recorta la descripcion por dentro: los saltos de linea son de quien escribe", () => {
    const texto = "Primera linea.\n\nSegunda linea.";

    expect(read("descripcion", { description: `  ${texto}  ` }).answers.listing.description).toBe(
      texto,
    );
  });
});

describe("paso 8 · fotos", () => {
  it("lee las fotos subidas en el orden en que llegaron", () => {
    const { answers } = read("fotos", {
      photoKey: ["u/a.webp", "u/b.webp"],
      photoName: ["Sala", "Cocina"],
      photoBytes: ["168000", "140000"],
    });

    expect(answers.photos).toEqual([
      { key: "u/a.webp", name: "Sala", bytes: 168_000 },
      { key: "u/b.webp", name: "Cocina", bytes: 140_000 },
    ]);
  });

  it("descarta una foto sin clave en vez de guardar una fila rota", () => {
    const { answers } = read("fotos", {
      photoKey: ["", "u/b.webp"],
      photoName: ["Sala", "Cocina"],
      photoBytes: ["168000", "140000"],
    });

    expect(answers.photos).toEqual([{ key: "u/b.webp", name: "Cocina", bytes: 140_000 }]);
  });

  it("sin fotos devuelve una lista vacia, que es lo que el validador rechaza", () => {
    expect(read("fotos", {}).answers.photos).toEqual([]);
  });
});

describe("paso 9 · quien publica", () => {
  it("lee dueno o inmobiliaria y el contacto", () => {
    const { answers } = read("quien", {
      publisherType: "broker",
      contactMethod: "email",
      contactValue: " persona@ejemplo.com ",
    });

    expect(answers.listing).toMatchObject({
      publisherType: "broker",
      contactMethod: "email",
      contactValue: "persona@ejemplo.com",
    });
  });

  it("sin elegir, dueno/inmobiliaria queda sin contestar", () => {
    // Es la garantia de confianza central del producto, no una preferencia
    // de pantalla, y no se puede cambiar despues de publicar.
    expect(
      read("quien", { contactMethod: "whatsapp" }).answers.listing.publisherType,
    ).toBeUndefined();
  });
});

describe("lo que ningun paso lee", () => {
  it("un paso nunca lee un campo de otro paso, aunque venga en el formulario", () => {
    // Es la mitad de "volver no borra lo que sigue" que vive en la entrega:
    // aunque alguien postee el formulario entero contra el paso 3, solo el
    // precio sale de aca, y `applyStepAnswers` solo escribe lo que este paso
    // posee.
    const { answers } = read("precio", {
      priceUsd: "450",
      title: "Otro titulo",
      publisherType: "broker",
      description: "x".repeat(200),
    });

    expect(answers.listing.title).toBeUndefined();
    expect(answers.listing.publisherType).toBeUndefined();
    expect(answers.listing.description).toBeUndefined();
  });

  it("ningun paso lee un id de publicador", () => {
    // Sale de la sesion. Punto. Es lo que hace que la verificacion de
    // propiedad de las fotos signifique algo.
    const { answers } = read("quien", {
      publisherType: "owner",
      publisherId: "usr_otra_persona",
    });

    expect(answers.listing).not.toHaveProperty("publisherId");
  });
});
