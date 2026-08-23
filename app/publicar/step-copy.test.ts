import { describe, expect, it } from "vitest";
import type { PublicationDraft } from "../../src/modules/listing-publication/domain/publication-steps";
import { PUBLISH_STEP_ORDER } from "../../src/modules/listing-publication/domain/publication-steps";
import { changeNoticeMessage, PRIMARY_ACTION_LABEL, STEP_COPY, stepSummary } from "./step-copy";

const DRAFT: PublicationDraft = {
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
  photos: [{ key: "a", name: "Sala", bytes: 168_000 }],
  featuresDeclared: true,
};

describe("STEP_COPY", () => {
  it("tiene copia para los nueve, numerada del 1 al 9", () => {
    // Un `Record` sobre la union: agregar un paso al dominio deja este
    // archivo sin compilar hasta que alguien escriba la pregunta. Un paso sin
    // pregunta es una pantalla en blanco.
    for (const [index, step] of PUBLISH_STEP_ORDER.entries()) {
      expect(STEP_COPY[step].number).toBe(index + 1);
      expect(STEP_COPY[step].question.length).toBeGreaterThan(0);
      expect(STEP_COPY[step].railLabel.length).toBeGreaterThan(0);
    }
  });
});

describe("PRIMARY_ACTION_LABEL", () => {
  it("el boton dice lo que hace en cada contexto", () => {
    expect(PRIMARY_ACTION_LABEL.continue).toBe("Seguir");
    expect(PRIMARY_ACTION_LABEL.review).toBe("Revisar el aviso");
    // Criterio de aceptacion 11, textual.
    expect(PRIMARY_ACTION_LABEL.saveAndReturnToReview).toBe("Guardar y volver a revisar");
  });
});

describe("stepSummary — el riel muestra el valor, no el numero", () => {
  it("resume cada paso hecho con lo que la persona contesto", () => {
    const names = { zoneName: "Altamira" };

    expect(stepSummary("tipo", DRAFT, names)).toBe("Apartamento");
    expect(stepSummary("zona", DRAFT, names)).toBe("Altamira");
    expect(stepSummary("precio", DRAFT, names)).toBe("$450 al mes");
    expect(stepSummary("tamano", DRAFT, names)).toBe("2 hab · 78 m²");
    expect(stepSummary("atributos", DRAFT, names)).toBe("3 atributos");
    expect(stepSummary("titulo", DRAFT, names)).toBe("Título");
    expect(stepSummary("descripcion", DRAFT, names)).toBe("Descripción");
    expect(stepSummary("fotos", DRAFT, names)).toBe("1 foto");
    expect(stepSummary("quien", DRAFT, names)).toBe("Dueño · WhatsApp");
  });

  it("dice la salida explicita del paso 5 en vez de '0 atributos'", () => {
    // Quien contesto "No tiene ninguna" contesto. Un cero en el riel se lee
    // como un paso que fallo.
    const ninguno: PublicationDraft = {
      ...DRAFT,
      listing: {
        ...DRAFT.listing,
        hasPowerPlant: false,
        hasRegularWater: false,
        hasSecurity: false,
      },
    };

    expect(stepSummary("atributos", ninguno, {})).toBe("Ninguno");
  });

  it("no resume un paso sin contestar", () => {
    const vacio: PublicationDraft = { listing: {}, photos: [] };

    for (const step of PUBLISH_STEP_ORDER) {
      expect(stepSummary(step, vacio, {})).toBeNull();
    }
  });

  it("no muestra un id de zona cuando no conoce su nombre", () => {
    // Un `zone_id` en el riel no le dice nada a nadie.
    expect(stepSummary("zona", DRAFT, {})).toBeNull();
  });

  it("cuenta las fotos en singular y en plural", () => {
    expect(stepSummary("fotos", { ...DRAFT, photos: [...DRAFT.photos, ...DRAFT.photos] }, {})).toBe(
      "2 fotos",
    );
  });
});

describe("changeNoticeMessage — se dice que cambio", () => {
  it("nombra el campo y sus dos valores, y aclara que el resto quedo igual", () => {
    expect(changeNoticeMessage({ field: "rooms", before: "2", after: "3" })).toBe(
      "Cambiaste habitaciones de 2 a 3. El resto del aviso quedó como estaba.",
    );
  });

  it("dice 'pusiste' cuando antes no habia nada que cambiar", () => {
    expect(changeNoticeMessage({ field: "propertyType", before: "", after: "quinta" })).toBe(
      "Pusiste el tipo de propiedad en quinta. El resto del aviso quedó como estaba.",
    );
  });

  it("nombra la cantidad de fotos, no una clave de archivo", () => {
    expect(changeNoticeMessage({ field: "photos", before: "1", after: "3" })).toBe(
      "Cambiaste las fotos de 1 a 3. El resto del aviso quedó como estaba.",
    );
  });

  it("dice el precio en dolares, como el resto del producto", () => {
    expect(changeNoticeMessage({ field: "priceUsd", before: "450", after: "500" })).toBe(
      "Cambiaste el precio de $450 a $500. El resto del aviso quedó como estaba.",
    );
  });

  it("no lee un booleano en voz alta: nombra el paso", () => {
    // "Cambiaste hasPowerPlant de false a true" no es una frase que alguien
    // pueda usar. Lo que cambio es lo que el aviso declara.
    expect(changeNoticeMessage({ field: "hasPowerPlant", before: "false", after: "true" })).toBe(
      "Cambiaste lo que tiene la propiedad. El resto del aviso quedó como estaba.",
    );
  });
});
