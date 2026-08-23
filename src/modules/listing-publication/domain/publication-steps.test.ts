import { describe, expect, it } from "vitest";
import {
  applyStepAnswers,
  completedSteps,
  currentStepId,
  describeDraftChange,
  draftListingOf,
  isDraftReadyForReview,
  isStepComplete,
  isStepNavigable,
  nextStepAfter,
  PUBLISH_STEP_ORDER,
  type PublicationDraft,
  type PublishStepId,
  parseStepId,
  primaryActionFor,
  progressPercent,
  STEP_FOR_VIOLATION,
  stepViolations,
} from "./publication-steps";
import {
  type CuratedZone,
  type PublishViolation,
  validatePublishableListing,
} from "./publishable-listing";

const ZONES: readonly CuratedZone[] = [
  { id: "altamira", cityId: "dc" },
  { id: "la-lago", cityId: "mcbo" },
];

const DESCRIPTION =
  "Edificio de 2007, piso 6 con ascensor y vigilancia las 24 horas. Tiene planta electrica y tanque propio, " +
  "asi que el agua llega todos los dias sin excepcion.";

/** Un borrador que contesto los nueve pasos. Cada spec lo recorta a proposito. */
function completeDraft(): PublicationDraft {
  return {
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
      description: DESCRIPTION,
      publisherType: "owner",
      contactMethod: "whatsapp",
      contactValue: "04125550134",
    },
    photos: [{ key: "u/1.webp", name: "Sala", bytes: 168_000 }],
    featuresDeclared: true,
  };
}

function violationsOf(draft: PublicationDraft) {
  return validatePublishableListing(draftListingOf(draft), ZONES);
}

describe("los nueve pasos", () => {
  it("van en el orden que fija la especificacion: la propiedad primero, la persona al final", () => {
    expect(PUBLISH_STEP_ORDER).toEqual([
      "tipo",
      "zona",
      "precio",
      "tamano",
      "atributos",
      "titulo",
      "descripcion",
      "fotos",
      "quien",
    ]);
  });

  it("pone a la persona en el ultimo lugar y nunca en el primero", () => {
    // Pedir dueno/inmobiliaria y telefono en el paso 1 se lee como un
    // registro, y un registro al principio es una puerta que la mayoria no
    // cruza. Es la razon del orden, escrita como assert.
    expect(PUBLISH_STEP_ORDER[PUBLISH_STEP_ORDER.length - 1]).toBe("quien");
    expect(PUBLISH_STEP_ORDER[0]).toBe("tipo");
  });
});

describe("draftListingOf", () => {
  it("deriva photoCount de las fotos guardadas y nunca lo acepta declarado", () => {
    const draft = completeDraft();

    expect(draftListingOf(draft).photoCount).toBe(1);
    expect(draftListingOf({ ...draft, photos: [] }).photoCount).toBe(0);
  });
});

describe("stepViolations", () => {
  it("reparte cada codigo al paso que tiene el campo en pantalla", () => {
    expect(stepViolations("tipo", ["propertyType.required", "priceUsd.required"])).toEqual([
      "propertyType.required",
    ]);
    expect(
      stepViolations("zona", ["cityId.unknown", "zoneId.notInCity", "title.required"]),
    ).toEqual(["cityId.unknown", "zoneId.notInCity"]);
    expect(stepViolations("tamano", ["rooms.invalid", "parkingSpots.invalid"])).toEqual([
      "rooms.invalid",
      "parkingSpots.invalid",
    ]);
    expect(stepViolations("quien", ["publisherType.required", "contactValue.invalid"])).toEqual([
      "publisherType.required",
      "contactValue.invalid",
    ]);
  });

  it("no muestra errores de fotos en un paso que no tiene fotos", () => {
    // Un error que apunta a un campo que no existe en la pantalla es un
    // callejon sin salida (seccion 6 de la especificacion).
    for (const step of PUBLISH_STEP_ORDER) {
      const shown = stepViolations(step, ["photos.required", "photos.tooMany"]);
      if (step === "fotos") {
        expect(shown).toEqual(["photos.required", "photos.tooMany"]);
      } else {
        expect(shown).toEqual([]);
      }
    }
  });

  it("no deja ningun codigo del dominio sin paso donde mostrarse", () => {
    // Si alguien agrega una violacion al dominio y se olvida de asignarle
    // paso, el publicador la recibe en ninguna pantalla: el boton no avanza y
    // nada explica por que. El `Record` sobre la union ya rompe la
    // compilacion; esto comprueba que ademas todo paso asignado es un paso
    // real y que `stepViolations` respeta la asignacion.
    const everyViolation = Object.keys(STEP_FOR_VIOLATION) as PublishViolation[];

    for (const violation of everyViolation) {
      const step = STEP_FOR_VIOLATION[violation];
      expect(PUBLISH_STEP_ORDER).toContain(step);
      expect(stepViolations(step, everyViolation)).toContain(violation);
    }
  });
});

