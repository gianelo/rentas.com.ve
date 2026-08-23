import type { SuggestionVocabulary } from "../../domain/suggest-filters";

/**
 * El vocabulario que la caja del inicio necesita, acotado a lo que se parece a
 * lo escrito.
 *
 * **Acotado, y no "todo el catálogo".** La taxonomía real son miles de zonas
 * más 3.547 alias; traerla entera en cada búsqueda es un recorrido secuencial
 * por consulta, dentro de una función sin servidor, para descartar el 99,9 % en
 * memoria. El adaptador estrecha con SQL y el dominio decide sobre lo poco que
 * queda: la regla sigue viviendo en `resolveSearchDestination`, que es donde el
 * suelo de cobertura la alcanza.
 *
 * **Un puerto propio y no un tercer método en `CataloguePort`.** Aquél existe
 * para "todas las ciudades y todas las zonas" — sin filtro, porque el filtro es
 * del dominio. Éste es lo contrario por diseño: sólo tiene sentido acotado. Y
 * agregarle un método a una interfaz obliga a cada implementación existente,
 * incluidos los dobles de otros worktrees, a crecer con él.
 *
 * **La duplicación con `ZoneVocabularyPort` (listing-publication) es real y
 * está anotada**: las dos consultas se parecen mucho. Unificarlas significaría
 * que el catálogo dependiera de publicación o al revés, y publicación ya
 * depende del catálogo — la otra dirección cierra un ciclo entre módulos. Si se
 * unifican, el lugar es acá: `listing-catalogue` es de quien las dos ya toman
 * `SuggestionVocabulary`.
 */
export interface SearchVocabularyPort {
  lookup(text: string): Promise<SuggestionVocabulary>;
}
