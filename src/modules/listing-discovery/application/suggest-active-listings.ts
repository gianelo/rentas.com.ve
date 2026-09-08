import type { ActiveCityZonesPort } from "../../listing-catalogue/application/ports/active-city-zones.port";
import type {
  ListingSearchPort,
  ListingSearchResult,
} from "../../listing-search/application/ports/listing-search.port";
import type { SuggestionOutcome } from "../domain/listing-suggestions";
import { suggestFromCity, suggestFromZone } from "../domain/listing-suggestions";

/**
 * Qué avisos vivos se le ofrecen a quien abrió una ficha vencida
 * (tareas 11.10, 11.11 y 11.12).
 *
 * **La regla la decide el dominio; acá se decide a quién preguntarle.** El
 * orden —zona, después ciudad, nunca más allá— y el corte viven en
 * `domain/listing-suggestions.ts`. Lo que este caso de uso agrega es lo único
 * que no es puro: hacer las consultas, y **hacer la segunda sólo cuando la
 * primera no alcanzó**, porque cada una es un viaje HTTP contra Neon.
 *
 * **Se reusan dos puertos que ya existen en vez de abrir uno propio.**
 * `ListingSearchPort` ya trae exactamente lo que hace falta: filtra
 * `status = 'active'` sin condiciones (5.5/5.6) y exige un `cityId` no
 * anulable, así que "nunca más allá de la ciudad" no es una promesa de este
 * archivo — es una consulta que no se puede escribir. Y su garantía está
 * probada contra Postgres real en `tests/integration/listing-search.test.ts`,
 * que un puerto nuevo tendría que volver a ganarse.
 *
 * **Corrección, tasks.md 27.1 slice D.** Este archivo era el único camino de
 * lectura que le quedaba a la taxonomía entera: pedía `CataloguePort.listZones()`
 * —las 5.813 zonas del país, sin `WHERE`— y descartaba en JavaScript las que no
 * fueran de esta ciudad, la misma causa que el resto de la tarea 27.1 ya
 * corrigió en las otras pantallas. Ahora pide `ActiveCityZonesPort.listActiveZones(cityId)`
 * —el mismo puerto que la 27.1 slice C ya le dio al panel de filtros—, que
 * Postgres acota con `WHERE city_id = $1` y un `GROUP BY` sobre lo que ya
 * filtró: la ciudad ajena nunca sale de la consulta, así que no queda un
 * `.filter()` que hacerle a la respuesta. **Medido contra el contenedor real**
 * (`rentas_test`, 17 ciudades y 5.810 zonas): la consulta vieja devolvía
 * **5.810 filas y 701 kB** sin importar qué ciudad se estuviera ampliando; la
 * nueva, para Caracas (6 avisos activos reales sembrados), devuelve **6 filas
 * y 688 bytes**, con un `Index Scan` sobre `zone` y sin tocar la tabla entera
 * (`EXPLAIN ANALYZE`, confirmado y no supuesto).
 *
 * **Las zonas activas se leen SÓLO en la rama ampliada.** Los avisos de la
 * zona del aviso están, por construcción, en la zona del aviso: su nombre ya lo
 * trajo la ficha. Recién cuando se amplía a la ciudad aparecen zonas distintas,
 * y ahí hace falta nombrarlas. Es la rama rara de una pantalla rara — la común
 * cuesta una consulta.
 */

/**
 * El aviso vencido, en lo que esta decisión necesita de él. Los dos nombres
 * viajan porque la ficha ya los leyó: pedirlos de nuevo sería un viaje más a
 * Neon por un dato que está a un campo de distancia.
 */
export interface SuggestActiveListingsRequest {
  readonly listingId: string;
  readonly cityId: string;
  readonly cityName: string;
  readonly zoneId: string;
  readonly zoneName: string;
}

/**
 * Una sugerencia, con los dos nombres que su tarjeta y su camino canónico
 * necesitan.
 *
 * **No extiende `ListingSearchResult` por herencia de objeto: se copia campo
 * por campo** (ver `project` abajo). La forma es la misma; la garantía es que
 * nada que el puerto no declare llega hasta la pantalla.
 */
