import type {
  DraftPhotoAction,
  PhotoRemovalRefusal,
} from "../../src/modules/listing-publication/domain/draft-photo-actions";

/**
 * El español del menú `⋯` de las fotos (paso 8, lámina 2g y
 * `Rentas - Publicar - Mobile.dc.html`).
 *
 * **Vive acá y no adentro del JSX**, como `step-copy.ts` y
 * `violation-copy.ts`: dos de estas frases la especificación las marca como
 * NO decorativas, y una frase interpolada en un atributo es una frase que
 * nadie encuentra al revisarla. Acá tiene prueba propia y sale literal.
 *
 * El `Record` sobre `DraftPhotoAction` es el mismo seguro que
 * `PUBLISH_VIOLATION_COPY` usa: si el dominio agrega una acción, este archivo
 * deja de compilar hasta que alguien escriba su renglón.
 */

export interface PhotoActionCopy {
  /** El renglón del menú, entero: «Quitar del aviso», no «Quitar … del aviso». */
  readonly label: string;
  /**
   * La aclaración debajo del renglón, y **sólo dos acciones la llevan**. La
   * especificación dice por qué: sin «no borra la foto de tu teléfono» un
   * dueño duda antes de tocar, y «portada» sola no significa nada. Van
   * visibles, no en un `title` que en un teléfono no aparece nunca.
   */
  readonly hint?: string;
}

export const PHOTO_ACTION_COPY: Record<DraftPhotoAction, PhotoActionCopy> = {
  moveUp: { label: "Mover arriba" },
  moveDown: { label: "Mover abajo" },
  makeCover: { label: "Hacer portada", hint: "se ve en la lista y arriba del aviso" },
  remove: { label: "Quitar del aviso", hint: "no borra la foto de tu teléfono" },
};

/**
 * El nombre accesible del botón: **nombra la foto y dice la consecuencia**, el
 * estándar que «Hacer portada» ya cumplía, ahora en las cuatro. La aclaración
 * se repite aunque esté visible porque el botón se lee solo.
 */
export function photoActionLabel(action: DraftPhotoAction, photoName: string): string {
  const { label, hint } = PHOTO_ACTION_COPY[action];
  const named = `${label}: ${photoName}`;
  if (!hint) return named;
  return `${named}. ${hint.charAt(0).toUpperCase()}${hint.slice(1)}`;
}

/**
 * Por qué no se quitó. `lastPhoto` **dice la salida** en vez de sólo negar:
 * el piso es `MIN_PHOTOS_FOR_ACTIVATION` y agregar antes de quitar lo
 * respeta, así que la negativa cuesta un toque, no un camino cerrado.
 *
 * `notFound` no debería alcanzarse desde la pantalla —el botón nace del
 * mismo arreglo que el dominio recibe—, y por eso dice lo único honesto que
 * se puede decir de un estado que no se entiende.
 */
export const PHOTO_REMOVAL_REFUSAL_COPY: Record<PhotoRemovalRefusal, string> = {
  lastPhoto: "Es la única foto y sin fotos no se puede publicar. Agregá otra y después quitá ésta.",
  notFound: "Esa foto ya no está en la lista.",
};

/**
 * tasks.md 18.21 — la misma frase, cuando el código vuelve por la URL.
 *
 * **`string` y no la unión, y el `??` no es un descuido**, igual que
 * `listingEditViolationMessage`: quitar una foto de un aviso publicado es un
 * `<form method="post">` sin JavaScript, así que la negativa vuelve como
 * parámetro y una dirección escrita a mano es dato de afuera. Indexar la tabla
 * con lo que traiga daría `undefined` dibujado; la garantía de que ninguna
 * negativa REAL se quede sin copia la sigue dando el `Record` sobre la unión.
 */
export function photoRemovalRefusalMessage(refusal: PhotoRemovalRefusal | string): string {
  return PHOTO_REMOVAL_REFUSAL_COPY[refusal as PhotoRemovalRefusal] ?? refusal;
}

/**
 * Quien quita la primera foto cambió la cara del aviso sin pedirlo. La región
 * viva lo anuncia con nombre, porque «la portada cambió» sobre una lista de
 * seis miniaturas no dice cuál quedó.
 */
export function coverChangedNotice(photoName: string): string {
  return `Ahora la portada es «${photoName}».`;
}

/**
 * La foto que se rompió al comprimir o al subir **nunca entró al aviso**, así
 * que su `×` no dice «quitar del aviso» ni promete que el teléfono conserva
 * nada: no hay nada que conservar del lado del aviso, y el piso de
 * `MIN_PHOTOS_FOR_ACTIVATION` tampoco la contaba.
 */
export function discardPhotoLabel(photoName: string): string {
  return `Descartar ${photoName}, que no llegó a subir`;
}