describe("parseStepId", () => {
  it("reconoce los nueve y rechaza cualquier otra cosa", () => {
    // El segmento llega de la URL, que la escribe quien quiera. Un paso
    // inventado tiene que terminar en 404, no en una pantalla a medio dibujar.
    for (const step of PUBLISH_STEP_ORDER) {
      expect(parseStepId(step)).toBe(step);
    }
    expect(parseStepId("revisar")).toBeNull();
    expect(parseStepId("constructor")).toBeNull();
    expect(parseStepId(undefined)).toBeNull();
  });
});

describe("isStepComplete", () => {
  it("da por hecho un paso cuando ninguno de sus campos tiene violacion", () => {
    const draft = completeDraft();
    const violations = violationsOf(draft);

    for (const step of PUBLISH_STEP_ORDER) {
      expect(isStepComplete(step, draft, violations)).toBe(true);
    }
  });

  it("marca incompleto solo el paso del campo que falta", () => {
    const draft = completeDraft();
    draft.listing.priceUsd;
    const sinPrecio: PublicationDraft = {
      ...draft,
      listing: { ...draft.listing, priceUsd: undefined },
    };
    const violations = violationsOf(sinPrecio);

    expect(isStepComplete("precio", sinPrecio, violations)).toBe(false);
    expect(isStepComplete("tipo", sinPrecio, violations)).toBe(true);
    expect(isStepComplete("tamano", sinPrecio, violations)).toBe(true);
  });

  it("el paso 5 exige una respuesta explicita, aunque no tenga ninguna validacion", () => {
    // "No tiene ninguna" es una respuesta. Sin la marca explicita, no marcar
    // nada seria indistinguible de no haber pasado por el paso, y el riel
    // mostraria un ✓ que nadie puso.
    const draft = completeDraft();
    const sinDeclarar: PublicationDraft = { ...draft, featuresDeclared: undefined };

    expect(isStepComplete("atributos", sinDeclarar, violationsOf(sinDeclarar))).toBe(false);
  });

  it("acepta el paso 5 con los cinco atributos en false, que es la salida explicita", () => {
    const draft: PublicationDraft = {
      ...completeDraft(),
      listing: {
        ...completeDraft().listing,
        hasPowerPlant: false,
        hasRegularWater: false,
        isFurnished: false,
        hasSecurity: false,
        hasAppliances: false,
      },
      featuresDeclared: true,
    };

    expect(isStepComplete("atributos", draft, violationsOf(draft))).toBe(true);
  });
});

describe("isStepNavigable", () => {
  it("deja volver a un paso hecho", () => {
    const draft = completeDraft();
    expect(isStepNavigable("tipo", draft, violationsOf(draft))).toBe(true);
    expect(isStepNavigable("tamano", draft, violationsOf(draft))).toBe(true);
  });

  it("NO deja saltar a un paso que falta", () => {
    // Criterio de aceptacion 10. Saltar a algo sin contestar es como se llega
    // a la revision con huecos que nadie ve.
    const draft: PublicationDraft = {
      listing: { propertyType: "apartamento" },
      photos: [],
    };
    const violations = violationsOf(draft);

    expect(isStepNavigable("zona", draft, violations)).toBe(true); // el actual
    expect(isStepNavigable("precio", draft, violations)).toBe(false);
    expect(isStepNavigable("quien", draft, violations)).toBe(false);
  });

  it("deja navegable el paso actual aunque este incompleto", () => {
    const draft: PublicationDraft = { listing: {}, photos: [] };
    expect(isStepNavigable("tipo", draft, violationsOf(draft))).toBe(true);
  });
});

describe("currentStepId y el progreso", () => {
  it("apunta al primer paso incompleto", () => {
    const draft: PublicationDraft = {
      listing: { propertyType: "casa", cityId: "dc", zoneId: "altamira" },
      photos: [],
    };

    expect(currentStepId(draft, violationsOf(draft))).toBe("precio");
  });

  it("con los nueve hechos, el paso actual es el ultimo", () => {
    const draft = completeDraft();
    expect(currentStepId(draft, violationsOf(draft))).toBe("quien");
  });

  it("cuenta los pasos hechos y traduce a porcentaje", () => {
    const draft: PublicationDraft = {
      listing: { propertyType: "casa", cityId: "dc", zoneId: "altamira" },
      photos: [],
    };
    const violations = violationsOf(draft);

    expect(completedSteps(draft, violations)).toEqual(["tipo", "zona"]);
    expect(progressPercent(draft, violations)).toBe(Math.round((2 / 9) * 100));
  });
});