export interface SuggestedListing {
  readonly id: string;
  readonly cityId: string;
  readonly zoneId: string;
  readonly title: string;
  readonly priceUsd: number;
  readonly rooms: number;
  readonly areaM2: number;
  readonly publisherType: "owner" | "broker";
  readonly publishedAt: Date;
  readonly cityName: string;
  readonly zoneName: string;
}

export interface SuggestActiveListingsDependencies {
  readonly search: ListingSearchPort;
  /**
   * Sólo se consulta al ampliar: es lo que nombra las otras zonas de la
   * ciudad. Puerto acotado a UNA ciudad y a las zonas con avisos activos
   * (27.1 slice D) — nunca la taxonomía entera.
   */
  readonly activeZones: ActiveCityZonesPort;
}

export async function suggestActiveListings(
  request: SuggestActiveListingsRequest,
  dependencies: SuggestActiveListingsDependencies,
): Promise<SuggestionOutcome<SuggestedListing>> {
  const { search, activeZones } = dependencies;

  // `zoneIds` con una sola zona: el puerto combina varias con O, y una lista de
  // uno es exactamente "esta zona". La ciudad va igual en el criterio, así que
  // ni una zona equivocada podría traer un aviso de otra parte.
  const inZone = await search.search({
    cityId: request.cityId,
    zoneIds: [request.zoneId],
  });

  const step = suggestFromZone(inZone, request.listingId);
  if (step.kind === "resolved") {
    return {
      scope: step.outcome.scope,
      listings: step.outcome.listings.map((listing) =>
        project(listing, request.cityName, request.zoneName),
      ),
    };
  }

  // La ampliación: la MISMA ciudad, sin zona. No hay un tercer paso que
  // escribir — `suggestFromCity` no puede pedirlo.
  const inCity = await search.search({ cityId: request.cityId });
  const outcome = suggestFromCity(inCity, request.listingId);
  if (outcome.scope === "none") return { scope: "none", listings: [] };

  // `listActiveZones` ya llega acotada a `request.cityId` en el propio
  // `WHERE`: no hace falta un `.filter()` acá, porque Postgres nunca devuelve
  // la zona de otra ciudad.
  const zoneNames = new Map(
    (await activeZones.listActiveZones(request.cityId)).map(
      (zone) => [zone.id, zone.name] as const,
    ),
  );

  return {
    scope: outcome.scope,
    // **Fallo cerrado: un aviso cuya zona no es de esta ciudad se descarta.**
    // El puerto garantiza que no llegue, y la integración lo prueba; lo que se
    // evita acá es la forma silenciosa de la falla — este caso de uso escribe
    // el nombre de la ciudad del aviso vencido sobre cada sugerencia, así que
    // un intruso saldría rotulado con la ciudad equivocada y con un camino que
    // no es el suyo, y se vería como un resultado y no como un error.
    listings: outcome.listings.flatMap((listing) => {
      const zoneName = zoneNames.get(listing.zoneId);
      return zoneName ? [project(listing, request.cityName, zoneName)] : [];
    }),
  };
}

/**
 * **Campo por campo y nunca `{ ...fila }`**, que es la misma regla de lista
 * blanca que la importación de carteras usa contra la asignación masiva.
 *
 * `ListingSearchResult` no declara contacto y el adaptador tampoco lo
 * selecciona, así que hoy no hay nada que filtrar. Lo que esto compra es que
 * siga siendo cierto: el día que alguien agregue una columna a ese `select`,
 * llegaría hasta la tarjeta sin que nadie lo decida — y una fuga de contacto es
 * exactamente la que nadie ve, porque se ve como un dato más.
 */
function project(
  listing: ListingSearchResult,
  cityName: string,
  zoneName: string,
): SuggestedListing {
  return {
    id: listing.id,
    cityId: listing.cityId,
    zoneId: listing.zoneId,
    title: listing.title,
    priceUsd: listing.priceUsd,
    rooms: listing.rooms,
    areaM2: listing.areaM2,
    publisherType: listing.publisherType,
    publishedAt: listing.publishedAt,
    cityName,
    zoneName,
  };
}
