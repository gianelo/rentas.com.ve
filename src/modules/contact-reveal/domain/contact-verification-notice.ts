import { shortSpanishDate } from "../../../shared/format/spanish-date";
import { type ContactMethod, contactChannelNoun } from "./revealable-contact";

/**
 * Qué dice la ficha sobre la verificación del contacto que acaba de revelar
 * (tasks.md 16.12 y 16.34, láminas 10b de las dos Fichas).
 *
 * **La frase vive acá y no en el componente porque es producto** (AGENTS.md
 * §1). Lo que la pantalla AFIRMA sobre un número —quién lo comprobó y
 * cuándo— es exactamente la clase de decisión que el piso del 90% tiene que
 * alcanzar; el componente sólo dibuja la cadena que le llega, o nada.
 *
 * **`null` significa no verificado, y no hay nada que dibujar.** La ausencia
 * de fila en `verified_contact` ES la respuesta (tasks.md 19.9, AGENTS.md
 * §7): ningún valor por defecto convierte un hueco en un permiso. Las tres
 * láminas del bloque de contacto —sin cuenta, con cuenta y vencido— no
 * dibujan ningún estado negativo, así que «sin verificar» sería una pantalla
 * inventada además de una afirmación que nadie hizo.
 *
 * **Dice CUÁNDO, nunca «vigente».** Un aviso vive 30 días y puede publicarse
 * el último día de una verificación, así que los dos relojes se cruzan
 * (tasks.md 19.12): la fecha sigue siendo cierta el día después, y un estado
 * no.
 *
 * **El canal sale del método que se verificó.** Hoy el canal de WhatsApp
 * está diferido al final del proyecto (fundador, 2026-08-29) y la única fila
 * que se escribe es la del correo propio (19.10), así que un texto fijo
 * «por WhatsApp» certificaría un mensaje que nunca se mandó. Que el método
 * sea el correcto es estructural: `findEvidence` fija `method` y `value` en
 * la condición del `JOIN`, de modo que la fila que vuelve pertenece al mismo
 * triple que se preguntó.
 */
export function contactVerificationNotice(
  method: ContactMethod,
  verifiedAt: Date | null,
): string | null {
  if (!verifiedAt) return null;

  return `verificado por ${contactChannelNoun(method)} el ${shortSpanishDate(verifiedAt)}`;
}
