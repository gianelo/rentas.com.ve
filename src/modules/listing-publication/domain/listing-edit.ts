import {
  type ContactMethod,
  type CuratedZone,
  type DraftListing,
  type PropertyType,
  type PublisherType,
  type PublishViolation,
  referenceOrNone,
  validatePublishableListing,
} from "./publishable-listing";

/**
 * Editar un aviso ya publicado.
 *
 * **La regla es del fundador, y es general** (2026-09-01, tasks.md 18.27): «Se
 * puede corregir cualquier dato menos el de la zona, y eso porque va con la URL
 * del SEO y eso no puede cambiar. Si quiere cambiar la zona después de publicado
 * hay que desactivar ese anuncio y crear otro y ya.»
 *
 * **Reemplaza a la tabla campo por campo del 2026-08-29** (18.14), que enumeraba
 * lo permitido y por eso dejaba cerrado todo lo que no llegó a nombrar: la
 * referencia no existía ese día, y el tipo de inmueble y los puestos quedaron
 * afuera sin ninguna razón de integridad. Hoy la lista es al revés — lo cerrado
 * es lo que se enumera:
 *
 * | Campo | Editable | Por qué |
 * |---|---|---|
 * | la zona | **NO** | es un segmento de `/alquiler/<ciudad>/<zona>/<slug>-<id>` |
 * | la ciudad | **NO** | la determina la zona, así que viaja con ella |
 * | tipo de publicador | **NO** | cambiarlo invalidaría hacia atrás el filtro «solo de dueños» |
 * | todo lo demás | sí | «corregir un dato mal cargado no es publicar otro aviso» |
 *
 * **Por qué el título sí, si también va en esa URL.** Porque el último segmento
 * termina en el id y `listingIdFromSlug` resuelve por id: la dirección vieja
 * sigue encontrando el aviso aunque el título cambie. La zona no tiene ese
 * rescate — es su propio segmento y no lleva ningún id adentro, así que cambiarla
 * rompería toda dirección publicada. Ésa asimetría es la razón entera de la
 * regla, y por eso está escrita acá en vez de tener que volver a derivarse.
 *
 * **El contacto**: «el que reveló, reveló. Si entra de nuevo que vea el contacto
 * nuevo». **Las fotos**: sí, y el tope que rige al publicar rige al editar.
 *
 * **Un solo juego de reglas, no dos.** Todo lo que no es la inmutabilidad de
 * `publisherType` lo contesta `validatePublishableListing` en etapa
 * `"activation"` — el mismo validador que corre al publicar, al activar un
 * borrador y al importar una cartera. Una edición que validara distinto de
 * una publicación serían dos reglas para un solo producto, y la segunda es la
 * que nadie mantiene.
 *
 * **El piso y el tope de fotos no se reescriben acá.** `photoCount` viaja en
 * el aviso, no en el pedido: dos fuentes para el mismo número es como una
 * pantalla termina diciendo «3 fotos» sobre un aviso que tiene dos. Etapa
 * `"activation"` es lo que hace que `MIN_PHOTOS_FOR_ACTIVATION` y
 * `MAX_PHOTOS_PER_LISTING` sigan rigiendo después de publicado.
 *
 * **La ciudad y la zona se revalidan aunque no se puedan editar.** No están en
 * la tabla del fundador, así que ninguna edición las toca; pero saltearlas
 * sería exactamente la segunda regla que el párrafo anterior evita. Si el
 * catálogo dejó de tener esa zona, la edición se refusa igual que la
 * activación (AGENTS.md §7, fallar cerrado) en vez de escribir sobre una fila
 * que ya no puede publicarse.
 */

/**
 * `PublishViolation` extendida para ESTE camino, con la misma forma que
 * `ImportRowViolation` ya usa para el suyo — nunca ensanchando la unión de
 * publicar. `STEP_FOR_VIOLATION` es un `Record` sobre esa unión: agregar acá
 * un código que ninguna pantalla de los nueve pasos puede mostrar obligaría a
 * inventarle un paso, y un paso inventado es una violación que el publicador
 * recibe en ninguna parte.
 */
export type ListingEditViolation = PublishViolation | "publisherType.immutable";

/** El aviso publicado tal como está hoy: hechos, ninguno interpretado. */
export interface EditableListingSnapshot {
  readonly publisherType: PublisherType;
  readonly propertyType: PropertyType;
  /** La seña del paso 2, cuando el aviso tiene una. La columna es nulable. */
  readonly reference?: string;
  readonly cityId: string;
  readonly zoneId: string;
  readonly title: string;
  readonly description: string;
  readonly priceUsd: number;
  readonly rooms: number;
  readonly areaM2: number;
  readonly bathrooms: number;
  readonly parkingSpots: number;
  readonly contactMethod: ContactMethod;
  readonly contactValue: string;
  /** De contar fotos, nunca de un campo del pedido. */
  readonly photoCount: number;
}

