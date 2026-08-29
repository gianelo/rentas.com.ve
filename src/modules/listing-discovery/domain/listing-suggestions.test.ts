import { describe, expect, it } from "vitest";
import {
  SUGGESTION_LIMIT,
  suggestFromCity,
  suggestFromZone,
  suggestionHeading,
} from "./listing-suggestions";

const VIEWED = "aviso-vencido";

function candidate(id: string) {
  return { id, title: `Aviso ${id}` };
}

describe("suggestFromZone", () => {
  /**
   * **La primera parada, y la que casi siempre alcanza** (11.10, 11.12). Quien
   * llega a una ficha vencida desde Google escribió la zona exacta: lo que
   * sigue buscando está en esa zona, no en la ciudad entera.
   */
  it("resuelve con los avisos de la zona sin ampliar nada", () => {
    const step = suggestFromZone([candidate("a"), candidate("b")], VIEWED);

    expect(step).toEqual({
      kind: "resolved",
      outcome: { scope: "zone", listings: [candidate("a"), candidate("b")] },
    });
  });

  /** 11.10 — la zona sin avisos activos es lo único que dispara la ampliación. */
  it("una zona sin avisos activos pide ampliar", () => {
    expect(suggestFromZone([], VIEWED)).toEqual({ kind: "widen" });
  });

  /**
   * **El aviso que se ve nunca se sugiere a sí mismo**, y la exclusión ocurre
   * ANTES de decidir si se amplía. Sin ese orden, una zona cuyo único activo es
   * el propio aviso resolvería con una lista de uno que enlaza a la página que
   * ya se está mirando: la salida que la ficha vencida existe para ofrecer,
   * llevando de vuelta al callejón sin salida.
   *
   * El caso llega de verdad: `status` lo mueve un trabajo programado y un
   * trabajo programado corre tarde, así que hay una ventana en la que la fila
   * todavía dice `active` —y la búsqueda la devuelve— mientras el reloj del
   * aviso ya venció. Es la misma ventana que la 11.13 documenta del lado del
   * sitemap.
   */
  it("no se sugiere a sí mismo, y por eso una zona de sólo él pide ampliar", () => {
    expect(suggestFromZone([candidate(VIEWED)], VIEWED)).toEqual({ kind: "widen" });
  });

  it("descarta el propio aviso y conserva a los demás", () => {
    const step = suggestFromZone([candidate("a"), candidate(VIEWED), candidate("b")], VIEWED);

    expect(step.kind === "resolved" && step.outcome.listings).toEqual([
      candidate("a"),
      candidate("b"),
    ]);
  });

  /**
   * **El tope es del producto, no de la pantalla.** La cuadrícula dibuja dos
   * columnas en el teléfono y cuatro en escritorio, así que cuatro llenan una
   * fila entera en escritorio y exactamente dos en el teléfono. Más que eso
   * convierte la ficha vencida en una segunda pantalla de resultados, que ya
   * existe y está a un enlace de distancia.
   */
  it("corta en el tope y respeta el orden que trajo la búsqueda", () => {
    const many = ["a", "b", "c", "d", "e", "f"].map(candidate);

    const step = suggestFromZone(many, VIEWED);

    expect(step.kind === "resolved" && step.outcome.listings).toEqual(
      many.slice(0, SUGGESTION_LIMIT),
    );
    expect(SUGGESTION_LIMIT).toBeGreaterThan(0);
  });
});

describe("suggestFromCity", () => {
  /** 11.10 — se amplía a la ciudad, y la ampliación se dice en el resultado. */
  it("resuelve con los avisos de la ciudad y lo declara", () => {
    expect(suggestFromCity([candidate("a")], VIEWED)).toEqual({
      scope: "city",
      listings: [candidate("a")],
    });
  });

  /**
   * **Una ciudad sin nada no muestra nada** (11.10, y `design.md`: "Suggestions
   * never cross city. Widen zone → city, never city → country").
   *
   * Ofrecer un aviso de la otra ciudad sería peor que no ofrecer ninguno: quien
   * llegó buscando en Maracaibo no se muda a Caracas porque una ficha vencida
   * se lo sugirió, y el aislamiento entre ciudades es la garantía sobre la que
   * se apoya el producto entero.
   */
  it("una ciudad sin avisos activos no sugiere nada", () => {
    expect(suggestFromCity([], VIEWED)).toEqual({ scope: "none", listings: [] });
  });

  it("tampoco se sugiere a sí mismo desde la ciudad", () => {
    expect(suggestFromCity([candidate(VIEWED)], VIEWED)).toEqual({
      scope: "none",
      listings: [],
    });
  });

  it("corta en el mismo tope que la zona", () => {
    const many = ["a", "b", "c", "d", "e", "f"].map(candidate);

    expect(suggestFromCity(many, VIEWED).listings).toEqual(many.slice(0, SUGGESTION_LIMIT));
  });

  /**
   * **No hay un tercer paso, y no es una convención: es el tipo.**
   * `suggestFromZone` puede pedir ampliar; `suggestFromCity` devuelve un
   * resultado y nada más. Escribir "y si la ciudad tampoco tiene, probá en la
   * otra" no es una decisión que alguien tome mal más adelante — es una rama
   * que no existe.
   */
  it("no puede pedir ampliar: su resultado no tiene esa forma", () => {
    const outcome = suggestFromCity([], VIEWED);

    expect(Object.keys(outcome).sort()).toEqual(["listings", "scope"]);
    expect(["city", "none"]).toContain(outcome.scope);
  });
});

describe("suggestionHeading", () => {
  const PLACE = { zoneName: "Tierra Negra", cityName: "Maracaibo" };

  /**
   * **El encabezado tiene que decir la verdad sobre lo que hay debajo.** Es la
   * mitad que sólo se ve cuando se amplía: escrito una sola vez, «Otros avisos
   * en Tierra Negra» quedaría encima de cuatro tarjetas de Bella Vista. Nadie
   * lo notaría en el caso común, porque en el caso común es verdad.
   */
  it("nombra la zona cuando las sugerencias son de la zona", () => {
    const heading = suggestionHeading("zone", PLACE);

    expect(heading).toContain("Tierra Negra");
    expect(heading).not.toContain("Maracaibo");
  });

  it("nombra la ciudad cuando se amplió, y dice que la zona no tenía", () => {
    const heading = suggestionHeading("city", PLACE);

    expect(heading).toContain("Maracaibo");
    expect(heading).toContain("Tierra Negra");
  });

  /**
   * Sin sugerencias no hay encabezado, y `null` es la forma de decirlo: una
   * cadena vacía dibujaría un `<h2>` hueco encima de nada.
   */
  it("no hay encabezado cuando no hay nada que ofrecer", () => {
    expect(suggestionHeading("none", PLACE)).toBeNull();
  });
});
