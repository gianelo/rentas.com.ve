import { describe, expect, it } from "vitest";
import { describeSchemaDrift, findSchemaDrift } from "./schema-drift";

/**
 * **El defecto del 2026-08-17, reconstruido** (tarea 11b.5).
 *
 * Producción corrió cuatro migraciones atrasada durante cuatro días. La
 * búsqueda seguía andando —no selecciona las columnas que faltaban—, entrar
 * fallaba con `column "contact_method" does not exist`, y publicar era
 * imposible porque `listing_photo` no existía. **Nada reportó nada.**
 *
 * La 11b.1 hizo que el esquema llegue con el código; esto es lo que lo
 * **prueba** en vez de confiarlo, y el defecto que tiene que cazar está
 * nombrado: un `select` que nombra una columna que la base no tiene.
 */
const codigoEspera = [
  { table: "listing", columns: ["id", "title", "contact_method"] },
  { table: "listing_photo", columns: ["id", "listing_id"] },
];

describe("findSchemaDrift", () => {
  it("no reporta nada cuando la base tiene todo lo que el código nombra", () => {
    expect(findSchemaDrift(codigoEspera, codigoEspera)).toStrictEqual([]);
  });

  it("nombra la columna que el código selecciona y la base no tiene", () => {
    const drift = findSchemaDrift(codigoEspera, [
      { table: "listing", columns: ["id", "title"] },
      { table: "listing_photo", columns: ["id", "listing_id"] },
    ]);

    expect(drift).toStrictEqual([
      { table: "listing", missingTable: false, missingColumns: ["contact_method"] },
    ]);
  });

  it("nombra la tabla entera cuando la base no la tiene, con todas sus columnas", () => {
    const drift = findSchemaDrift(codigoEspera, [
      { table: "listing", columns: ["id", "title", "contact_method"] },
    ]);

    expect(drift).toStrictEqual([
      { table: "listing_photo", missingTable: true, missingColumns: ["id", "listing_id"] },
    ]);
  });

  /**
   * **La dirección de la comprobación es media decisión, y la otra media es
   * ésta.** Una columna que la base tiene y el código todavía no lee NO es
   * deriva: es el paso 1 del `añadir anulable → rellenar → NOT NULL` que este
   * proyecto exige justamente porque «no podemos borrar data real» (14.2,
   * 11b.6). Un chequeo que fallara acá refutaría cada migración en tres pasos
   * y lo apagaría el primero que lo sufriera.
   */
  it("no reporta una columna que la base tiene y el código todavía no lee", () => {
    const drift = findSchemaDrift(codigoEspera, [
      { table: "listing", columns: ["id", "title", "contact_method", "renewed_at"] },
      { table: "listing_photo", columns: ["id", "listing_id", "blurhash"] },
      { table: "tabla_que_el_codigo_no_conoce", columns: ["x"] },
    ]);

    expect(drift).toStrictEqual([]);
  });

  it("ordena la salida para que dos corridas iguales digan lo mismo", () => {
    const drift = findSchemaDrift(codigoEspera, [{ table: "listing", columns: [] }]);

    expect(drift.map((entry) => entry.table)).toStrictEqual(["listing", "listing_photo"]);
    expect(drift[0]?.missingColumns).toStrictEqual(["contact_method", "id", "title"]);
  });
});

describe("describeSchemaDrift", () => {
  /**
   * **Falla ruidosamente, y el mensaje es la mitad del valor.** El del
   * 2026-08-20 llegó como `column "contact_method" does not exist` dentro de
   * un intento de entrar; éste llega antes, dice qué falta y en qué tabla.
   */
  it("dice qué falta y en qué tabla", () => {
    const dicho = describeSchemaDrift([
      { table: "listing", missingTable: false, missingColumns: ["contact_method"] },
      { table: "listing_photo", missingTable: true, missingColumns: ["id"] },
    ]);

    expect(dicho).toContain("listing: contact_method");
    expect(dicho).toContain("listing_photo: LA TABLA NO EXISTE");
  });
});
