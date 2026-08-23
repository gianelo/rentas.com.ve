import type { DraftListing, PublishViolation } from "./publishable-listing";

/**
 * Los nueve pasos de Publicar, como reglas y no como pantallas.
 *
 * ## Por que esto vive en el dominio
 *
 * Cuales son los pasos, en que orden van, cual esta completo, cual es
 * navegable, que dice el boton y que cambio respecto de antes son decisiones
 * de producto, no de maquetacion. Puestas en un componente serian reglas que
 * el piso de cobertura del 90% no alcanza y que la importacion de cartera en
 * lote no tiene — el mismo error que el fundador ya prohibio una vez, textual:
 * «nunca mas coloques una regla de negocio en el front, nunca».
 *
 * ## La decision que sostiene toda la estructura
 *
 * El costo de nueve pantallas son nueve momentos de abandono, y lo unico que
 * lo compensa es poder volver atras sin perder nada. Por eso **la completitud
 * de un paso se DERIVA de los valores**, y no se lleva en una lista de pasos
 * hechos. Una lista hay que mantenerla al dia; los valores ya estan ahi. Con
 * una lista, corregir el paso 4 obliga a acordarse de no tocar los pasos 5 a
 * 9 — y olvidarlo es exactamente el defecto que la seccion 4 de la
 * especificacion llama "el mas facil de implementar mal". Derivandola, el
 * defecto no se puede escribir.
 *
 * La unica excepcion es el paso 5, y esta explicada donde ocurre.
 *
 * Puro y sin dependencias: entra un borrador y las violaciones que el
 * validador ya calculo, salen respuestas. Sin base, sin sesion, sin red.
 */

export type PublishStepId =
  | "tipo"
  | "zona"
  | "precio"
  | "tamano"
  | "atributos"
  | "titulo"
  | "descripcion"
  | "fotos"
  | "quien";

/**
 * **La propiedad primero (1 a 8), la persona al final (9).**
 *
 * No es un orden estetico. Quien entra a publicar quiere hablar de su
 * apartamento, no de si mismo; pedirle dueno/inmobiliaria y telefono en el
 * paso 1 se lee como un registro, y un registro al principio es una puerta
 * que la mayoria no cruza.
 */
export const PUBLISH_STEP_ORDER: readonly PublishStepId[] = [
  "tipo",
  "zona",
  "precio",
  "tamano",
  "atributos",
  "titulo",
  "descripcion",
  "fotos",
  "quien",
];

/** Una foto ya subida, con lo que la pantalla de revisar necesita mostrar. */
export interface DraftPhoto {
  /** La clave que R2 devolvio. La propiedad se vuelve a verificar al publicar. */
  readonly key: string;
  readonly name: string;
  readonly bytes: number;
}

/**
 * Los valores del aviso **sin `photoCount`**, y la omision es deliberada: la
 * cantidad de fotos se deriva de `photos`, nunca se declara. Un borrador
 * capaz de declararla es un borrador capaz de contradecirse.
 */
export type DraftListingValues = Omit<DraftListing, "photoCount">;

export interface PublicationDraft {
  readonly listing: DraftListingValues;
  readonly photos: readonly DraftPhoto[];
  /**
   * El paso 5 contestado, incluida la salida explicita "No tiene ninguna".
   *
   * **Es la unica completitud que no se puede derivar de los valores**, y por
   * eso existe este campo en vez de una lista de pasos hechos. Los cinco
   * atributos son opcionales: no marcar nada es una respuesta valida, y sin
   * esta marca seria indistinguible de no haber pasado por el paso. El riel
   * mostraria un ✓ que nadie puso, o lo negaria para siempre a quien
   * legitimamente no tiene ninguno.
   */
  readonly featuresDeclared?: boolean;
  /**
   * Punto de referencia, texto libre y opcional (paso 2). Es el campo que
   * reemplaza a Google Places.
   *
   * Vive aca y no en `listing` porque **`listing` no tiene columna para el**:
   * `referencia` no existe en el esquema todavia. Modelarlo desde ya deja el
   * borrador listo para el dia que la columna llegue, sin tocar el dominio.
   */
  readonly reference?: string;
}

