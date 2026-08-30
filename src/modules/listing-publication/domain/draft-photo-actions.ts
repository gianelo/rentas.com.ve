import { MIN_PHOTOS_FOR_ACTIVATION } from "./publishable-listing";

/**
 * tasks.md 18.15 — qué acciones ofrece cada foto del paso 8, y qué pasa
 * cuando se toca una.
 *
 * **Por qué acá.** Cuáles acciones existen, cuál es la portada y cuándo
 * quitar se rechaza son afirmaciones sobre el producto. `PhotoUploader` es un
 * componente de cliente, o sea fuera del piso de 90% que cubre
 * `src/modules/**`: una regla escrita adentro es una regla que nada protege.
 *
 * **El piso sale de una sola constante.** `MIN_PHOTOS_FOR_ACTIVATION` es la
 * misma que `validatePublishableListing` aplica en etapa `"activation"`, así
 * que la negativa de esta pantalla y la que `activateListing` diría después no
 * pueden separarse. Contar no es decidir: acá se contesta una sola pregunta,
 * sin reloj ni E/S, como `reveal-rate-limit.ts`. El techo
 * (`MAX_PHOTOS_PER_LISTING`) no se repite: quitar nunca puede excederlo.
 *
 * El orden de la lista ES el orden del aviso y la primera ES la portada, así
 * que todo se dice sobre un arreglo de identificadores: mover, ascender,
 * arrastrar y quitar son la misma operación mirada de cuatro maneras.
 */

/** La posición que la lista de resultados y la ficha dibujan primero. */
export const COVER_PHOTO_INDEX = 0;

export type DraftPhotoAction = "moveUp" | "moveDown" | "makeCover" | "remove";

/**
 * Por qué no se pudo quitar. **No son códigos de `PublishViolation`** a
 * propósito: aquella unión contesta «¿este borrador se puede publicar?» y la
 * llama también la importación de cartera en lote. Esta contesta «¿esta foto
 * se puede quitar ahora mismo?», que es otra pregunta y merece otra copia.
 */
export type PhotoRemovalRefusal = "lastPhoto" | "notFound";

export type PhotoRemovalPlan =
  | { readonly ok: false; readonly refusal: PhotoRemovalRefusal }
  | {
      readonly ok: true;
      readonly ids: readonly string[];
      /**
       * El nombre-clave de la foto que queda de portada cuando la quitada
       * ERA la portada; `null` cuando la portada no se movió.
       *
       * Sale como dato y no como efecto silencioso porque quien quita la
       * primera foto cambió la cara del aviso sin pedirlo: la pantalla tiene
       * algo que anunciar y necesita saber qué.
       */
      readonly coverChangedTo: string | null;
    };

/**
 * Las acciones que el menú `⋯` de una foto dibuja, en el orden en que la
 * lámina las lista.
 *
 * `moveUp` y `makeCover` faltan en la portada porque no tienen destino, no
 * porque estén prohibidas. **`remove` está siempre**: el renglón es donde
 * vive «no borra la foto de tu teléfono», y esconderlo cuando queda una sola
 * foto escondería justamente la frase que la especificación marca como no
 * decorativa. Que se pueda ejecutar lo contesta `planPhotoRemoval`.
 */
export function photoActionsFor(ids: readonly string[], id: string): readonly DraftPhotoAction[] {
  const index = ids.indexOf(id);
  if (index < 0) return [];

  const actions: DraftPhotoAction[] = [];
  if (index > COVER_PHOTO_INDEX) actions.push("moveUp");
  if (index < ids.length - 1) actions.push("moveDown");
  if (index > COVER_PHOTO_INDEX) actions.push("makeCover");
  actions.push("remove");
  return actions;
}

/**
 * Qué pasaría al quitar esta foto — o por qué no pasa nada.
 *
 * Se rechaza en vez de avisar. AGENTS.md §7: cuando hay guarda, la forma
 * preferida es la negativa. Y la salida existe y es barata — agregar la
 * reemplazante antes de quitar la vieja —, así que la negativa no deja a
 * nadie trabado; sólo invierte el orden de dos toques.
 */
export function planPhotoRemoval(ids: readonly string[], id: string): PhotoRemovalPlan {
  const index = ids.indexOf(id);
  if (index < 0) return { ok: false, refusal: "notFound" };
  if (ids.length - 1 < MIN_PHOTOS_FOR_ACTIVATION) return { ok: false, refusal: "lastPhoto" };

  const remaining = ids.filter((candidate) => candidate !== id);
  return {
    ok: true,
    ids: remaining,
    coverChangedTo: index === COVER_PHOTO_INDEX ? (remaining[COVER_PHOTO_INDEX] ?? null) : null,
  };
}

/**
 * Un lugar arriba o abajo. La primera es la portada, así que «mover arriba»
 * desde la segunda posición ES «hacer portada» — una sola mecánica en vez de
 * dos que hay que explicar por separado.
 */
export function movePhotoBy(ids: readonly string[], id: string, delta: -1 | 1): readonly string[] {
  const from = ids.indexOf(id);
  if (from < 0) return ids;
  return reorderPhotoTo(ids, id, from + delta);
}

/** Directo a la portada, conservando el orden relativo de todas las demás. */
export function promoteToCover(ids: readonly string[], id: string): readonly string[] {
  return reorderPhotoTo(ids, id, COVER_PHOTO_INDEX);
}

/**
 * Insertar en una posición, que es lo que hace un arrastre: la foto entra en
 * el hueco y las demás corren. **No es un intercambio** — arrastrar la cuarta
 * hasta la segunda pone la cuarta segunda y empuja las otras, en vez de
 * mandar la segunda al fondo.
 *
 * Fuera de rango devuelve el mismo orden en vez de recortar al extremo: un
 * arrastre que se soltó afuera de la lista no eligió ninguna posición, y
 * fijarlo al borde inventaría una elección que nadie hizo.
 */
export function reorderPhotoTo(
  ids: readonly string[],
  id: string,
  toIndex: number,
): readonly string[] {
  const from = ids.indexOf(id);
  if (from < 0) return ids;
  if (toIndex < 0 || toIndex >= ids.length) return ids;
  if (toIndex === from) return ids;

  const next = [...ids];
  next.splice(from, 1);
  next.splice(toIndex, 0, id);
  return next;
}

/**
 * Si esta sesión recibe el arrastre, **encima de las acciones nombradas y
 * nunca en lugar de ellas**.
 *
 * La razón está escrita en la especificación y no es preferencia: *«arrastrar
 * con el pulgar en un teléfono lento no es confiable. Con mouse sí.»* Con una
 * sola foto tampoco se ofrece: un agarre que no puede cambiar nada promete
 * que sí.
 */
export function offersDragReorder(input: {
  readonly pointerIsFine: boolean;
  readonly photoCount: number;
}): boolean {
  return input.pointerIsFine && input.photoCount > 1;
}
