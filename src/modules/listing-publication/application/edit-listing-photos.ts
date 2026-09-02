import type { SessionPort } from "../../identity/application/ports/session.port";
import type { PhotoHashPort } from "../../listing-trust/application/ports/photo-hash.port";
import { type PhotoRemovalRefusal, planPhotoRemoval } from "../domain/draft-photo-actions";
import { MAX_PHOTOS_PER_LISTING } from "../domain/publishable-listing";
import { MAX_PHOTO_BYTES } from "../domain/uploaded-photo";
import { EditListingNotFoundError, loadListingForEdit } from "./edit-listing";
import type { ListingEditPort } from "./ports/listing-edit.port";
import type { ListingPhotoAttachmentPort } from "./ports/listing-photo-attachment.port";
import type {
  ListingPhotoDerivativeKeysPort,
  ListingPhotoDetachmentPort,
  ListingPhotoOrderPort,
  ListingPhotoThumbnail,
  ListingPhotoThumbnailPort,
} from "./ports/listing-photo-set.port";
import type { PhotoDerivationPort } from "./ports/photo-derivation.port";
import type { PhotoHashComputationPort } from "./ports/photo-hash-computation.port";
import type { PhotoStoragePort, UploadTarget } from "./ports/photo-storage.port";
import { processUploadedPhoto } from "./process-uploaded-photo";

/**
 * tasks.md 18.21 — **agregar y quitar fotos de un aviso YA publicado.**
 *
 * **Por qué no es `attachPhotoToDraft`.** Su propio docstring ya lo dejó
 * escrito: «an `active` listing cannot reach this function at all», porque su
 * puerta es `findDraftById`, cuyo `WHERE` lleva `status = 'draft'` adentro.
 * Un aviso publicado es otro sujeto, y ensanchar aquel `WHERE` le abriría a
 * `activateListing` una fila que ya está activa. Así que van casos de uso AL
 * LADO, con la misma tubería y otra puerta.
 *
 * **La puerta es `loadListingForEdit`, literalmente la misma función que usa
 * la pantalla de editar** — no una copia de su `WHERE`. Refusa un aviso
 * ajeno, un borrador, un vencido y uno oculto con el MISMO
 * `EditListingNotFoundError` que ya refusa un id inexistente, y vuelve a
 * comparar `publisherId` contra la sesión por si un adaptador futuro se
 * olvida del segundo parámetro. Reusarla es lo que garantiza que quitar una
 * foto no se convierta en el camino por el que un desconocido averigua que un
 * aviso existe (AGENTS.md §7).
 *
 * **`processUploadedPhoto` sigue siendo el único punto de paso**, llamado acá
 * VERBATIM igual que en `publishListing` y en `attachPhotoToDraft`: es donde
 * vive el rechazo por hash perceptual entre cuentas (tarea 4.7), y un camino
 * de adjuntar que no pase por ahí reabre el agujero que esa tarea cerró.
 *
 * **Ninguna regla nueva.** El tope es `MAX_PHOTOS_PER_LISTING`, la misma
 * constante que `planListingEdit` aplica en etapa `"activation"`; el piso y
 * el ascenso de la portada los decide `planPhotoRemoval`, que ya existe desde
 * la 18.15 y ya está probado. Acá sólo se ordenan las puertas.
 *
 * **Al desprender, las derivadas de R2 se borran acá mismo (18.32).** Viven
 * bajo el prefijo PROMOVIDO, junto a las fotos de todos los avisos activos, así
 * que ninguna regla de ciclo de vida del bucket las distingue: lo único que las
 * separa es la ausencia de su fila en `listing_photo`, o sea exactamente este
 * instante. **Y el permiso ya estaba**: `PhotoStoragePort.remove` existe desde
 * D12 y `purgeExpiredPhotos` ya lo usa contra el mismo bucket, así que la razón
 * que la 18.21 anotó —«pediría ensanchar un puerto angosto»— era falsa.
 */

export class ListingPhotoLimitReachedError extends Error {
  constructor(listingId: string) {
    super(
      `edit-listing-photos: ${listingId} already holds ${MAX_PHOTOS_PER_LISTING} photos, ` +
        "the maximum a listing may carry.",
    );
    this.name = "ListingPhotoLimitReachedError";
  }
}

/**
 * Lleva la negativa del dominio, **nunca una frase**: la copia sale de
 * `PHOTO_REMOVAL_REFUSAL_COPY`, que ya la escribió una vez para el paso 8.
 */
export class ListingPhotoRemovalRefusedError extends Error {
  readonly refusal: PhotoRemovalRefusal;