/**
 * El borrador visto como lo ve el validador.
 *
 * `photoCount` sale de contar, nunca de un campo: es la misma razon por la que
 * `PublishListingRequest` lo omite del pedido. Dos fuentes para el mismo
 * numero es como una pantalla dice "3 fotos" sobre un aviso que tiene dos.
 */
export function draftListingOf(draft: PublicationDraft): DraftListing {
  return { ...draft.listing, photoCount: draft.photos.length };
}

/**
 * A que paso pertenece cada violacion, como `Record` sobre la union completa.
 *
 * **El tipo es la garantia, no el test.** Agregar una violacion al dominio
 * deja este archivo sin compilar hasta que alguien decida en que pantalla se
 * muestra — y una violacion sin paso es una violacion que el publicador
 * recibe en ninguna parte: el boton no avanza y nada explica por que.
 */
export const STEP_FOR_VIOLATION: Record<PublishViolation, PublishStepId> = {
  "propertyType.required": "tipo",
  "propertyType.invalid": "tipo",
  "cityId.required": "zona",
  "cityId.unknown": "zona",
  "zoneId.required": "zona",
  "zoneId.notInCity": "zona",
  "priceUsd.required": "precio",
  "priceUsd.invalid": "precio",
  "rooms.required": "tamano",
  "rooms.invalid": "tamano",
  "bathrooms.required": "tamano",
  "bathrooms.invalid": "tamano",
  "parkingSpots.invalid": "tamano",
  "areaM2.required": "tamano",
  "areaM2.invalid": "tamano",
  "title.required": "titulo",
  "title.tooLong": "titulo",
  "description.required": "descripcion",
  "description.tooShort": "descripcion",
  "description.tooLong": "descripcion",
  "photos.required": "fotos",
  "photos.tooMany": "fotos",
  "publisherType.required": "quien",
  "publisherType.invalid": "quien",
  "contactMethod.required": "quien",
  "contactMethod.invalid": "quien",
  "contactValue.required": "quien",
  "contactValue.invalid": "quien",
};

/**
 * Las violaciones que ESTA pantalla puede mostrar, y ninguna otra.
 *
 * Un error que apunta a un campo que no existe en la pantalla es un callejon
 * sin salida: el paso 3 no tiene donde subir una foto, asi que decirle ahi a
 * alguien que le faltan fotos lo deja mirando un boton que no avanza.
 *
 * **Nada se saltea en el conjunto.** `publishListing` vuelve a correr el
 * validador entero al publicar, lo cual convierte este filtro en una decision
 * de presentacion y no en un hueco.
 */
export function stepViolations(
  stepId: PublishStepId,
  violations: readonly PublishViolation[],
): readonly PublishViolation[] {
  return violations.filter((violation) => STEP_FOR_VIOLATION[violation] === stepId);
}

/**
 * Un paso esta hecho cuando ninguno de sus campos tiene violacion.
 *
 * **Completitud y validez son la misma regla, a proposito.** Si fueran dos, un
 * paso podria quedar marcado ✓ con un valor que el publicar rechaza despues —
 * y el publicador se enteraria en la pantalla de revisar, nueve pasos tarde.
 */
export function isStepComplete(
  stepId: PublishStepId,
  draft: PublicationDraft,
  violations: readonly PublishViolation[],
): boolean {
  // El paso 5 no tiene ninguna validacion que fallar: los cinco atributos son
  // opcionales. Sin esta linea estaria hecho desde antes de abrirlo.
  if (stepId === "atributos") return draft.featuresDeclared === true;

  return stepViolations(stepId, violations).length === 0;
}

export function completedSteps(
  draft: PublicationDraft,
  violations: readonly PublishViolation[],
): readonly PublishStepId[] {
  return PUBLISH_STEP_ORDER.filter((step) => isStepComplete(step, draft, violations));
}

