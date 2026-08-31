import type { ChangedField } from "./publication-steps";
import { characterCount } from "./publishable-listing";

/**
 * **Qué vuelve en una dirección, y qué no** (tasks.md 18.19 y 18.25).
 *
 * Publicar y editar son las dos pantallas que se niegan sin una línea de
 * JavaScript, así que lo único que tienen para devolverle un valor a la
 * persona es la barra de direcciones. Las dos tareas son la misma pregunta
 * hecha dos veces:
 *
 * - la 18.19 midió que el valor entero **no cabe** — corregir la descripción
 *   desde revisar mandaba sus 1.200 caracteres dos veces, y el día que un
 *   proxy corte por largo de URL el paso se guarda y la vuelta a revisar falla;
 * - la 18.25 necesita **exactamente ese valor** para poder decir «Vas 24» sobre
 *   la descripción que se acaba de escribir, y no sobre la que está guardada.
 *
 * La respuesta a las dos es la misma y es una asimetría: **vuelve la medida,
 * nunca el texto**. Un largo son cuatro dígitos; una descripción son 1.200
 * caracteres que codificados pesan miles. Y la medida es lo único que las dos
 * pantallas dibujan de esos campos — el aviso de cambio dice «Cambiaste la
 * descripción» sin decir cuál, y la negativa dice cuánto falta.
 *
 * **Vive en el dominio y no en `app/`** porque decide qué viaja y qué se le
 * cree a una dirección, que es producto y no pixeles (AGENTS.md §1), y porque
 * las dos pantallas tienen que contestar lo mismo: dos copias de esta regla es
 * como una termina transportando lo que la otra ya dejó de dibujar.
 */

/**
 * Los campos cuyo valor no se dice en voz alta, sólo el hecho de que cambió.
 *
 * **Era una lista privada de `app/publicar/step-copy.ts`** y subió acá entera,
 * sin abrir una segunda: quien decide que la descripción no se dibuja es quien
 * tiene que decidir que tampoco viaja. Separadas, la de arriba dejaría de
 * dibujar un campo y la de abajo seguiría cargándolo por la URL.
 */
export const OPAQUE_CHANGE_FIELDS: ReadonlySet<ChangedField> = new Set<ChangedField>([
  "hasPowerPlant",
  "hasRegularWater",
  "isFurnished",
  "hasSecurity",
  "hasAppliances",
  "description",
]);

/**
 * Lo que viaja de un campo que cambió: su valor, o su medida cuando el valor
 * no se dibuja.
 *
 * **La medida sigue sirviendo para comparar**, que es lo único que el lector
 * hace con el par: `parseDraftChanges` descarta un cambio cuyo antes y después
 * son iguales, y dos descripciones distintas casi nunca miden lo mismo. Mandar
 * dos cadenas vacías habría ahorrado los mismos bytes y convertido esa puerta
 * en un pase libre, porque `""` es siempre igual a `""` — una URL escrita a
 * mano habría anunciado un cambio inexistente sin nada que la contradiga.
 *
 * Puntos de código, igual que `validatePublishableListing`: contar unidades
 * UTF-16 acá le daría a un emoji el doble de lo que la regla le da.
 */
export function carriedChangeValue(field: ChangedField, value: string): string {
  return OPAQUE_CHANGE_FIELDS.has(field) ? String(characterCount(value)) : value;
}

/**
 * La medida de un valor que se envió, o nada si no se envió ninguno.
 *
 * **`undefined` no es cero**, y la diferencia es la que separa un contador de
 * una mentira: quien no contestó el campo no escribió cero caracteres, así que
 * la frase que lo recibe dice el límite y se calla el «Vas N».
 */
export function measureOf(value: string | undefined): number | undefined {
  return value === undefined ? undefined : characterCount(value);
}

/**
 * Cuántos dígitos se aceptan como medida. Siete ya sobran sobre un máximo de
 * 1.200 caracteres, y el tope existe para que una dirección escrita a mano no
 * pueda dibujar «Vas 999999999999» en la cara de nadie.
 */
const MAX_MEASURE_DIGITS = 7;

const MEASURE = new RegExp(`^\\d{1,${MAX_MEASURE_DIGITS}}$`);

/**
 * La medida que trajo una dirección, o nada.
 *
 * **Falla cerrado** (AGENTS.md §7): un parámetro es una afirmación de afuera,
 * no un hecho. `Number("")` es 0 y `Number(" 24")` es 24, así que un `Number`
 * a secas convertiría un parámetro ausente, vacío o con basura adentro en un
 * contador que dice un número que nadie escribió — que es exactamente el
 * defecto que la 18.25 nombra. Un número ausente es preferible a uno
 * inventado, y quien lo recibe dice la frase sin contador.
 */
export function readCarriedMeasure(value: string | undefined): number | undefined {
  if (value === undefined || !MEASURE.test(value)) return undefined;
  return Number(value);
}