describe("applyStepAnswers — volver atras no borra lo que sigue", () => {
  it("corregir el paso 4 deja los pasos 5 a 9 intactos", () => {
    // Regla 1 de la seccion 4, y la mas facil de implementar mal.
    const before = completeDraft();

    const after = applyStepAnswers(before, "tamano", {
      listing: { rooms: 3, bathrooms: 2, parkingSpots: 1, areaM2: 78 },
      photos: [],
    });

    expect(after.listing.rooms).toBe(3);
    expect(after.listing.hasPowerPlant).toBe(true);
    expect(after.listing.title).toBe(before.listing.title);
    expect(after.listing.description).toBe(before.listing.description);
    expect(after.listing.publisherType).toBe("owner");
    expect(after.listing.contactValue).toBe("04125550134");
    expect(after.photos).toEqual(before.photos);
    expect(after.featuresDeclared).toBe(true);

    const violations = violationsOf(after);
    for (const step of PUBLISH_STEP_ORDER) {
      expect(isStepComplete(step, after, violations)).toBe(true);
    }
  });

  it("tampoco borra lo anterior", () => {
    const before = completeDraft();

    const after = applyStepAnswers(before, "titulo", {
      listing: { title: "Otro titulo" },
      photos: [],
    });

    expect(after.listing.propertyType).toBe("apartamento");
    expect(after.listing.zoneId).toBe("altamira");
    expect(after.listing.priceUsd).toBe(450);
  });

  it("solo escribe los campos del paso, y los escribe aunque lleguen vacios", () => {
    // Destildar las cinco casillas del paso 5 ES una respuesta. Si el merge
    // ignorara los `undefined`, desmarcar no tendria efecto y el aviso
    // declararia algo que quien publica ya se retracto de declarar.
    const before = completeDraft();

    const after = applyStepAnswers(before, "atributos", {
      listing: {},
      photos: [],
      featuresDeclared: true,
    });

    expect(after.listing.hasPowerPlant).toBeUndefined();
    expect(after.listing.hasSecurity).toBeUndefined();
    expect(after.listing.rooms).toBe(2);
    expect(after.featuresDeclared).toBe(true);
  });

  it("el paso 8 reemplaza las fotos y nada mas", () => {
    const before = completeDraft();
    const after = applyStepAnswers(before, "fotos", {
      listing: {},
      photos: [
        { key: "u/2.webp", name: "Cocina", bytes: 140_000 },
        { key: "u/3.webp", name: "Cuarto", bytes: 141_000 },
      ],
    });

    expect(after.photos).toHaveLength(2);
    expect(after.listing.title).toBe(before.listing.title);
  });

  it("el paso 2 guarda la referencia junto con ciudad y zona", () => {
    const before = completeDraft();
    const after = applyStepAnswers(before, "zona", {
      listing: { cityId: "mcbo", zoneId: "la-lago" },
      photos: [],
      reference: "Al lado de la panaderia",
    });

    expect(after.listing.cityId).toBe("mcbo");
    expect(after.reference).toBe("Al lado de la panaderia");
    expect(after.listing.priceUsd).toBe(450);
  });

  it("un paso ajeno nunca toca la referencia", () => {
    const before: PublicationDraft = { ...completeDraft(), reference: "Frente a la plaza" };
    const after = applyStepAnswers(before, "precio", { listing: { priceUsd: 500 }, photos: [] });

    expect(after.reference).toBe("Frente a la plaza");
  });
});

describe("primaryActionFor — el boton cambia de contexto", () => {
  it("dice seguir mientras se avanza", () => {
    expect(primaryActionFor("tipo", false)).toBe("continue");
    expect(primaryActionFor("descripcion", false)).toBe("continue");
  });

  it("el ultimo paso lleva a revisar, no a un decimo paso", () => {
    expect(primaryActionFor("quien", false)).toBe("review");
  });

  it("al volver desde revisar, guarda y vuelve a revisar", () => {
    // Criterio de aceptacion 11. Quien entro desde revisar quiere volver ahi.
    expect(primaryActionFor("tamano", true)).toBe("saveAndReturnToReview");
    expect(primaryActionFor("tipo", true)).toBe("saveAndReturnToReview");
    expect(primaryActionFor("quien", true)).toBe("saveAndReturnToReview");
  });
});

describe("nextStepAfter", () => {
  it("avanza uno cuando se viene de adelante", () => {
    expect(nextStepAfter("tipo", false)).toBe("zona");
    expect(nextStepAfter("fotos", false)).toBe("quien");
  });

  it("despues del noveno viene revisar", () => {
    expect(nextStepAfter("quien", false)).toBe("revisar");
  });

  it("al venir de revisar, se vuelve a revisar desde cualquier paso", () => {
    for (const step of PUBLISH_STEP_ORDER) {
      expect(nextStepAfter(step as PublishStepId, true)).toBe("revisar");
    }
  });
});