/**
 * El primer paso incompleto — o el ultimo, cuando ya no falta ninguno.
 *
 * Devolver el ultimo en vez de `null` es lo que hace que entrar a `/publicar`
 * con todo contestado no muestre una pantalla vacia ni un error.
 */
export function currentStepId(
  draft: PublicationDraft,
  violations: readonly PublishViolation[],
): PublishStepId {
  return (
    PUBLISH_STEP_ORDER.find((step) => !isStepComplete(step, draft, violations)) ??
    (PUBLISH_STEP_ORDER[PUBLISH_STEP_ORDER.length - 1] as PublishStepId)
  );
}

/**
 * **Hacia atras si, hacia adelante no** (criterio de aceptacion 10).
 *
 * Los pasos ya hechos son enlaces; los que faltan, no. Saltar a algo sin
 * contestar es como se llega a revisar con huecos que nadie vio, y en una
 * pantalla de revision un hueco se lee como un dato que el sitio perdio.
 */
export function isStepNavigable(
  stepId: PublishStepId,
  draft: PublicationDraft,
  violations: readonly PublishViolation[],
): boolean {
  return isStepComplete(stepId, draft, violations) || stepId === currentStepId(draft, violations);
}

/** Para la barra de 3 px de movil. El riel de escritorio usa el detalle. */
export function progressPercent(
  draft: PublicationDraft,
  violations: readonly PublishViolation[],
): number {
  return Math.round((completedSteps(draft, violations).length / PUBLISH_STEP_ORDER.length) * 100);
}

/**
 * Los campos de `listing` que cada paso posee. **Es la lista que decide que
 * puede pisar un paso**, y por lo tanto la que garantiza que volver atras no
 * borre lo que sigue.
 */
const STEP_LISTING_FIELDS: Record<PublishStepId, readonly (keyof DraftListingValues)[]> = {
  tipo: ["propertyType"],
  // La ciudad la determina la zona: se escribe aca porque se deriva aca, no
  // porque se pregunte (criterio de aceptacion 7).
  zona: ["cityId", "zoneId"],
  precio: ["priceUsd"],
  tamano: ["rooms", "bathrooms", "parkingSpots", "areaM2"],
  atributos: ["hasPowerPlant", "hasRegularWater", "isFurnished", "hasSecurity", "hasAppliances"],
  titulo: ["title"],
  descripcion: ["description"],
  fotos: [],
  quien: ["publisherType", "contactMethod", "contactValue"],
};

function copyOwnedFields(
  target: DraftListingValues,
  source: DraftListingValues,
  fields: readonly (keyof DraftListingValues)[],
): DraftListingValues {
  const next = { ...target } as Record<string, unknown>;
  for (const field of fields) {
    // Se asigna SIEMPRE, incluso `undefined`. Destildar las cinco casillas
    // del paso 5 es una respuesta: si el merge ignorara los ausentes,
    // desmarcar no tendria efecto y el aviso seguiria declarando algo de lo
    // que quien publica ya se retracto.
    next[field] = (source as Record<string, unknown>)[field];
  }
  return next as DraftListingValues;
}

/**
 * **Regla 1 de la seccion 4: volver no borra lo que sigue.**
 *
 * Corregir el paso 4 desde revisar deja los pasos 5 a 9 intactos, con su ✓ y
 * su valor. Lo que lo garantiza es que esta funcion escribe unicamente los
 * campos de `STEP_LISTING_FIELDS[stepId]` — nunca reemplaza el borrador
 * entero. Reemplazarlo es la version de una linea de este archivo y es
 * exactamente el defecto que la especificacion advierte.
 */
export function applyStepAnswers(
  draft: PublicationDraft,
  stepId: PublishStepId,
  answers: PublicationDraft,
): PublicationDraft {
  const listing = copyOwnedFields(draft.listing, answers.listing, STEP_LISTING_FIELDS[stepId]);

  return {
    listing,
    // Solo el paso 8 toca las fotos. Los otros ocho las dejan como estan,
    // porque volver a escribir el titulo no puede costar una subida.
    photos: stepId === "fotos" ? answers.photos : draft.photos,
    // Solo el paso 5 declara los atributos. Una vez contestado, sigue
    // contestado: pasar por el paso 6 no lo pone en duda.
    featuresDeclared: stepId === "atributos" ? answers.featuresDeclared : draft.featuresDeclared,
    // Solo el paso 2 escribe la referencia.
    reference: stepId === "zona" ? answers.reference : draft.reference,
  };
}

