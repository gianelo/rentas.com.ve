import {
  IMPORT_BOOLEAN_COLUMNS,
  IMPORT_BOOLEAN_FALSE_VALUES,
  IMPORT_BOOLEAN_TRUE_VALUES,
  IMPORT_COLUMN_ALLOWLIST,
  type OptionalImportColumn,
} from "../../src/modules/broker-bulk-import/domain/csv-import-columns";
import type { ImportRowCells } from "../../src/modules/broker-bulk-import/domain/import-row-cells";
import {
  MIN_DESCRIPTION_CHARACTERS,
  type PublishViolation,
} from "../../src/modules/listing-publication/domain/publishable-listing";

/**
 * El castellano que lee una inmobiliaria en la vista previa (lámina 14g),
 * traducido desde los códigos estables del dominio.
 *
 * **La contraparte que `import-row-validation.ts` nombró y no existía.** Su
 * comentario dice, textualmente, que ensanchó `ImportRowViolation` a `string`
 * porque «este pipeline no tiene tabla de copia que la consuma
 * (`app/publicar/violation-copy.ts` no tiene contraparte de importación; la
 * UI de la 9.26 no existe todavía)». Existe ahora, acá — el mismo lugar y la
 * misma forma que `violation-copy.ts`, que es el precedente del repositorio
 * para "la copia vive en `app/`, la regla vive en el dominio".
 *
 * ## Por qué NO se reusa `PUBLISH_VIOLATION_COPY`
 *
 * Sus mensajes cuentan: «Mínimo 120 caracteres. Vas 24». Ese `24` salía de un
 * `PublishCopyContext` que la importación **no tenía**: `ImportRowError` sólo
 * llevaba `rowNumber` y `reasons`, nunca las celdas de la fila. Reusar esa
 * tabla sin contexto habría impreso «Vas 0» en cada fila, que no es menos
 * preciso: es falso.
 *
 * **La 9.29 cerró esa mitad, y sólo esa.** `ImportRowError.cells` ya lleva el
 * conteo de la descripción, así que `description.tooShort` dice el número que
 * 14g escribe. El resto de la tabla sigue sin contador y sigue siendo suya:
 * las dos tablas dicen cosas distintas porque el publicador corrige un campo
 * en pantalla y la inmobiliaria corrige un archivo en su computadora. Sin
 * celdas, cada frase vuelve a ser la de antes — un número ausente es
 * preferible a uno inventado.
 *
 * El costo de tener dos tablas —que se separen— lo paga la última prueba de
 * `import-copy.test.ts`, que recorre las claves REALES de la otra tabla en
 * tiempo de ejecución. `PublishViolation` es una unión cerrada y el
 * compilador obliga a `violation-copy.ts` a cubrirla entera;
 * `ImportRowViolation` incluye `string` y por eso acá el compilador no puede
 * hacerlo, así que lo hace esa prueba.
 */

/** El nombre de la columna tal como la inmobiliaria la escribió en su CSV. */
function headerOf(field: string): string {
  return IMPORT_COLUMN_ALLOWLIST.find((column) => column.field === field)?.header ?? field;
}

/**
 * `"si" o "no" — también valen "1" y "0"`, armado desde el vocabulario real
 * (`csv-import-columns.ts`) y no escrito a mano. Los dos primeros valores son
 * los que la lámina pone en la plantilla; los otros se nombran igual, porque
 * un archivo exportado de un ERP suele traer 1 y 0 y callarlo haría ver el
 * rechazo como un capricho.
 */
const [YES_PRIMARY = "si", ...YES_ALIASES] = IMPORT_BOOLEAN_TRUE_VALUES;
const [NO_PRIMARY = "no", ...NO_ALIASES] = IMPORT_BOOLEAN_FALSE_VALUES;
const BOOLEAN_ALIASES = [...YES_ALIASES, ...NO_ALIASES].map((value) => `"${value}"`);
const BOOLEAN_VOCABULARY =
  BOOLEAN_ALIASES.length === 0
    ? `"${YES_PRIMARY}" o "${NO_PRIMARY}"`
    : `"${YES_PRIMARY}" o "${NO_PRIMARY}" — también valen ${BOOLEAN_ALIASES.join(" y ")}`;

/**
 * Una entrada por columna de sí/no, derivada del MISMO allowlist que lee el
 * parser — nunca cinco frases copiadas a mano. Renombrar `planta_electrica`
 * mueve la regla y el mensaje a la vez, porque hay un solo lado.
 */
const BOOLEAN_COPY: Record<string, string> = Object.fromEntries(
  IMPORT_COLUMN_ALLOWLIST.filter((column) =>
    IMPORT_BOOLEAN_COLUMNS.has(column.header as OptionalImportColumn),
  ).map((column) => [
    `${column.field}.invalid`,
    `La columna «${column.header}» sólo acepta ${BOOLEAN_VOCABULARY}.`,
  ]),
);

/**
 * Todo lo que el publicador ya sabía decir, dicho sin contador: la fila no
 * viaja hasta acá, así que ninguna frase promete un número que no tiene.
 */
