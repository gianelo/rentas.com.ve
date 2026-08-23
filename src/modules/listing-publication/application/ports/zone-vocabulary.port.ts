import type { SuggestionVocabulary } from "../../../listing-catalogue/domain/suggest-filters";

/**
 * El vocabulario que el buscador de zona del paso 2 necesita, acotado a lo
 * que se parece a lo escrito.
 *
 * **Acotado, y no "todas las zonas".** La taxonomia real son miles de filas
 * mas 3.547 alias; traerla entera en cada busqueda es un recorrido secuencial
 * por consulta, dentro de una funcion sin servidor, para descartar el 99,9%
 * en memoria. El adaptador estrecha con SQL y el dominio decide sobre lo poco
 * que queda: la regla sigue viviendo en `searchPublicationZones`, que es
 * donde el piso de cobertura la alcanza.
 *
 * **`lookup` responde tambien por id**, y esa segunda funcion es la que hace
 * que "la ciudad la determina la zona" sea barata: cuando el formulario
 * devuelve una zona elegida, `resolveZoneCity` necesita exactamente esa fila
 * y su ciudad, no el catalogo.
 */
export interface ZoneVocabularyPort {
  lookup(text: string): Promise<SuggestionVocabulary>;
}
