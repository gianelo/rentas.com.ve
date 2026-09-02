import type { PriceBucketTally } from "../../domain/price-histogram";

/**
 * **Los ocho cubos de una zona, y nada más** (tasks.md 18.9).
 *
 * El paso 3 necesita el MISMO motor de facetas que F5 —ésa es la tarea— pero no
 * el mismo puerto. `FacetedSearchPort` devuelve además el total de la búsqueda,
 * el conteo por zona, por habitaciones, por atributo, por tipo, las nueve
 * relajaciones y el total de la ciudad: **números de un panel de búsqueda,
 * calculados contra criterios que quien publica nunca expresó**. Entregárselos
 * a un formulario lo deja a una línea de escribir «47 avisos en Chacao», que es
 * el resultado de una búsqueda que nadie hizo; un puerto de una sola pregunta
 * hace esa línea inescribible (AGENTS.md §1 y §3).
 *
 * **Angosto no es una segunda consulta**, y ésa es la distinción: reusar el
 * motor es que haya UN `width_bucket` en el repositorio, no una sola interfaz.
 * El adaptador compone el de `FacetedSearchPort` en vez de escribir su propio
 * reparto. Lo que eso cuesta hoy, dicho y no escondido: por debajo se evalúan
 * las agregaciones del panel entero — un solo viaje y un solo recorrido de las
 * mismas filas, que es el costo dominante, pero no es gratis. Desprender el
 * reparto a una función que los dos adaptadores llamen queda anotado en la 18.9
 * con su precio, en vez de partir acá un archivo recién embarcado.
 */
export interface ZonePriceTallyPort {
  /**
   * Los dos ids y no sólo la zona: el aislamiento de D5 no tiene excepción.
   *
   * **No recibe el precio que se está tecleando, y no puede recibirlo**: medido
   * contra ese número las barras de afuera caerían a cero justo cuando se lo
   * mira para moverlo. Misma regla que la faceta ya aplica, acá inexpresable.
   */
  tallyForZone(cityId: string, zoneId: string): Promise<readonly PriceBucketTally[]>;
}