/**
 * Lo que alguien pide cambiar. Cada campo es opcional: lo ausente se queda
 * como estaba.
 *
 * **`publisherType` está acá para ser rechazado, no para ser aplicado**, y esa
 * es la diferencia entre una garantía y una omisión. Un formulario que no
 * dibuja el campo no prueba nada sobre lo que pasa cuando alguien manda el
 * campo igual — y una acción de servidor es un endpoint HTTP público.
 */
export interface ListingEdit {
  readonly title?: string;
  readonly description?: string;
  readonly priceUsd?: number;
  readonly rooms?: number;
  readonly bathrooms?: number;
  readonly areaM2?: number;
  readonly parkingSpots?: number;
  readonly propertyType?: PropertyType;
  /**
   * **El único campo donde ausente y en blanco son respuestas distintas.** Es el
   * único opcional del aviso, así que `undefined` es «no lo contesté» y deja la
   * seña de ayer, mientras que `""` es «no tengo ninguna» y la borra. Sin esa
   * diferencia una seña equivocada se podría corregir pero no sacar.
   */
  readonly reference?: string;
  readonly contactMethod?: ContactMethod;
  readonly contactValue?: string;
  readonly publisherType?: PublisherType;
}

/** Los once campos que una edición escribe, y ninguno más. */
export interface ListingEditWrite {
  readonly title: string;
  readonly description: string;
  readonly priceUsd: number;
  readonly rooms: number;
  readonly bathrooms: number;
  readonly areaM2: number;
  readonly parkingSpots: number;
  readonly propertyType: PropertyType;
  /** `undefined` es «sin referencia», y se escribe: es un borrado, no una omisión. */
  readonly reference: string | undefined;
  readonly contactMethod: ContactMethod;
  readonly contactValue: string;
}

export type ListingEditPlan =
  | { readonly ok: true; readonly write: ListingEditWrite }
  | { readonly ok: false; readonly violations: readonly ListingEditViolation[] };

/**
 * `?? current` campo por campo, y no `{ ...current, ...edit }`: el spread
 * copiaría cualquier cosa que el pedido traiga, incluido `publisherType` y la
 * zona. Los once nombres escritos a mano son lo que hace que agregar un campo
 * editable sea una decisión y no un descuido.
 */
function writeFor(current: EditableListingSnapshot, edit: ListingEdit): ListingEditWrite {
  return {
    title: edit.title ?? current.title,
    description: edit.description ?? current.description,
    priceUsd: edit.priceUsd ?? current.priceUsd,
    rooms: edit.rooms ?? current.rooms,
    bathrooms: edit.bathrooms ?? current.bathrooms,
    areaM2: edit.areaM2 ?? current.areaM2,
    // `??` y no `||`: cero puestos es un hecho —un anexo sin puesto es un aviso
    // normal— y no un campo sin contestar.
    parkingSpots: edit.parkingSpots ?? current.parkingSpots,
    propertyType: edit.propertyType ?? current.propertyType,
    // **`referenceOrNone` y no un `trim()` propio**: es la misma función que
    // decide «en blanco es ninguna» al publicar, así que las dos puertas no
    // pueden discrepar sobre qué queda en la columna.
    reference: referenceOrNone(edit.reference ?? current.reference),
    contactMethod: edit.contactMethod ?? current.contactMethod,
    contactValue: edit.contactValue ?? current.contactValue,
  };
}

export function planListingEdit(
  current: EditableListingSnapshot,
  curatedZones: readonly CuratedZone[],
  edit: ListingEdit,
): ListingEditPlan {
  const violations: ListingEditViolation[] = [];

  // Se prohíbe CAMBIARLO, no nombrarlo: repetir el valor vigente no invalida
  // hacia atrás ningún filtro, y refusar un no-cambio convertiría cualquier
  // formulario que devuelva lo que recibió en un error sin causa.
  if (edit.publisherType !== undefined && edit.publisherType !== current.publisherType) {
    violations.push("publisherType.immutable");
  }

  const write = writeFor(current, edit);

  // El aviso completo como lo ve el validador de publicar: lo editable ya
  // resuelto, lo demás tal como la fila lo tiene. `publisherType`, la ciudad y
  // la zona salen de `current` SIEMPRE, nunca del pedido — y no figuran en
  // `write`, así que el spread no puede pisarlos aunque alguien los mande.
  const merged: DraftListing = {
    publisherType: current.publisherType,
    cityId: current.cityId,
    zoneId: current.zoneId,
    photoCount: current.photoCount,
    ...write,
  };

  violations.push(...validatePublishableListing(merged, curatedZones, "activation"));

  return violations.length > 0 ? { ok: false, violations } : { ok: true, write };
}
