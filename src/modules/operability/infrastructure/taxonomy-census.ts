import { sql } from "drizzle-orm";
import { readTerritoryDocuments } from "../../listing-catalogue/infrastructure/territorio-files";
import { buildTerritoryRows } from "../../listing-catalogue/infrastructure/territorio-import";
import {
  findTaxonomyGaps,
  type TaxonomyCensus,
  type TaxonomyExpectation,
  type TaxonomyGap,
} from "../domain/taxonomy-gap";
import { type SmokeDatabase, smokeRows } from "./schema-shapes";

/**
 * Los dos lados de la comparación de la 17.15: la taxonomía que los
 * documentos definen y la que la base tiene.
 *
 * **Lo esperado sale de `buildTerritoryRows(readTerritoryDocuments())`, que es
 * la MISMA función que el seed usa, y nunca de un 5.796 escrito acá.** Un
 * número a mano deja de ser cierto el día que alguien agregue un archivo a
 * `docs/territorio/` — que es justo el día en que el chequeo tendría que
 * notarlo. Derivarlo cuesta leer los documentos en cada corrida, y esa corrida
 * ocurre una vez por despliegue.
 */
export function expectedTaxonomy(): TaxonomyExpectation {
  const { areas, zones } = buildTerritoryRows(readTerritoryDocuments());
  return {
    cityNames: areas.map((area) => area.name),
    // Los ids y no la cuenta: con ids se puede decir CUÁLES faltan aunque
    // sobren filas provisionales, y una cuenta sola no distingue «están las
    // 5.796» de «hay 5.796 filas».
    zoneIds: zones.map((zone) => zone.id),
  };
}

export async function actualTaxonomy(db: SmokeDatabase): Promise<TaxonomyCensus> {
  const cities = smokeRows<{ name: string }>(await db.execute(sql`select name from "city"`));
  const zones = smokeRows<{ id: string }>(await db.execute(sql`select id from "zone"`));
  const orphans = smokeRows<{ n: number }>(
    await db.execute(sql`
      select count(*)::int as n
      from "zone" z
      where not exists (select 1 from "city" c where c.id = z.city_id)
    `),
  );

  return {
    cityNames: cities.map((row) => row.name),
    zoneIds: zones.map((row) => row.id),
    orphanZoneCount: Number(orphans[0]?.n ?? 0),
  };
}

/**
 * Las dos mitades juntas, para que el script y la prueba de integración usen
 * exactamente el mismo camino. Un gate que la prueba no ejerce entero es un
 * gate que puede dejar de comprobar en silencio (14.48).
 */
export async function findTaxonomyGapsIn(db: SmokeDatabase): Promise<readonly TaxonomyGap[]> {
  return findTaxonomyGaps(expectedTaxonomy(), await actualTaxonomy(db));
}
