/**
 * El conjunto de SVG en línea de SISTEMA.md "Assets": dos cerrados por
 * decisión del fundador (tasks.md 14.37, 2026-08-25) más un tercero admitido
 * como excepción de marca (tasks.md 22.20, DESBLOQUEADO 2026-09-05). El resto
 * del sistema sigue siendo caracteres de texto — `←` `✓` `✱` `×` `·` — y la
 * excepción de los dos primeros existe porque no hay carácter que signifique
 * "filtro" sin ambigüedad, y `◎` se lee como un ojo y no como una lupa.
 *
 * **Un cuarto icono de interfaz no se agrega acá: se discute.** La tabla de
 * `SISTEMA.md` es la lista completa. `GoogleMark` no abre esa puerta: las
 * reglas de marca de Google exigen su logo exacto, así que no es una decisión
 * de icono propio que este sistema pueda derivar — es una excepción, con su
 * razón escrita en `SISTEMA.md`.
 *
 * `MagnifierIcon` y `FilterIcon` son `aria-hidden="true"` y
 * `stroke="currentColor"` — heredan el color como lo haría un carácter.
 * `GoogleMark` es `aria-hidden="true"` también, pero NO hereda color: sus
 * cuatro colores son parte de la marca y no del tema. El nombre accesible lo
 * da SIEMPRE el control que envuelve al SVG (`aria-label`, o texto visible al
 * lado — el botón que lo usa ya dice «Continuar con Google»), nunca el SVG.
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

/**
 * El disco de cuatro colores de Google (tasks.md 22.20). Va siempre dentro de
 * un botón cuyo texto visible ya dice «Continuar con Google» — nunca es su
 * propio nombre accesible.
 *
 * **Los cuatro `fill` son literales y no `currentColor` a propósito.** Son
 * los colores exactos de la marca; heredar el color del texto los rompería,
 * al revés que `MagnifierIcon` y `FilterIcon`.
 */
export function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.961L3.964 7.293C4.672 5.166 6.656 3.58 9 3.58z"
      />
    </svg>
  );
}
