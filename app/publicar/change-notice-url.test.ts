import { describe, expect, it } from "vitest";
import {
  type DraftChange,
  parseDraftChanges,
} from "../../src/modules/listing-publication/domain/publication-steps";
import { reviewPathFor } from "./change-notice-url";

/**
 * **El emisor y el lector del aviso de cambio, probados juntos.**
 *
 * Cada mitad funcionando por su lado es el defecto que este repositorio ya
 * cometió tres veces en una semana: un dato calculado, una pantalla lista para
 * dibujarlo y nadie uniéndolos. Acá la vuelta completa es la afirmación —
 * `submitStep` arma la dirección, `revisar/page.tsx` la lee, y lo que entra
 * tiene que ser lo mismo que sale.
 */

function urlOf(path: string): URL {
  return new URL(path, "https://rentas.com.ve");
}

function roundTrip(changes: readonly DraftChange[]): readonly DraftChange[] {
  const params = urlOf(reviewPathFor(changes)).searchParams;
  return parseDraftChanges(params.getAll("campo"), params.getAll("antes"), params.getAll("ahora"));
}

describe("reviewPathFor — la vuelta a revisar lleva lo que cambió", () => {
  it("devuelve los mismos cambios que se le dieron, en el mismo orden", () => {
    const changes: readonly DraftChange[] = [
      { field: "rooms", before: "2", after: "3" },
      { field: "areaM2", before: "78", after: "90" },
    ];

    expect(roundTrip(changes)).toEqual(changes);
  });

  it("sobrevive a un valor con espacios y signos, que es la mitad de los títulos", () => {
    const changes: readonly DraftChange[] = [
      { field: "title", before: "Apartamento 2 hab", after: "Apartamento 3 hab & puesto" },
    ];

    expect(roundTrip(changes)).toEqual(changes);
  });

  it("sin cambios vuelve a revisar sin cola, para que la pantalla no diga nada", () => {
    expect(reviewPathFor([])).toBe("/publicar/revisar");
  });

  /**
   * tasks.md 18.19 — **el largo de la dirección, medido y no prometido.**
   *
   * Una prueba que dijera «más corta» aceptaría cualquier mejora, incluida una
   * inútil. Acá se cuentan los caracteres de la dirección que sale, y también
   * los de la que salía antes, porque el defecto era un número: el día que un
   * proxy corte por largo de URL, el paso se guarda y la vuelta a revisar falla.
   */
  describe("reviewPathFor — la descripción no entra en una barra de direcciones", () => {
    /** 1.200 caracteres, el máximo que el validador acepta. */
    const NUEVA = "Apartamento amplio y luminoso con vista al Ávila. ".repeat(24);
    const VIEJA = "Piso alto con vista abierta, cocina equipada y vigilancia 24 horas.";
    const CAMBIO: readonly DraftChange[] = [{ field: "description", before: VIEJA, after: NUEVA }];

    /** La forma anterior a la 18.19: el valor entero, una vez por lado. */
    function direccionAnterior(changes: readonly DraftChange[]): string {
      const params = new URLSearchParams();
      for (const change of changes) {
        params.append("campo", change.field);
        params.append("antes", change.before);
        params.append("ahora", change.after);
      }
      return `/publicar/revisar?${params.toString()}`;
    }

    it("manda la medida de la descripción, nunca la descripción", () => {
      expect([...NUEVA].length).toBe(1200);
      expect([...VIEJA].length).toBe(67);

      expect(reviewPathFor(CAMBIO)).toBe("/publicar/revisar?campo=description&antes=67&ahora=1200");
    });

    it("la dirección mide 55 caracteres donde medía 1.438", () => {
      expect(direccionAnterior(CAMBIO)).toHaveLength(1_438);
      expect(reviewPathFor(CAMBIO)).toHaveLength(55);
    });

    it("y con acentos, que es como se escribe en castellano, medía más de 7 KB", () => {
      // Cada acento son seis caracteres codificados (`%C3%B3`), y son los que
      // llevaban la dirección a kilobytes: es el número que la 18.19 nombra.
      const acentuada = [{ field: "description" as const, before: VIEJA, after: "ó".repeat(1200) }];

      expect(direccionAnterior(acentuada).length).toBeGreaterThan(7_000);
      expect(reviewPathFor(acentuada)).toHaveLength(55);
    });

    it("la dirección no crece con la descripción, que es lo que se arregló", () => {
      const enorme = [{ field: "description" as const, before: VIEJA, after: NUEVA.repeat(1) }];
      const diminuta = [{ field: "description" as const, before: VIEJA, after: "corta" }];

      expect(reviewPathFor(enorme).length - reviewPathFor(diminuta).length).toBe(3);
    });

    it("y revisar sigue sabiendo que la descripción cambió, que es lo que dibuja", () => {
      expect(roundTrip(CAMBIO)).toEqual([{ field: "description", before: "67", after: "1200" }]);
    });

    it("una descripción escrita donde no había ninguna también cambia", () => {
      expect(roundTrip([{ field: "description", before: "", after: NUEVA }])).toEqual([
        { field: "description", before: "0", after: "1200" },
      ]);
    });
  });

  it("va a revisar y no a otra pantalla", () => {
    expect(urlOf(reviewPathFor([{ field: "rooms", before: "2", after: "3" }])).pathname).toBe(
      "/publicar/revisar",
    );
  });
});
