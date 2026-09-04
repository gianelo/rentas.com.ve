import { eq, gt, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { listings } from "../../../shared/db/schema";
import type { DeclaredAttribute, ListingAttribute } from "../domain/search-criteria";

/**
 * **Cómo se pregunta por un atributo en SQL, escrito UNA vez** (14.45 rebanada
 * C).
 *
 * Los dos adaptadores de este módulo tenían el mismo `ATTRIBUTE_COLUMNS`
 * copiado, con un comentario que decía «igual que en `DrizzleListingSearch`».
 * Mientras las seis opciones fueran `columna = true` la copia era barata; con
 * la derivada adentro deja de serlo, porque **el umbral `> 0` es la regla** y
 * dos copias de una regla se separan. La lista y el conteo tienen que derivar
 * el puesto exactamente igual o el botón promete un número que la lista no
 * entrega — que es la regla transversal 3 rota por duplicación.
 *
 * Vive en `infrastructure/` y no en `domain/` porque es SQL: el dominio no
 * conoce columnas. La regla de producto —que «tener puesto» es tener al menos
 * uno— está donde se puede leer, y `tests/integration/faceted-search.test.ts`
 * la mide contra filas reales desde los dos lados.
 */

/**
 * Las cinco columnas booleanas del aviso.
 *
 * Anotado como `Record<DeclaredAttribute, …>` a propósito: es lo que **impide**
 * que la derivada entre acá. `parking_spots` es `integer`, y un mapa que la
 * aceptara dejaría escribir `parking_spots = true` sin que nada se queje.
 */
const ATTRIBUTE_COLUMNS: Readonly<Record<DeclaredAttribute, PgColumn>> = {
  hasPowerPlant: listings.hasPowerPlant,
  hasRegularWater: listings.hasRegularWater,
  isFurnished: listings.isFurnished,
  hasSecurity: listings.hasSecurity,
  hasAppliances: listings.hasAppliances,
};

/**
 * La condición de un atributo, sea columna booleana o derivada.
 *
 * **`> 0` y no `>= 1`, y no es lo mismo escrito distinto**: `parking_spots` es
 * `NOT NULL DEFAULT 0`, así que el cero es un aviso sin puesto y no un aviso
 * que no contestó. Sólo se compara contra `true` en las cinco booleanas, donde
 * `false` significa "no lo declaró" — ver `SearchCriteria.attributes`.
 */
export function attributeCondition(attribute: ListingAttribute): SQL {
  // El `switch` sobre la única derivada y no un segundo mapa: con dos mapas
  // paralelos, una clave que faltara en los dos no rompería nada y volvería a
  // ser el `undefined` que Postgres recibe como `where  = $1`.
  if (attribute === "hasParking") return gt(listings.parkingSpots, 0);
  return eq(ATTRIBUTE_COLUMNS[attribute], true);
}
