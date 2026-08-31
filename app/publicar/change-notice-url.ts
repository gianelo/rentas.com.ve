import { carriedChangeValue } from "../../src/modules/listing-publication/domain/carried-value";
import type { DraftChange } from "../../src/modules/listing-publication/domain/publication-steps";

/**
 * Adónde se vuelve después de corregir un paso desde revisar, y qué lleva.
 *
 * **Los tres pedazos viajan sueltos y repetidos, uno por campo**, en vez de la
 * frase ya armada: la prosa vive en `step-copy`, no en una barra de
 * direcciones, y un paso escribe hasta cuatro campos de una sola vez.
 *
 * Viaja en la dirección y no en la cookie del borrador porque el redirect es
 * lo que hace que el botón de atrás y un refresh se comporten — y porque esa
 * cookie ya va justa de espacio con nueve pasos adentro.
 *
 * Sin cambios no lleva cola. Es lo que hace que quien abrió un paso y volvió
 * sin tocar nada no reciba un "cambiaste" sobre algo que no cambió.
 *
 * **Lo que viaja de cada campo lo decide el dominio** (tasks.md 18.19), no
 * este archivo: `carriedChangeValue` manda la medida de los campos cuyo valor
 * la pantalla no dibuja. Corregir el paso 7 mandaba la descripción entera dos
 * veces —1.438 caracteres de dirección en ASCII, más de 7.000 con acentos—, y
 * el día que un proxy corte por largo de URL el paso se guarda y la vuelta a
 * revisar falla: se escribe y se pierde el aviso de lo que se escribió.
 */
export function reviewPathFor(changes: readonly DraftChange[]): string {
  const params = new URLSearchParams();

  for (const change of changes) {
    params.append("campo", change.field);
    params.append("antes", carriedChangeValue(change.field, change.before));
    params.append("ahora", carriedChangeValue(change.field, change.after));
  }

  const query = params.toString();
  return query === "" ? "/publicar/revisar" : `/publicar/revisar?${query}`;
}