const PUBLISH_COPY: Record<PublishViolation, string> = {
  "publisherType.required": "Falta quién publica.",
  "publisherType.invalid": "Quién publica sólo puede ser dueño o inmobiliaria.",
  "propertyType.required": `Falta la columna «${headerOf("propertyType")}».`,
  "propertyType.invalid": `«${headerOf("propertyType")}» no es uno de los cinco tipos: apartamento, casa, quinta, anexo o habitacion.`,
  "title.required": `Falta el título («${headerOf("title")}»).`,
  "title.tooLong": "El título es más largo que el máximo permitido.",
  "description.required": `Falta la descripción («${headerOf("description")}»).`,
  "description.tooShort": "La descripción es más corta que el mínimo de caracteres.",
  "description.tooLong": "La descripción es más larga que el máximo permitido.",
  "priceUsd.required": "Falta el precio.",
  "priceUsd.invalid": "El precio tiene que ser un entero de dólares mayor que 0.",
  "cityId.required": `Falta la ciudad («${headerOf("city")}»).`,
  "cityId.unknown": "Esa ciudad no existe.",
  "zoneId.required": `Falta la zona («${headerOf("zone")}»).`,
  "zoneId.notInCity": "Esa zona no pertenece a esa ciudad.",
  // **Inalcanzable desde acá hoy, y la frase se escribe igual**, por la misma
  // razón que la 18.13 dejó vivos `cityId.required` y `cityId.unknown`: el
  // archivo de importación no tiene columna de referencia, así que ninguna
  // fila puede producir este código — pero el importador llama al MISMO
  // validador, y el día que la columna exista la frase ya está. Un `Record`
  // sobre la unión no admite el hueco, y eso es lo que se quiere.
  "reference.tooLong": "La referencia es más larga que el máximo permitido.",
  "rooms.required": `Faltan las habitaciones («${headerOf("rooms")}»).`,
  "rooms.invalid": "Las habitaciones van en números enteros. Un estudio cuenta como 1.",
  "areaM2.required": `Faltan los metros cuadrados («${headerOf("areaM2")}»).`,
  "areaM2.invalid": "Los metros cuadrados van en números enteros. Por ejemplo: 78.",
  "bathrooms.required": `Faltan los baños («${headerOf("bathrooms")}»).`,
  "bathrooms.invalid": "Los baños van en números enteros.",
  "parkingSpots.invalid": `«${headerOf("parkingSpots")}» va en números enteros, o vacío si no tiene.`,
  // Las dos de fotos no pueden salir de una fila importada — las fotos no van
  // en el CSV (lámina 14e) y un borrador nace con cero, que es legal hasta la
  // activación. Están porque la unión las trae, y una entrada ausente sería un
  // código crudo en pantalla el día que eso cambie.
  "photos.required": "Falta al menos una foto. Las fotos no van en el CSV: se suben después.",
  "photos.tooMany": "Ese aviso ya tiene todas las fotos que admite.",
  "contactMethod.required": "Tu cuenta no tiene un método de contacto configurado.",
  "contactMethod.invalid": "El método de contacto de tu cuenta no es válido.",
  "contactValue.required": "Tu cuenta no tiene un contacto configurado.",
  "contactValue.invalid": "El contacto de tu cuenta no tiene un formato válido.",
};

const REASON_COPY: Record<string, string> = { ...PUBLISH_COPY, ...BOOLEAN_COPY };

/**
 * Las frases que la fila puede completar con un número (tasks.md 9.29,
 * lámina 14g fila 31). **El mínimo se lee de `MIN_DESCRIPTION_CHARACTERS`**,
 * la misma constante que el validador aplica: dos «120» escritos aparte es
 * exactamente cómo un mensaje termina prometiendo un límite distinto del que
 * se rechaza.
 */
const COUNTED_COPY: Record<string, (cells: ImportRowCells) => string> = {
  "description.tooShort": (cells) =>
    `La descripción tiene ${cells.descriptionLength} caracteres, hacen falta ${MIN_DESCRIPTION_CHARACTERS}.`,
};

const IMPORT_ONLY_COPY: Record<string, string> = {
  "externalReference.required":
    "Falta la referencia externa: es el código con el que reconocés esta propiedad.",
  "externalReference.duplicateInFile":
    "Esta referencia externa aparece más de una vez en el archivo.",
};

/**
 * **El `??` no es un descuido, es el contrato del dominio.**
 * `resolve-import-locations.ts` devuelve frases ya escritas —«"Caracas" no es
 * una ciudad válida. Ciudades disponibles: …»— porque CUÁLES nombres existen
 * lo decide la fila y no una tabla fija. Traducirlas otra vez sería inventar;
 * pasan tal cual, que es lo que su propio comentario pide.
 */
export function importRowReasonText(reason: string, cells?: ImportRowCells): string {
  const counted = cells === undefined ? undefined : COUNTED_COPY[reason]?.(cells);
  return counted ?? REASON_COPY[reason] ?? IMPORT_ONLY_COPY[reason] ?? reason;
}
