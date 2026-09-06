import { describe, expect, it } from "vitest";
import {
  describeTaxonomyGaps,
  findTaxonomyGaps,
  type TaxonomyCensus,
  type TaxonomyExpectation,
} from "./taxonomy-gap";

const EXPECTED: TaxonomyExpectation = {
  cityNames: ["Caracas", "La Guaira", "Maracaibo"],
  zoneIds: ["z1", "z2", "z3"],
};

function census(overrides: Partial<TaxonomyCensus> = {}): TaxonomyCensus {
  return {
    cityNames: ["Caracas", "La Guaira", "Maracaibo"],
    zoneIds: ["z1", "z2", "z3"],
    orphanZoneCount: 0,
    ...overrides,
  };
}

describe("los huecos de la taxonomía", () => {
  it("no reporta ninguno cuando está toda la taxonomía que los documentos definen", () => {
    expect(findTaxonomyGaps(EXPECTED, census())).toStrictEqual([]);
  });

  /**
   * **La misma dirección que `findSchemaDrift`, y por la misma razón.** Falta
   * una zona que el formulario ofrece → publicar está roto. Sobra una fila que
   * la taxonomía no nombra → no es asunto de este chequeo: producción arrastra
   * diez zonas provisionales con avisos reales colgando de ellas, y un gate
   * que fallara por eso bloquearía todo despliegue hasta borrar data de gente
   * — exactamente el desenlace que la migración 0010 ya costó tres horas.
   */
  it("no reporta huecos por filas que sobran, sólo por las que faltan", () => {
    expect(
      findTaxonomyGaps(
        EXPECTED,
        census({
          cityNames: ["Caracas", "La Guaira", "Maracaibo", "Distrito Capital"],
          zoneIds: ["z1", "z2", "z3", "provisional"],
        }),
      ),
    ).toStrictEqual([]);
  });

  it("nombra las áreas que la base no tiene", () => {
    expect(findTaxonomyGaps(EXPECTED, census({ cityNames: ["Caracas"] }))).toStrictEqual([
      { subject: "city", expected: 3, actual: 1, missing: ["La Guaira", "Maracaibo"] },
    ]);
  });

  it("cuenta las zonas que faltan sin nombrarlas: sus ids son hashes", () => {
    expect(findTaxonomyGaps(EXPECTED, census({ zoneIds: ["z1"] }))).toStrictEqual([
      { subject: "zone", expected: 3, actual: 1, missing: [] },
    ]);
  });

  /**
   * La clave foránea de `zone.city_id` lo hace imposible hoy, y por eso se
   * afirma en vez de asumirse: el día que alguien la suelte, una zona
   * huérfana no rompe ninguna consulta — deja de aparecer en el formulario, y
   * eso no se distingue de una zona que nadie eligió.
   */
  it("reporta las zonas que apuntan a una ciudad que no existe", () => {
    expect(findTaxonomyGaps(EXPECTED, census({ orphanZoneCount: 2 }))).toStrictEqual([
      { subject: "orphan-zone", expected: 0, actual: 2, missing: [] },
    ]);
  });

  it("describe cada hueco con lo esperado contra lo presente", () => {
    const gaps = findTaxonomyGaps(
      EXPECTED,
      census({ cityNames: [], zoneIds: [], orphanZoneCount: 1 }),
    );

    expect(describeTaxonomyGaps(gaps)).toBe(
      "  city: la taxonomía define 3 área(s) y la base tiene 0 de ellas — faltan: Caracas, La Guaira, Maracaibo\n" +
        "  zone: la taxonomía define 3 zona(s) y la base tiene 0 de ellas — faltan 3\n" +
        "  zone: 1 zona(s) apuntan a una ciudad que no existe",
    );
  });
});
