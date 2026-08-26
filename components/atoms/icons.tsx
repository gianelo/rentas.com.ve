/**
 * El conjunto CERRADO de dos SVG en línea (SISTEMA.md "Assets"; tasks.md
 * 14.37, RESUELTO por el fundador 2026-08-25). El resto del sistema sigue
 * siendo caracteres de texto — `←` `✓` `✱` `×` `·` — y la excepción existe
 * porque no hay carácter que signifique "filtro" sin ambigüedad, y `◎` se
 * lee como un ojo y no como una lupa.
 *
 * **Un tercer icono no se agrega acá: se discute.** La tabla de
 * `SISTEMA.md` es la lista completa. Ampliar este archivo con un tercer
 * export es cambiar el sistema, no usarlo (AGENTS.md §2).
 *
 * Los dos son `aria-hidden="true"` y `stroke="currentColor"` — heredan el
 * color como lo haría un carácter, y el nombre accesible lo da SIEMPRE el
 * control que los envuelve (`aria-label` en el enlace, o texto visible al
 * lado), nunca el SVG.
 */

/** La lupa. Vive dentro de un control con `aria-label="Buscar"`. */
export function MagnifierIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="6.8" cy="6.8" r="4.3" />
      <path d="M10.1 10.1 14 14" />
    </svg>
  );
}

/** Las tres rayas del filtro. Va siempre junto a su etiqueta visible o su `aria-label`. */
export function FilterIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M2.5 4h11M4.5 8h7M6.5 12h3" />
    </svg>
  );
}