  constructor(listingId: string, refusal: PhotoRemovalRefusal) {
    super(`edit-listing-photos: cannot detach from ${listingId} (${refusal}).`);
    this.name = "ListingPhotoRemovalRefusedError";
    this.refusal = refusal;
  }
}

/** La puerta de las tres, y la única lectura que las tres necesitan. */
type EditableListingGate = {
  readonly sessionPort: SessionPort;
  readonly listings: Pick<ListingEditPort, "findEditableById">;
};

export interface RequestListingPhotoUploadRequest {
  readonly listingId: string;
  /** Lo que el navegador va a subir. Se fija en la firma, nunca se acepta después. */
  readonly contentType: string;
  /** El largo exacto que el navegador ya midió tras comprimir. */
  readonly byteLength: number;
}

/**
 * El permiso de escritura, pedido **antes** de subir. Falla cerrado por la
 * misma razón que `requestDraftPhotoUpload`: un presignado repartido para un
 * aviso ajeno o uno que ya llegó al tope llena un prefijo con bytes que nadie
 * va a poder adjuntar.
 */
export async function requestListingPhotoUpload(
  request: RequestListingPhotoUploadRequest,
  dependencies: EditableListingGate & { readonly storage: PhotoStoragePort },
): Promise<UploadTarget> {
  const listing = await openForPhotos(request.listingId, dependencies);

  return dependencies.storage.createUploadTarget({
    // Del aviso, cuyo dueño `loadListingForEdit` ya comparó dos veces contra
    // la sesión: es el segmento que hace inútil la URL filtrada de una cuenta
    // para escribir en el espacio de otra.
    publisherId: listing.publisherId,
    contentType: request.contentType,
    byteLength: request.byteLength,
    maxBytes: MAX_PHOTO_BYTES,
  });
}

export interface AttachPhotoToListingRequest {
  readonly listingId: string;
  /** La clave que `requestListingPhotoUpload` emitió. Se revisa río abajo. */
  readonly incomingKey: string;
  /** Lo que el navegador declaró. Se compara contra los bytes, nunca se cree. */
  readonly declaredContentType: string;
}

export interface AttachPhotoToListingDependencies extends EditableListingGate {
  readonly photos: ListingPhotoAttachmentPort;
  readonly storage: PhotoStoragePort;
  readonly derive: PhotoDerivationPort;
  readonly computeHash: PhotoHashComputationPort;
  readonly photoHashes: PhotoHashPort;
  readonly now?: () => Date;
}

export async function attachPhotoToListing(
  request: AttachPhotoToListingRequest,
  dependencies: AttachPhotoToListingDependencies,
): Promise<{ readonly listingId: string; readonly position: number }> {
  const { photos, storage, derive, computeHash, photoHashes } = dependencies;
  const now = dependencies.now ?? (() => new Date());

  const listing = await openForPhotos(request.listingId, dependencies);

  const processed = await processUploadedPhoto(
    {
      publisherId: listing.publisherId,
      incomingKey: request.incomingKey,
      declaredContentType: request.declaredContentType,
    },
    { storage, derive, computeHash, photoHashes },
  );

  // Contada, jamás declarada por el pedido: es el mismo número que el
  // validador usa para el piso y el tope.
  const position = listing.photoCount;
  const attachedAt = now();
  const { photoId } = await photos.attachPhoto(
    listing.id,
    { position, derivatives: processed.derivatives },
    attachedAt,
  );

  // Sólo ahora: `listing_photo_hash.photo_id` referencia `listing_photo.id`,
  // así que el hash no puede escribirse antes de que exista la fila que nombra.
  await photoHashes.record({ photoId, hash: processed.hash, recordedAt: attachedAt });

  return { listingId: listing.id, position };
}

/**
 * Las fotos del aviso, **en el orden en que se muestran**, para dibujarlas.
 *
 * Vive acá y no en la pantalla por la misma razón que `loadListingForEdit`
 * vive al lado de `editListing`: si la lectura refusara con un error distinto
 * del que refusa el borrado, un aviso ajeno sería distinguible de uno
 * inexistente en exactamente una de las dos, y basta una para contarlo.
 *
 * **No comprueba el tope**: un aviso lleno sigue mostrando sus fotos, porque
 * leer no es agregar.
 *
 * **Desde la 18.26 vuelve también la clave de la miniatura**, y por eso la
 * dependencia cambió de `order` a `thumbnails`. No es un dato más: sin ella la
 * pantalla sólo puede nombrar cada foto por su ordinal, y quien tiene seis
 * parecidas elige a ciegas y puede quitar la que no era. Componer la URL sigue
 * siendo de quien dibuja —`photoUrl` recibe la base pública como argumento
 * justamente para eso—, así que acá vuelve la clave y nunca una dirección.
 */
