import { asc, eq, ilike, inArray, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { cities, zoneAliases, zones } from "../../../shared/db/schema";
import type { SearchVocabularyPort } from "../application/ports/search-vocabulary.port";
import type { SuggestionVocabulary } from "../domain/suggest-filters";
import type { CatalogueDatabase } from "./drizzle-catalogue";

/**
 * `SearchVocabularyPort` contra Postgres.
 *
 * El reparto de trabajo con el dominio es la decisión de este archivo: **SQL
 * estrecha, el dominio decide.** `ILIKE` sobre el nombre y sobre el alias
 * reduce miles de filas a decenas; cuál de esas decenas se ofrece, en qué orden
 * y a qué dirección lleva lo resuelve `resolveSearchDestination`, que es puro y
 * está cubierto. Poner el criterio en el `WHERE` lo sacaría del alcance del
 * suelo de cobertura y lo volvería imposible de probar sin una base.
 *
 * El handle se inyecta, igual que en los otros adaptadores: el despliegue pasa
 * un cliente Neon y la prueba de integración uno de `node-postgres` apuntado a
 * un contenedor real, y **los dos corren este mismo código**.
 */

/** Ancho suficiente para que el dominio tenga de dónde elegir sus ocho. */
const LOOKUP_LIMIT = 60;

/**
 * `%` y `_` son comodines de `LIKE`. Sin escaparlos, escribir «100%» en la caja
 * convierte la consulta en «traeme todo».
 */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

/**
 * Cada palabra por separado, unidas con OR.
 *
 * Un solo `ILIKE '%apartamento en altamira%'` no encuentra Altamira, porque la
 * columna guarda «Altamira» y no la frase. Partir en palabras es lo que deja
 * que la frase entera siga funcionando; el filtro fino lo hace el dominio.
 *
 * **Dos letras es el piso acá y tres en el dominio, y esa asimetría es a
 * propósito**: el SQL puede traer de más sin costo visible sobre un índice, y
 * el dominio es quien decide qué se ofrece. Un piso más alto en el `WHERE`
 * escondería filas que la regla nunca llegaría a ver.
 */
function wordsOf(text: string): string[] {
  return text
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length >= 2)
    .slice(0, 6);
}

export class DrizzleSearchVocabulary implements SearchVocabularyPort {
  constructor(private readonly db: CatalogueDatabase) {}

  async lookup(text: string): Promise<SuggestionVocabulary> {
    const words = wordsOf(text);

    // Las dos ciudades del producto van SIEMPRE, aunque nada coincida: son dos
    // filas, y son lo que el dominio ofrece cuando alguien escribió filtros sin
    // nombrar un lugar («apartamento amoblado»). Sin ellas esa rama no existe.
    const cityRows = await this.db
      .select({ id: cities.id, name: cities.name })
      .from(cities)
      .orderBy(asc(cities.name));

    // Sin nada que buscar no se consulta la taxonomía. Devolverla entera sería
    // justo lo que este puerto existe para no hacer.
    if (words.length === 0) return { cities: cityRows, zones: [], aliases: [] };

    const parent = alias(zones, "parent");
    const like = words.map((word) => `%${escapeLike(word)}%`);

    const zoneRows = await this.db
      .select({
        id: zones.id,
        name: zones.name,
        cityId: zones.cityId,
        parentName: parent.name,
      })
      .from(zones)
      .leftJoin(parent, eq(zones.parentId, parent.id))
      .where(or(...like.map((pattern) => ilike(zones.name, pattern))))
      .orderBy(asc(zones.name))
      .limit(LOOKUP_LIMIT);

    const aliasRows = await this.db
      .select({ zoneId: zoneAliases.zoneId, alias: zoneAliases.alias })
      .from(zoneAliases)
      .where(or(...like.map((pattern) => ilike(zoneAliases.alias, pattern))))
      .orderBy(asc(zoneAliases.alias))
      .limit(LOOKUP_LIMIT);

    // Las zonas que un alias trajo y el nombre no. Sin ellas, encontrar por
    // alias devolvería una sugerencia que el dominio descarta después por no
    // conocer su ciudad — que es exactamente el caso «Bella Vista», el motivo
    // por el que la tabla de alias existe.
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
            // `inArray` y no un `= ANY(...)` escrito a mano: la plantilla `sql`
            // desarma el arreglo en parámetros sueltos, así que Postgres recibe
            // un escalar donde espera un arreglo y contesta «malformed array
            // literal». Es el mismo error que ya reventó la pantalla del paso 2.
            .where(inArray(zones.id, missing))
            .limit(LOOKUP_LIMIT);

    return { cities: cityRows, zones: [...zoneRows, ...extraRows], aliases: aliasRows };
  }
}
