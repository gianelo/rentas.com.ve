import { describe, expect, it } from "vitest";
import type { ImportRowCells } from "../../src/modules/broker-bulk-import/domain/import-row-cells";
import { PUBLISH_VIOLATION_COPY } from "../publicar/violation-copy";
import { importRowReasonText } from "./import-copy";

/**
 * La tabla de copia que `import-row-validation.ts` nombró y no existía: su
 * propio comentario dice que ensanchó `ImportRowViolation` a `string` porque
 * «este pipeline no tiene tabla de copia que la consuma (`app/publicar/
 * violation-copy.ts` no tiene contraparte de importación; la UI de la 9.26 no
 * existe todavía)». Ésta es esa contraparte.
 *
 * **Dos clases de razón, y la diferencia es del dominio, no de esta tabla.**
 * Los códigos estables (`price.required`) se traducen acá. Los mensajes que
 * `resolve-import-locations.ts` ya escribe en castellano —porque QUÉ ciudades
 * existen lo decide la fila, no una tabla fija— viajan tal cual.
 */
const CELLS_CON_DESCRIPCION_CORTA: ImportRowCells = {
  externalReference: "TN-0091",
  priceUsd: "640",
  zone: "Tierra Negra",
  rooms: "4",
  title: "Quinta con piscina",
  descriptionLength: 61,
};

describe("importRowReasonText", () => {
  it("traduce un código del dominio a una frase que se puede leer", () => {
    // Los códigos REALES del dominio (`publishable-listing.ts`), no los que
    // la lámina escribe en castellano: `precio_usd` es la columna, `priceUsd`
    // es el campo, y `priceUsd.invalid` es el código.
    expect(importRowReasonText("priceUsd.required")).toBe("Falta el precio.");
    expect(importRowReasonText("priceUsd.invalid")).toBe(
      "El precio tiene que ser un entero de dólares mayor que 0.",
    );
  });

  it("traduce lo que sólo la importación conoce", () => {
    expect(importRowReasonText("externalReference.required")).toBe(
      "Falta la referencia externa: es el código con el que reconocés esta propiedad.",
    );
    expect(importRowReasonText("externalReference.duplicateInFile")).toBe(
      "Esta referencia externa aparece más de una vez en el archivo.",
    );
    expect(importRowReasonText("hasPowerPlant.invalid")).toBe(
      'La columna «planta_electrica» sólo acepta "si" o "no" — también valen "1" y "0".',
    );
  });

  /**
   * El caso que el comentario del dominio describe: la frase YA viene armada
   * con los datos de la fila, y volver a traducirla sería inventar.
   */
  it("deja pasar intacto un mensaje que el dominio ya escribió", () => {
    const yaEsUnaFrase = "«El Rosal» no existe en Maracaibo. Zonas disponibles: Bella Vista.";

    expect(importRowReasonText(yaEsUnaFrase)).toBe(yaEsUnaFrase);
  });

  /**
   * **El gate que impide que las dos tablas se separen.** `PublishViolation`
   * es una unión cerrada, así que el compilador ya obliga a `violation-copy.ts`
   * a cubrirla entera; `ImportRowViolation` incluye `string` y por eso NO
   * puede hacerlo. Sin esta prueba, un código nuevo del publicador llegaría a
   * la pantalla de importar como texto crudo — `price.notPositive` en la cara
   * de una inmobiliaria — y nada se pondría rojo.
   */
  /**
   * tasks.md 9.29 — la frase que la lámina 14g escribe en la fila 31: «La
   * descripción tiene 61 caracteres, hacen falta 120». Hasta ahora esta
   * tabla escribía una frase sin número y su propio comentario explicaba por
   * qué: «Ese 24 sale de un `PublishCopyContext` que la importación no
   * tiene». Ya lo tiene: `ImportRowError.cells` lleva el conteo.
   */
  it("cuenta la descripción cuando la fila le dice cuántos caracteres trae", () => {
    expect(importRowReasonText("description.tooShort", CELLS_CON_DESCRIPCION_CORTA)).toBe(
      "La descripción tiene 61 caracteres, hacen falta 120.",
    );
  });

  /**
   * Sin celdas —o para cualquier otro código— la frase sigue siendo la de
   * antes. Un «tiene 0» inventado es peor que una frase sin número, que es
   * la razón por la que esta tabla no reusaba `PUBLISH_VIOLATION_COPY`.
   */
  it("sin celdas no inventa el número: vuelve a la frase sin contador", () => {
    expect(importRowReasonText("description.tooShort")).toBe(
      "La descripción es más corta que el mínimo de caracteres.",
    );
  });

  it("cubre TODOS los códigos que el publicador ya sabe traducir", () => {
    const sinCopia = Object.keys(PUBLISH_VIOLATION_COPY).filter(
      (code) => importRowReasonText(code) === code,
    );

    expect(sinCopia).toEqual([]);
  });
});
