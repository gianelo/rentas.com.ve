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

  it("va a revisar y no a otra pantalla", () => {
    expect(urlOf(reviewPathFor([{ field: "rooms", before: "2", after: "3" }])).pathname).toBe(
      "/publicar/revisar",
    );
  });
});
