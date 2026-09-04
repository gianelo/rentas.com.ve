/**
 * tasks.md 14.56 — **una sola pregunta: ¿esta cuenta tiene al menos un aviso?**
 *
 * **Un puerto de lectura AL LADO de `PublisherListingsPort`, no un ensanche
 * suyo** (AGENTS.md §3, la misma razón que ese puerto ya documenta frente a
 * `ListingRepositoryPort` y `ListingActivationPort`). Ese lista los avisos de
 * una cuenta con todo lo que la lámina 14d dibuja de cada uno; esto contesta
 * un `boolean`. Hacer que el primero sirva al segundo obligaría a toda
 * pantalla del camino de lectura —`/`, resultados y la ficha, que dibujan la
 * barra y nada más— a cargarse la cartera entera para mirar si está vacía.
 *
 * **Y es un `EXISTS`, no un `COUNT`**: la pregunta es si hay al menos uno, y
 * contar todos para compararlos contra cero paga filas que nadie mira.
 *
 * **El `publisherId` lo pone el llamador y lo saca de la sesión.** No hay una
 * variante sin filtro: «¿hay avisos?» a secas no es una pregunta que este
 * puerto sepa contestar.
 */
export interface PublisherHasListingsPort {
  hasAnyListing(publisherId: string): Promise<boolean>;
}
