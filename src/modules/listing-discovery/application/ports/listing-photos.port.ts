import type { DerivativeName } from "../../../listing-publication/application/ports/photo-derivation.port";

/**
 * Las fotos de un aviso, para dibujarlas.
 *
 * Separado del puerto de publicación a propósito: aquél escribe y éste lee, y
 * la capa de render no debería poder guardar una foto ni por accidente.
 */

export interface ListingPhotoView {
  /** Base cero, el orden que eligió quien publica. La portada es la 0. */
  readonly position: number;
  /**
   * La clave de R2 de cada tamaño. Un `Record` y no cinco campos: quién elige
   * el tamaño es la superficie que dibuja — la tarjeta pide `card`, la tira de
   * la ficha `strip`, el visor `full` — y esa elección no debería estar
   * escrita acá.
   */
  readonly keys: Readonly<Partial<Record<DerivativeName, string>>>;
}

export interface ListingPhotosPort {
  /**
   * La portada de VARIOS avisos en una llamada, y el plural es la decisión.
   *
   * **Una búsqueda devuelve hasta 20 avisos.** Pedir la portada de a una son 20
   * viajes de red contra Neon, que es HTTP — el N+1 clásico, y en serverless
   * cuesta latencia real y no sólo consultas. La firma lo hace inexpresable:
   * no existe un `coverFor(id)` singular al que caer.
   *
   * Devuelve un `Map` y no un arreglo porque el llamador ya tiene sus avisos en
   * orden y lo único que necesita es buscar por id. Un arreglo lo obligaría a
   * construir este mismo `Map` para no recorrerlo veinte veces.
   *
   * **Un aviso sin fotos simplemente no está en el `Map`.** No es un error: la
   * importación de cartera (Fase 9) puede producir uno, y la F9 dice que ese
   * aviso no se muestra en la cuadrícula — decidirlo es del llamador, no de acá.
   */
  coversFor(listingIds: readonly string[]): Promise<ReadonlyMap<string, ListingPhotoView>>;

  /** Todas las fotos de un aviso, en orden. Para la ficha y el visor. */
  allFor(listingId: string): Promise<readonly ListingPhotoView[]>;
}