export async function loadListingPhotosForEdit(
  request: { readonly listingId: string },
  dependencies: EditableListingGate & { readonly thumbnails: ListingPhotoThumbnailPort },
): Promise<readonly ListingPhotoThumbnail[]> {
  const listing = await openForPhotos(request.listingId, dependencies, { checkCeiling: false });
  return dependencies.thumbnails.listPhotoThumbnailsInOrder(listing.id);
}

export interface DetachPhotoFromListingDependencies extends EditableListingGate {
  readonly order: ListingPhotoOrderPort;
  readonly derivatives: ListingPhotoDerivativeKeysPort;
  readonly photos: ListingPhotoDetachmentPort;
  /** Sólo `remove`: desprender no firma subidas ni lee objetos. */
  readonly storage: Pick<PhotoStoragePort, "remove">;
}

/**
 * Quitar una foto de un aviso publicado.
 *
 * **La decisión es del dominio.** `planPhotoRemoval` contesta si se puede
 * —el piso es `MIN_PHOTOS_FOR_ACTIVATION`, la misma constante que
 * `activateListing` revalida— y cuál queda de portada cuando la quitada era
 * la portada. Acá no se compara ningún número.
 */
export async function detachPhotoFromListing(
  request: { readonly listingId: string; readonly photoId: string },
  dependencies: DetachPhotoFromListingDependencies,
): Promise<{ readonly listingId: string; readonly coverChangedTo: string | null }> {
  const listing = await openForPhotos(request.listingId, dependencies, { checkCeiling: false });

  const ids = await dependencies.order.listPhotoIdsInOrder(listing.id);
  const plan = planPhotoRemoval(ids, request.photoId);
  if (!plan.ok) {
    throw new ListingPhotoRemovalRefusedError(listing.id, plan.refusal);
  }

  // ANTES del borrado, y no por prolijidad: `listing_photo_derivative` cuelga de
  // `listing_photo` con `ON DELETE cascade`, así que leído después esto devuelve
  // cero claves y los cinco objetos quedan pagados sin que nada los nombre.
  const derivativeKeys = await dependencies.derivatives.listDerivativeKeys(
    listing.id,
    request.photoId,
  );

  const detached = await dependencies.photos.detachPhoto(listing.id, request.photoId);
  if (!detached) {
    // La fila estaba cuando la lectura de arriba la vio y dejó de estar antes
    // del `DELETE`. No hay nada que ESTA llamada pueda haber hecho, y el
    // aviso se contesta como el inexistente que ahora es. **Sin tocar R2**: el
    // borrado fue de otra transacción y sus objetos son decisión de aquélla.
    throw new EditListingNotFoundError(listing.id);
  }

  /**
   * **La fila primero y R2 después, al revés que `purgeExpiredPhotos`.** Ahí
   * nada vivo muestra esas fotos y el trabajo vuelve a correr mañana; acá la
   * fila es de un aviso PUBLICADO y no hay segunda corrida. Con R2 primero, un
   * borrado de fila que falle deja un aviso vivo apuntando a cinco 404 que no se
   * pueden rehacer —D12 descartó el original—, y un objeto que ya no está en R2
   * hace `remove` gritar para siempre: la foto queda imposible de quitar, el
   * fallo abierto que `listPhotoThumbnailsInOrder` se escribió para evitar. Con
   * la fila primero, lo peor que queda es el huérfano: una cuenta, no una
   * pantalla rota.
   *
   * **Y grita.** `remove` está fuera de todo `try` a propósito (D12): tragarse
   * la falla es el silencio que fabricó la 18.23. La fila ya se fue, así que
   * recargar muestra la foto quitada.
   */
  for (const key of derivativeKeys) {
    await dependencies.storage.remove(key);
  }

  return { listingId: listing.id, coverChangedTo: plan.coverChangedTo };
}

/**
 * La puerta, una sola vez para las tres. **Propiedad antes que tope**, el
 * mismo orden que `attachPhotoToDraft`: el aviso de un desconocido no debe
 * revelar ni siquiera cuántas fotos tiene.
 */
async function openForPhotos(
  listingId: string,
  { sessionPort, listings }: EditableListingGate,
  options: { readonly checkCeiling?: boolean } = {},
) {
  const listing = await loadListingForEdit({ listingId }, { sessionPort, listings });

  if (options.checkCeiling !== false && listing.photoCount >= MAX_PHOTOS_PER_LISTING) {
    throw new ListingPhotoLimitReachedError(listingId);
  }

  return listing;
}
