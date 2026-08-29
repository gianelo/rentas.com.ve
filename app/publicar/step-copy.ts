import type {
  ChangedField,
  DraftChange,
  PrimaryAction,
  PublicationDraft,
  PublishStepId,
} from "../../src/modules/listing-publication/domain/publication-steps";

/**
 * El espanol que lee quien publica, mapeado desde los codigos del dominio.
 *
 * El dominio devuelve `PrimaryAction` y `DraftChange` en vez de frases por la
 * misma razon por la que devuelve codigos de violacion: prosa en el validador
 * seria espanol incrustado en la capa que la importacion de cartera en lote
 * tambien llama. El costo de esa decision es un riesgo — un codigo sin copia —
 * y se paga aca con `Record`s sobre las uniones, asi que agregar un paso o una
 * accion deja este archivo sin compilar hasta que alguien escriba la frase.
 *
 * Cada texto sale de las laminas (`Rentas - Publicar - Mobile.dc.html` y
 * `- Desktop.dc.html`), no de una reescritura de memoria.
 */

export interface StepCopy {
  /** 1 a 9. La barra de movil y el riel de escritorio lo dibujan. */
  readonly number: number;
  /** Lo corto, para el riel: "Tamaño", "Qué tiene". */
  readonly railLabel: string;
  /** El titular de 24 px. Una pregunta por pantalla. */
  readonly question: string;
  /**
   * Debajo del titular, y solo cuando el control NO lo dice ya. La regla
   * transversal 3 es explicita: el campo dice "Buscá tu zona", asi que un
   * subtitulo que repita "escribi las primeras letras" sobra.
   */
  readonly help?: string;
}

export const STEP_COPY: Record<PublishStepId, StepCopy> = {
  tipo: { number: 1, railLabel: "Tipo", question: "¿Qué vas a alquilar?" },
  zona: { number: 2, railLabel: "Zona", question: "¿En qué zona queda?" },
  precio: {
    number: 3,
    railLabel: "Precio",
    question: "¿Cuánto pedís al mes?",
    help: "En dólares, sin centavos.",
  },
  tamano: {
    number: 4,
    railLabel: "Tamaño",
    question: "¿Cómo es de grande?",
    help: "Un estudio cuenta como 1 habitación. Si no tiene estacionamiento, dejalo en 0.",
  },
  atributos: {
    number: 5,
    railLabel: "Qué tiene",
    question: "¿Qué tiene?",
    help: "Marcá lo que tenga. Lo que dejes sin marcar no se menciona en el aviso.",
  },
  titulo: {
    number: 6,
    railLabel: "Título",
    question: "Ponele un título",
    help: "Lo más importante primero. Es lo que se lee en la lista.",
  },
  descripcion: {
    number: 7,
    railLabel: "Descripción",
    question: "Contá lo que no se ve en las fotos",
  },
  fotos: { number: 8, railLabel: "Fotos", question: "Subí las fotos", help: "Entre 1 y 6." },
  quien: { number: 9, railLabel: "Quién publica", question: "¿Quién publica?" },
};

export const PRIMARY_ACTION_LABEL: Record<PrimaryAction, string> = {
  continue: "Seguir",
  review: "Revisar el aviso",
  // Criterio de aceptacion 11. Quien entro desde revisar quiere volver ahi, y
  // un boton que dice "Seguir" le promete el paso siguiente.
  saveAndReturnToReview: "Guardar y volver a revisar",
};

const PROPERTY_TYPE_LABEL: Record<string, string> = {
  apartamento: "Apartamento",
  casa: "Casa",
  quinta: "Quinta",
  anexo: "Anexo",
  habitacion: "Habitación",
};

const PUBLISHER_TYPE_LABEL: Record<string, string> = {
  owner: "Dueño",
  broker: "Inmobiliaria",
};

const CONTACT_METHOD_LABEL: Record<string, string> = {
  whatsapp: "WhatsApp",
  telefono: "Llamada",
  email: "Correo",
};

export const FEATURE_LABELS = [
  ["hasPowerPlant", "Planta eléctrica"],
  ["hasRegularWater", "Agua regular"],
  ["isFurnished", "Amoblado"],
  ["hasSecurity", "Vigilancia 24 h"],
  ["hasAppliances", "Línea blanca"],
] as const;

/** Lo que la pantalla sabe y el borrador no: el nombre detras de un id. */
export interface DraftNames {
  readonly zoneName?: string;
  readonly cityName?: string;
}

function declaredFeatures(draft: PublicationDraft): number {
  return FEATURE_LABELS.filter(([field]) => draft.listing[field] === true).length;
}

/**
 * Lo que el riel de escritorio muestra en lugar del numero del paso.
 *
 * **Cada paso hecho muestra SU VALOR** — "Altamira", "$450 al mes" — porque en
 * 1280 se ve el mapa entero y se puede saltar: la diferencia entre saber
 * cuanto falta y poder hacer algo al respecto.
 *
 * `null` para un paso sin contestar, y tambien para uno cuyo valor no se
 * puede nombrar: un `zone_id` crudo en el riel no le dice nada a nadie.
 */