/**
 * Que dice el boton principal, como codigo y no como frase — la copia en
 * espanol vive en la capa de entrega, igual que la de las violaciones.
 */
export type PrimaryAction = "continue" | "review" | "saveAndReturnToReview";

/**
 * **Regla 3 de la seccion 4: el boton cambia de contexto.**
 *
 * Al volver desde revisar dice "Guardar y volver a revisar", no "Seguir".
 * Quien entro desde revisar quiere volver ahi; mandarlo al paso siguiente lo
 * obliga a recorrer de nuevo los pasos que ya habia dado por buenos, que es
 * justo lo que la pantalla de revision existe para evitar.
 */
export function primaryActionFor(stepId: PublishStepId, returningToReview: boolean): PrimaryAction {
  if (returningToReview) return "saveAndReturnToReview";
  return stepId === PUBLISH_STEP_ORDER[PUBLISH_STEP_ORDER.length - 1] ? "review" : "continue";
}

/** Donde se va despues de guardar este paso. `"revisar"` no es un decimo paso. */
export function nextStepAfter(
  stepId: PublishStepId,
  returningToReview: boolean,
): PublishStepId | "revisar" {
  if (returningToReview) return "revisar";

  const next = PUBLISH_STEP_ORDER[PUBLISH_STEP_ORDER.indexOf(stepId) + 1];
  return next ?? "revisar";
}

/** Lo que cambio, en el vocabulario del borrador. La frase la arma la copia. */
export type ChangedField = keyof DraftListingValues | "photos" | "reference";

export interface DraftChange {
  readonly field: ChangedField;
  /** Vacio cuando antes no habia valor. */
  readonly before: string;
  readonly after: string;
}

/** El orden de comparacion es el orden de los pasos, para que el primer
 *  cambio reportado sea el que la persona acaba de hacer. */
const CHANGE_FIELDS: readonly ChangedField[] = [
  ...PUBLISH_STEP_ORDER.flatMap((step) => STEP_LISTING_FIELDS[step]),
  "photos",
  "reference",
];

function asText(value: unknown): string {
  if (value === undefined || value === null) return "";
  return String(value);
}

/**
 * **Regla 4 de la seccion 4: se dice que cambio.**
 *
 * "Cambiaste habitaciones de 2 a 3. El resto del aviso quedo como estaba."
 * Sin eso nadie sabe si se guardo, y quien no sabe si se guardo vuelve a
 * entrar al paso a comprobarlo — o publica sin comprobarlo, que es peor.
 *
 * Devuelve el PRIMER campo distinto, no todos: la frase que la pantalla dibuja
 * nombra uno, y un paso escribe un solo dato en el caso normal.
 */
export function describeDraftChange(
  before: PublicationDraft,
  after: PublicationDraft,
): DraftChange | null {
  for (const field of CHANGE_FIELDS) {
    if (field === "photos") {
      // Las fotos se comparan por cantidad: es el dato que la pantalla de
      // revisar muestra ("3 fotos · 449 KB") y el unico que significa algo
      // dicho en voz alta.
      if (before.photos.length !== after.photos.length) {
        return {
          field,
          before: String(before.photos.length),
          after: String(after.photos.length),
        };
      }
      continue;
    }

    const previous = field === "reference" ? before.reference : before.listing[field];
    const current = field === "reference" ? after.reference : after.listing[field];

    if (asText(previous) !== asText(current)) {
      return { field, before: asText(previous), after: asText(current) };
    }
  }

  return null;
}

/** Reconoce un segmento de URL como paso, sin confiar en lo que llego. */
export function parseStepId(value: string | undefined): PublishStepId | null {
  return PUBLISH_STEP_ORDER.find((step) => step === value) ?? null;
}
