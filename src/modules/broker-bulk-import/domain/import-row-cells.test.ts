import { describe, expect, it } from "vitest";
import type { ImportRow } from "./csv-import-rows";
import { importRowCells, offendingCellsFor } from "./import-row-cells";

/**
 * tasks.md 9.29 — la mitad de la lámina 14g que la 9.26 anotó como desvío:
 * «el valor ofensor va resaltado en su propia celda, además del texto del
 * problema».
 *
 * **Las celdas son del ARCHIVO, no de la fila ya resuelta.** La tabla de 14g
 * muestra «El Rosal» en la columna Zona junto al problema «"El Rosal" no
 * existe en Maracaibo»; después de `applyResolvedLocations` esa celda es un
 * UUID (o nada, si la resolución falló). Por eso esta función se alimenta de
 * la fila cruda y no de la preparada, y por eso `run-import-validation.ts` le
 * pasa `rows` y no `preparedRows`.
 */

function row(overrides: Partial<ImportRow> = {}): ImportRow {
  return {
    externalReference: "MB-0114",
    title: "Apto 2 hab cerca del lago",
    description: "corta",
    priceUsd: "520",
    city: "Maracaibo",
    zone: "El Rosal",
    rooms: "2",
    ...overrides,
  };
}

describe("importRowCells — las cinco celdas que 14g dibuja, tal como venían en el archivo", () => {
  it("lleva referencia, precio, zona, habitaciones y título con el texto original de la fila", () => {
    expect(importRowCells(row())).toEqual({
      externalReference: "MB-0114",
      priceUsd: "520",
      zone: "El Rosal",
      rooms: "2",
      title: "Apto 2 hab cerca del lago",
      descriptionLength: 5,
    });
  });

  it("una celda ausente viaja como cadena vacía, nunca como undefined", () => {
    const cells = importRowCells({ title: "Apartamento 3 hab con puesto techado" });

    expect(cells.priceUsd).toBe("");
    expect(cells.zone).toBe("");
    expect(cells.externalReference).toBe("");
    expect(cells.rooms).toBe("");
    expect(cells.title).toBe("Apartamento 3 hab con puesto techado");
  });

  /**
   * «La descripción tiene 61 caracteres, hacen falta 120» (14g, fila 31). El
   * número tiene que contarse EXACTAMENTE como lo cuenta el validador, que
   * cuenta puntos de código y no unidades UTF-16: un emoji contado dos veces
   * haría que la pantalla acreditara caracteres que la regla no acredita.
   */
  it("cuenta la descripción en puntos de código, igual que el validador", () => {
    expect(importRowCells(row({ description: "a".repeat(61) })).descriptionLength).toBe(61);
    // Cuatro caracteres, ocho unidades UTF-16.
    expect(importRowCells(row({ description: "🏠🏠🏠🏠" })).descriptionLength).toBe(4);
  });
});

describe("offendingCellsFor — qué celda nombra cada código", () => {
  it("señala la celda del precio cuando el precio es el problema", () => {
    expect(offendingCellsFor(["priceUsd.invalid"])).toEqual(["priceUsd"]);
    expect(offendingCellsFor(["priceUsd.required"])).toEqual(["priceUsd"]);
  });

  it("señala varias celdas cuando la fila tiene varios problemas, sin repetirlas", () => {
    expect(offendingCellsFor(["priceUsd.required", "rooms.invalid", "title.required"])).toEqual([
      "priceUsd",
      "rooms",
      "title",
    ]);
    expect(offendingCellsFor(["zoneId.required", "zoneId.notInCity"])).toEqual(["zone"]);
  });

  /**
   * La descripción no es una de las cinco columnas de 14g, así que
   * `description.tooShort` no resalta ninguna celda: su problema se lee
   * entero en la columna Problema. Devolver `title` «porque es lo más
   * parecido» resaltaría un valor que está bien.
   */
  it("no resalta ninguna celda para un problema que ninguna de las cinco columnas muestra", () => {
    expect(offendingCellsFor(["description.tooShort"])).toEqual([]);
    expect(offendingCellsFor(["contactValue.required"])).toEqual([]);
  });

  /**
   * `ImportRowViolation` incluye `string` porque
   * `resolve-import-locations.ts` viaja como frase escrita. Una frase que
   * esta tabla no conoce no puede inventarle una celda.
   */
  it("una razón que no es ninguno de los códigos conocidos no resalta nada", () => {
    expect(offendingCellsFor(["«El Rosal» no existe en Maracaibo"])).toEqual([]);
  });
});