export function stepSummary(
  stepId: PublishStepId,
  draft: PublicationDraft,
  names: DraftNames,
): string | null {
  const { listing } = draft;

  switch (stepId) {
    case "tipo":
      return listing.propertyType ? (PROPERTY_TYPE_LABEL[listing.propertyType] ?? null) : null;

    case "zona":
      return names.zoneName ?? null;

    case "precio":
      return listing.priceUsd === undefined || Number.isNaN(listing.priceUsd)
        ? null
        : `$${listing.priceUsd} al mes`;

    case "tamano":
      return listing.rooms !== undefined && listing.areaM2 !== undefined
        ? `${listing.rooms} hab · ${listing.areaM2} m²`
        : null;

    case "atributos": {
      if (draft.featuresDeclared !== true) return null;
      const declared = declaredFeatures(draft);
      // "0 atributos" se lee como un paso que fallo. Quien contesto "No tiene
      // ninguna" contesto, y el riel tiene que decirlo asi.
      return declared === 0 ? "Ninguno" : `${declared} atributos`;
    }

    case "titulo":
      return listing.title ? "Título" : null;

    case "descripcion":
      return listing.description ? "Descripción" : null;

    case "fotos":
      return draft.photos.length === 0
        ? null
        : `${draft.photos.length} ${draft.photos.length === 1 ? "foto" : "fotos"}`;

    case "quien": {
      const who = listing.publisherType ? PUBLISHER_TYPE_LABEL[listing.publisherType] : undefined;
      const how = listing.contactMethod ? CONTACT_METHOD_LABEL[listing.contactMethod] : undefined;
      return who && how ? `${who} · ${how}` : null;
    }
  }
}

/**
 * Como se nombra cada campo en la frase de "que cambio".
 *
 * Los cinco atributos comparten un solo nombre a proposito: "Cambiaste
 * hasPowerPlant de false a true" no es una frase que alguien pueda usar. Lo
 * que cambio es lo que el aviso declara, y asi se dice.
 */
const CHANGE_FIELD_LABEL: Record<ChangedField, string> = {
  propertyType: "el tipo de propiedad",
  cityId: "la ciudad",
  zoneId: "la zona",
  priceUsd: "el precio",
  rooms: "habitaciones",
  bathrooms: "baños",
  parkingSpots: "puestos de auto",
  areaM2: "metros cuadrados",
  hasPowerPlant: "lo que tiene la propiedad",
  hasRegularWater: "lo que tiene la propiedad",
  isFurnished: "lo que tiene la propiedad",
  hasSecurity: "lo que tiene la propiedad",
  hasAppliances: "lo que tiene la propiedad",
  title: "el título",
  description: "la descripción",
  publisherType: "quién publica",
  contactMethod: "cómo te contactan",
  contactValue: "tu dato de contacto",
  photos: "las fotos",
  reference: "la referencia",
};

/** Los campos cuyo valor no se dice en voz alta, solo el hecho de que cambio. */
const OPAQUE_CHANGE_FIELDS = new Set<ChangedField>([
  "hasPowerPlant",
  "hasRegularWater",
  "isFurnished",
  "hasSecurity",
  "hasAppliances",
  "description",
]);

function changeValue(field: ChangedField, value: string): string {
  return field === "priceUsd" ? `$${value}` : value;
}

const UNCHANGED = "El resto del aviso quedó como estaba.";

/** Una vez cada una: los cinco atributos comparten etiqueta a proposito. */
function addOnce(clauses: string[], clause: string): void {
  if (!clauses.includes(clause)) clauses.push(clause);
}

/** "a", "a y b", "a, b y c" — el espanol no lleva coma antes de la "y". */
function joinClauses(clauses: readonly string[]): string {
  if (clauses.length === 1) return clauses[0] as string;
  return `${clauses.slice(0, -1).join(", ")} y ${clauses[clauses.length - 1]}`;
}

/**
 * **Regla 4 de la seccion 4, dicha como la escribe el diseno:** "Cambiaste
 * habitaciones de 2 a 3. El resto del aviso quedó como estaba."
 *
 * La segunda oracion no es relleno. Es la unica prueba que recibe quien
 * corrigio un paso de que los otros ocho siguen ahi — y sin ella, la salida
 * razonable es volver a recorrerlos para comprobarlo. Por eso **se nombran
 * todos los campos que cambiaron**: con uno solo, esa segunda oracion afirma
 * de los demas algo que no es cierto.
 *
 * Dos verbos y no uno, cada uno con sus campos: "Cambiaste X de A a B" y
 * "Pusiste Y en C". Mezclarlos en una sola oracion produce "Cambiaste
 * habitaciones de 2 a 3 y metros cuadrados de  a 90", con un hueco donde
 * nunca hubo un valor anterior.
 *
 * `null` cuando no cambio nada, y el silencio no es una omision: un aviso que
 * dice "cambiaste" sin que nadie haya cambiado nada ensena a desconfiar del
 * mensaje justo cuando el mensaje es lo unico que distingue "se guardó" de
 * "se perdió".
 */
export function changeNoticeMessage(changes: readonly DraftChange[]): string | null {
  if (changes.length === 0) return null;

  const changed: string[] = [];
  const added: string[] = [];

  for (const change of changes) {
    const label = CHANGE_FIELD_LABEL[change.field];

    if (OPAQUE_CHANGE_FIELDS.has(change.field)) {
      addOnce(changed, label);
      continue;
    }

    if (change.before === "") {
      // No hubo cambio: hubo una respuesta donde no habia ninguna. Decir
      // "cambiaste de nada a X" describe algo que no paso.
      addOnce(added, `${label} en ${changeValue(change.field, change.after)}`);
      continue;
    }

    addOnce(
      changed,
      `${label} de ${changeValue(change.field, change.before)} a ${changeValue(change.field, change.after)}`,
    );
  }

  const sentences: string[] = [];
  if (changed.length > 0) sentences.push(`Cambiaste ${joinClauses(changed)}.`);
  if (added.length > 0) sentences.push(`Pusiste ${joinClauses(added)}.`);
  sentences.push(UNCHANGED);

  return sentences.join(" ");
}