describe("describeDraftChange — se dice que cambio", () => {
  it("nombra el campo y sus dos valores", () => {
    const before = completeDraft();
    const after = applyStepAnswers(before, "tamano", {
      listing: { rooms: 3, bathrooms: 2, parkingSpots: 1, areaM2: 78 },
      photos: [],
    });

    expect(describeDraftChange(before, after)).toEqual({
      field: "rooms",
      before: "2",
      after: "3",
    });
  });

  it("devuelve null cuando no cambio nada, para no anunciar un cambio que no hubo", () => {
    const before = completeDraft();
    expect(describeDraftChange(before, before)).toBeNull();
  });

  it("informa un valor que aparece donde antes no habia nada", () => {
    const before: PublicationDraft = { listing: {}, photos: [] };
    const after = applyStepAnswers(before, "tipo", {
      listing: { propertyType: "quinta" },
      photos: [],
    });

    expect(describeDraftChange(before, after)).toEqual({
      field: "propertyType",
      before: "",
      after: "quinta",
    });
  });

  it("informa el cambio de fotos por su cantidad", () => {
    const before = completeDraft();
    const after = applyStepAnswers(before, "fotos", {
      listing: {},
      photos: [
        { key: "a", name: "a", bytes: 1 },
        { key: "b", name: "b", bytes: 1 },
      ],
    });

    expect(describeDraftChange(before, after)).toEqual({
      field: "photos",
      before: "1",
      after: "2",
    });
  });
});

/**
 * **La puerta de la pantalla de revisar.**
 *
 * Es una regla de producto y no de maquetacion: decide quien puede ver la
 * pantalla que resume el aviso. Redirigiendo de mas deja a alguien encerrado
 * sin poder publicar; redirigiendo de menos, revisar dibuja un hueco donde
 * deberia haber un dato — y un hueco se lee como un dato que el sitio perdio.
 *
 * Los dos casos borde de abajo son los que la vuelven dificil de escribir a
 * ojo, y fallan en direcciones opuestas: uno no produce ninguna violacion, el
 * otro no mueve el paso actual.
 */
describe("isDraftReadyForReview — la puerta de revisar", () => {
  it("deja pasar un borrador con los nueve pasos contestados", () => {
    const draft = completeDraft();
    expect(isDraftReadyForReview(draft, violationsOf(draft))).toBe(true);
  });

  /**
   * **El paso 5 no produce violaciones.** Los cinco atributos son opcionales,
   * asi que un borrador que nunca abrio esa pantalla valida perfecto. Una
   * puerta escrita solo como "no hay violaciones" lo dejaria entrar, y revisar
   * diria "Ninguno" sobre una pregunta que nadie contesto.
   */
  it("no deja pasar cuando solo falta declarar los atributos", () => {
    const draft: PublicationDraft = { ...completeDraft(), featuresDeclared: undefined };
    const violations = violationsOf(draft);

    expect(violations).toEqual([]);
    expect(isDraftReadyForReview(draft, violations)).toBe(false);
  });

  /**
   * **El paso 9 es el ultimo, y el ultimo es tambien el que `currentStepId`
   * devuelve cuando ya no falta ninguno.** Una puerta escrita solo como "el
   * paso actual es el ultimo" confunde las dos cosas y deja llegar a revisar un
   * aviso sin dueno ni contacto declarados — justo el dato que despues no se
   * puede corregir.
   */
  it("no deja pasar cuando solo falta el paso 9, que es el ultimo", () => {
    const complete = completeDraft();
    const draft: PublicationDraft = {
      ...complete,
      listing: {
        ...complete.listing,
        publisherType: undefined,
        contactMethod: undefined,
        contactValue: undefined,
      },
    };
    const violations = violationsOf(draft);

    expect(currentStepId(draft, violations)).toBe(
      PUBLISH_STEP_ORDER[PUBLISH_STEP_ORDER.length - 1],
    );
    expect(isDraftReadyForReview(draft, violations)).toBe(false);
  });

  it("no deja pasar cuando falta un paso del medio", () => {
    const complete = completeDraft();
    const draft: PublicationDraft = {
      ...complete,
      listing: { ...complete.listing, priceUsd: undefined },
    };

    expect(isDraftReadyForReview(draft, violationsOf(draft))).toBe(false);
  });

  /**
   * La regla dicha una sola vez. Revisar se abre exactamente cuando el riel
   * muestra los nueve ✓: sin una segunda condicion que pueda discrepar de el.
   */
  it("coincide con lo que el riel marca hecho, sin fotos", () => {
    const draft: PublicationDraft = { ...completeDraft(), photos: [] };
    const violations = violationsOf(draft);

    expect(completedSteps(draft, violations)).not.toContain("fotos");
    expect(isDraftReadyForReview(draft, violations)).toBe(false);
  });
});
