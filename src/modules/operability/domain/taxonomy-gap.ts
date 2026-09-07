/**
 * **Si el entorno desplegado no tiene la taxonomía que el producto ofrece,
 * esto lo dice** (tarea 17.15).
 *
 * La 11b.5 pregunta si están las COLUMNAS. Nadie preguntaba nunca si están
 * las FILAS, y el 2026-09-05 se vio lo que eso cuesta: producción tenía 10
 * zonas provisionales bajo una ciudad llamada «Distrito Capital» en vez de
 * las 5.796 que `docs/territorio/` define, así que el paso 2 de publicar no
 * tenía una sola zona que ofrecer y el camino entero estaba muerto. La suite
 * completa en verde, porque la taxonomía sólo llega por un `pnpm db:seed`
 * a mano y ninguna afirmación miraba el contenido del entorno real.
 *
 * **Vive en el dominio por la misma razón que `schema-drift`: la decisión no
 * es «contar filas», es en qué dirección se cuentan.** Falta una zona que el
 * formulario ofrece → publicar está roto. Sobra una fila que la taxonomía no
 * nombra → **no es asunto de este chequeo**. Producción arrastra esas diez
 * zonas provisionales con avisos reales colgando de ellas, y un gate que
 * exigiera igualdad exacta bloquearía todo despliegue hasta borrar data de
 * gente — que es exactamente cómo la migración 0010 dejó tres horas de
 * producción sin poder desplegar, con el gate «funcionando».
 */
export interface TaxonomyExpectation {
  /** Los nombres de área que `docs/territorio/` define, vía `buildTerritoryRows`. */
  readonly cityNames: readonly string[];
  /** Los ids de zona derivados del camino completo, no un total escrito a mano. */
  readonly zoneIds: readonly string[];
}

export interface TaxonomyCensus {
  readonly cityNames: readonly string[];
  readonly zoneIds: readonly string[];
  /** Zonas cuyo `city_id` no tiene ciudad. La clave foránea lo impide hoy. */
  readonly orphanZoneCount: number;
}

export interface TaxonomyGap {
  readonly subject: "city" | "zone" | "orphan-zone";
  readonly expected: number;
  readonly actual: number;
  /** Vacío para las zonas: sus ids son hashes y no le dicen nada a nadie. */
  readonly missing: readonly string[];
}

export function findTaxonomyGaps(
  expected: TaxonomyExpectation,
  actual: TaxonomyCensus,
): readonly TaxonomyGap[] {
  const gaps: TaxonomyGap[] = [];

  const cities = new Set(actual.cityNames);
  const missingCities = expected.cityNames.filter((name) => !cities.has(name));
  if (missingCities.length > 0) {
    gaps.push({
      subject: "city",
      expected: expected.cityNames.length,
      actual: expected.cityNames.length - missingCities.length,
      missing: [...missingCities].sort(),
    });
  }

  const zones = new Set(actual.zoneIds);
  const presentZones = expected.zoneIds.filter((id) => zones.has(id)).length;
  if (presentZones < expected.zoneIds.length) {
    gaps.push({
      subject: "zone",
      expected: expected.zoneIds.length,
      actual: presentZones,
      missing: [],
    });
  }

  if (actual.orphanZoneCount > 0) {
    gaps.push({ subject: "orphan-zone", expected: 0, actual: actual.orphanZoneCount, missing: [] });
  }

  return gaps;
}

/**
 * El mensaje. El del 2026-09-05 no llegó: el formulario simplemente no
 * ofrecía ninguna zona, y eso no se distingue de un desplegable que todavía
 * no cargó. Éste llega antes y dice cuánto falta.
 */
export function describeTaxonomyGaps(gaps: readonly TaxonomyGap[]): string {
  return gaps
    .map((gap) => {
      switch (gap.subject) {
        case "city":
          return `  city: la taxonomía define ${gap.expected} área(s) y la base tiene ${gap.actual} de ellas — faltan: ${gap.missing.join(", ")}`;
        case "zone":
          return `  zone: la taxonomía define ${gap.expected} zona(s) y la base tiene ${gap.actual} de ellas — faltan ${gap.expected - gap.actual}`;
        default:
          return `  zone: ${gap.actual} zona(s) apuntan a una ciudad que no existe`;
      }
    })
    .join("\n");
}
