import { asc, eq, ilike, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { cities, zoneAliases, zones } from "../../../shared/db/schema";
import type { SuggestionVocabulary } from "../../listing-catalogue/domain/suggest-filters";
import type { ZoneVocabularyPort } from "../application/ports/zone-vocabulary.port";
import type { PublicationDatabase } from "./drizzle-listing-repository";

/**
 * `ZoneVocabularyPort` contra Postgres.
 *
 * El reparto de trabajo con el dominio es la decision de este archivo: **SQL
 * estrecha, el dominio decide.** `ILIKE` sobre el nombre y sobre el alias
 * reduce miles de filas a decenas; cual de esas decenas se ofrece, en que
 * orden y con que etiqueta lo resuelve `searchPublicationZones`, que es puro y
 * esta cubierto. Poner el criterio en el `WHERE` lo sacaria del alcance del
 * piso de cobertura y lo volveria imposible de probar sin una base.
 *
 * El handle se inyecta, igual que en los otros dos adaptadores: el despliegue
 * pasa un cliente Neon y la prueba de integracion uno de `node-postgres`
 * apuntado a un contenedor real, y **los dos corren este mismo codigo**.
 */

/** Ancho suficiente para que el dominio tenga de donde elegir sus ocho. */
const LOOKUP_LIMIT = 60;

/**
 * `%` y `_` son comodines de `LIKE`. Sin escaparlos, escribir "100%" en el
 * buscador de zona convierte la consulta en "traeme todo".
 */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

/**
 * Cada palabra por separado, unidas con OR.
 *
 * Un solo `ILIKE '%apartamento en altamira%'` no encuentra Altamira, porque la
 * columna guarda "Altamira" y no la frase. Partir en palabras es lo que deja
 * que la frase entera siga funcionando; el filtro fino lo hace el dominio.
 */
function wordsOf(text: string): string[] {
  return text
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length >= 2)
    .slice(0, 6);
}

export class DrizzleZoneVocabulary implements ZoneVocabularyPort {
  constructor(private readonly db: PublicationDatabase) {}

  async lookup(text: string): Promise<SuggestionVocabulary> {
    const words = wordsOf(text);
    const raw = text.trim();

    // Sin nada que buscar no se consulta nada. Devolver el catalogo entero
    // seria justo lo que este puerto existe para no hacer.
    if (words.length === 0 && raw === "") {
      return { cities: [], zones: [], aliases: [] };
    }

    const parent = alias(zones, "parent");

    // `eq(zones.id, raw)` es la busqueda por id: es como el paso 2 resuelve
    // la zona que el formulario acaba de devolver, sin traer el catalogo.
    const nameMatches = [
      eq(zones.id, raw),
      ...words.map((word) => ilike(zones.name, `%${escapeLike(word)}%`)),
    ];

    const zoneRows = await this.db
      .select({
        id: zones.id,
        name: zones.name,
        cityId: zones.cityId,
        parentName: parent.name,
      })
      .from(zones)
      .leftJoin(parent, eq(zones.parentId, parent.id))
      .where(or(...nameMatches))
      .orderBy(asc(zones.name))
      .limit(LOOKUP_LIMIT);

    const aliasRows =
      words.length === 0
        ? []
        : await this.db
            .select({ zoneId: zoneAliases.zoneId, alias: zoneAliases.alias })
            .from(zoneAliases)
            .where(or(...words.map((word) => ilike(zoneAliases.alias, `%${escapeLike(word)}%`))))
            .orderBy(asc(zoneAliases.alias))
            .limit(LOOKUP_LIMIT);

    // Las zonas que un alias trajo y el nombre no: sin ellas, encontrar por
    // alias devolveria una sugerencia que el dominio descarta despues por no
    // conocer su ciudad.
    const known = new Set(zoneRows.map((zone) => zone.id));
    const missing = [...new Set(aliasRows.map((row) => row.zoneId))].filter(
      (zoneId) => !known.has(zoneId),
    );

    const extraRows =
      missing.length === 0
        ? []
        : await this.db
            .select({
              id: zones.id,
              name: zones.name,
              cityId: zones.cityId,
              parentName: parent.name,
            })
            .from(zones)
            .leftJoin(parent, eq(zones.parentId, parent.id))
            .where(sql`${zones.id} = ANY(${missing})`)
            .limit(LOOKUP_LIMIT);

    return {
      // Las dos ciudades del producto. Son dos filas: pedirlas acotadas
      // costaria mas codigo del que ahorra.
      cities: await this.db
        .select({ id: cities.id, name: cities.name })
        .from(cities)
        .orderBy(asc(cities.name)),
      zones: [...zoneRows, ...extraRows],
      aliases: aliasRows,
    };
  }
}
