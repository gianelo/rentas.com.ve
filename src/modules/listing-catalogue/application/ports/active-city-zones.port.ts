import type { CountedZoneName } from "../../domain/bounded-vocabulary";

/**
 * Las zonas de UNA ciudad con avisos activos, ya contadas — no la taxonomía
 * entera (tasks.md 27.1, slice C).
 *
 * ## El defecto que cierra
 *
 * `CataloguePort.listZones()` trae la ciudad entera —miles de filas— para que
 * la página filtre en JavaScript lo que Postgres ya puede filtrar con un
 * `GROUP BY`: exactamente la causa que la 27.1 nombra. El panel de filtros y
 * `boundedVocabulary` sólo necesitan las zonas que TIENEN avisos, con su
 * conteo — decenas cuando alcanza, hoy una sola en las ciudades reales.
 *
 * ## Un puerto propio y no un tercer método en `CataloguePort`
 *
 * `CataloguePort` existe para "la ciudad entera, sin filtro" — lo que
 * `broker-bulk-import` y `suggest-active-listings` (fuera de esta rebanada)
 * de verdad necesitan. Agregarle un método que ninguno de los dos llama es la
 * lección que la rebanada B ya pagó: su primer intento rompió 13 pruebas
 * ajenas al cambio antes de separarlo en `ZoneRoutePort`.
 *
 * ## Por qué no es `ActiveZonesPort` (listing-discovery)
 *
 * Aquél responde por las DOS ciudades a la vez y sin argumento, a propósito:
 * es el vocabulario del inicio, donde no hay ciudad elegida (14.52). Acá SÍ
 * hay una ciudad — la de la ruta— y pedir las dos sería traer de más para
 * descartar la mitad en la página, el mismo defecto de origen que esta
 * rebanada corrige.
 *
 * `DrizzleCatalogue` implementa este puerto en la misma clase que
 * `CataloguePort` y `ZoneRoutePort`: las tres leen las mismas tablas.
 */
export interface ActiveCityZonesPort {
  listActiveZones(cityId: string): Promise<readonly CountedZoneName[]>;
}
