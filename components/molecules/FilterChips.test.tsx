import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { FilterChip } from "@/modules/listing-search/domain/search-panel";
import { FilterChips } from "./FilterChips";

const CHIPS: readonly FilterChip[] = [
  {
    label: "Chacao",
    removeHref: "/alquiler/distrito-capital/altamira",
    removeLabel: "Quitar Chacao",
  },
  {
    label: "Hasta $700",
    removeHref: "/alquiler/distrito-capital",
    removeLabel: "Quitar Hasta $700",
  },
];

function render(chips: readonly FilterChip[] = CHIPS, clearAllHref = "/alquiler/distrito-capital") {
  return renderToStaticMarkup(<FilterChips chips={chips} clearAllHref={clearAllHref} />);
}

describe("las fichas quitables de la lámina 7c", () => {
  it("sin filtros puestos no dibuja nada: una fila vacía es cromo", () => {
    expect(render([])).toBe("");
  });

  it("cada filtro puesto se lee, y se saca sin abrir el panel", () => {
    const markup = render();

    expect(markup).toContain("Chacao");
    expect(markup).toContain("Hasta $700");
    expect(markup).toContain('href="/alquiler/distrito-capital/altamira"');
  });

  it("el «×» lleva su etiqueta al lado, porque solo no se lee en voz alta", () => {
    const markup = render();

    // El glifo es un carácter y va `aria-hidden`; lo que un lector anuncia es
    // la etiqueta que el dominio escribió.
    expect(markup).toContain('aria-label="Quitar Chacao"');
    expect(markup).toContain('aria-hidden="true"');
  });

  it("«Limpiar todo» va al lado de las fichas, como en la lámina", () => {
    const markup = render();

    expect(markup).toContain("Limpiar todo");
  });

  it("no cuelga ni un manejador de eventos: son direcciones", () => {
    expect(render()).not.toMatch(/onclick|onchange|oninput|onsubmit/i);
  });
});

/**
 * **Las fichas se van del teléfono, y sólo del teléfono** (14.53, decisión del
 * fundador del 2026-09-02: *«sí quítalos, ocupan mucho espacio»*).
 *
 * A 360 px las cinco fichas se pliegan a cuatro líneas y se llevan **154 px**
 * antes de la primera foto, que es la mitad del hueco que la 14.29 mide. La
 * lámina 6c no las dibuja: pone el número de filtros activos dentro de la
 * pastilla. La 7c sí, y ahí entran en un renglón y no cuestan nada.
 *
 * **Se esconden con CSS y NO se dejan de dibujar, y la razón es dura: el
 * servidor no sabe el ancho de la pantalla.** No hay ancho en una petición.
 * Decidirlo en el servidor pediría o husmear el `User-Agent` —poco fiable, y
 * además rompe una sola respuesta cacheable para todos los anchos— o decidirlo
 * en el cliente, que contradice el piso de AGENTS.md §2: el camino de lectura
 * funciona con el script apagado. `display: none` además saca al enlace del
 * árbol de accesibilidad y del orden de tabulación, así que no queda una parada
 * invisible; lo que sí queda son sus bytes, y ése es el precio que se paga.
 *
 * Lo que se afirma acá es lo DECLARADO. Lo dibujado lo mide
 * `tests/measure/lista.spec.ts` en un navegador de verdad, a los dos anchos.
 */
describe("las fichas y el ancho de la pantalla (14.53)", () => {
  const css = readFileSync("components/molecules/FilterChips.module.css", "utf-8");

  /** El bloque base, o sea antes de cualquier `@media`. */
  const base = css.slice(0, css.indexOf("@media"));
  /** Lo que enciende el escritorio, que es el único `@media (min-width: 768px)`. */
  const escritorio = css.slice(css.indexOf("@media (min-width: 768px)"));

  it("no se dibujan en el ancho base, que es el del teléfono", () => {
    expect(bloque(base, "chips")).toMatch(/display:\s*none/);
  });

  /**
   * **La mitad positiva, y sin ella la de arriba pasa con las fichas muertas en
   * todas partes.** El escritorio las enciende, en el mismo punto de quiebre en
   * el que la cuadrícula pasa a cuatro columnas — 7c es la lámina de los dos.
   */
  it("vuelven en escritorio, en el mismo quiebre que la cuadrícula", () => {
    expect(bloque(escritorio, "chips")).toMatch(/display:\s*flex/);
  });

  /**
   * **El marcado no cambia con el ancho.** Es la otra mitad de la decisión: si
   * alguien lo resolviera dejando de dibujar el componente, esta prueba no lo
   * vería, pero la de arriba sí — y ésta fija que el enlace real sigue emitido
   * para quien lo mire con el script apagado en un escritorio.
   */
  it("sigue emitiendo los enlaces: lo que cambia es la hoja, no el HTML", () => {
    expect(render()).toContain('href="/alquiler/distrito-capital/altamira"');
  });
});

function bloque(css: string, selector: string): string {
  const match = css.match(new RegExp(`\\.${selector}\\s*\\{([^}]*)\\}`));
  if (!match) throw new Error(`falta el bloque .${selector}`);
  return match[1] ?? "";
}
