import type { SessionPort } from "../../identity/application/ports/session.port";
import { requireAuthenticatedSession } from "../../identity/application/require-authenticated-session";
import { MAX_PHOTOS_PER_LISTING } from "../domain/publishable-listing";
import { MAX_PHOTO_BYTES } from "../domain/uploaded-photo";
import {
  AttachPhotoToDraftLimitReachedError,
  AttachPhotoToDraftNotFoundError,
  AttachPhotoToDraftNotOwnedError,
} from "./attach-photo-to-draft";
import type { ListingActivationPort } from "./ports/listing-activation.port";
import type { PhotoStoragePort, UploadTarget } from "./ports/photo-storage.port";

/**
 * tasks.md 9.28 — el permiso de escritura que la pantalla de «Mis avisos»
 * necesita antes de poder poner una foto sobre un borrador importado.
 *
 * **Por qué no alcanzaba `app/publicar/fotos/actions.ts`.** Esa acción firma
 * para el borrador que vive en una cookie del formulario de publicar; un
 * borrador importado no tiene cookie y no pasó nunca por ese formulario.
 * Comparten todo lo demás: el mismo `PhotoStoragePort`, el mismo tope de
 * bytes, el mismo prefijo derivado de la sesión.
 *
 * **Las tres preguntas se contestan ANTES de firmar (AGENTS.md §7).** Un
 * presignado es un permiso de escritura, y repartirlo para un borrador que no
 * existe o que es de otra cuenta llena un prefijo con bytes que nadie va a
 * poder adjuntar. `attachPhotoToDraft` vuelve a preguntarlas después de la
 * subida, y esa duplicación es la misma que `upload-request.ts` ya documenta
 * para el formulario: ésta existe para no repartir permisos inútiles, aquélla
 * para que uno repartido de más no sirva de nada.
 *
 * **Reusa los errores de `attachPhotoToDraft` y no inventa tres suyos.** Son
 * exactamente las mismas tres negativas sobre el mismo borrador, dos pasos
 * antes; un segundo vocabulario obligaría a la pantalla a traducir dos veces
 * lo mismo.
 */

export interface RequestDraftPhotoUploadRequest {
  readonly listingId: string;
  /** Lo que el navegador va a subir. Se fija en la firma, nunca se acepta después. */
  readonly contentType: string;
  /** El largo exacto que el navegador ya midió tras comprimir. */
  readonly byteLength: number;
}

export interface RequestDraftPhotoUploadDependencies {
  readonly sessionPort: SessionPort;
  readonly listings: ListingActivationPort;
  readonly storage: PhotoStoragePort;
}

export async function requestDraftPhotoUpload(
  request: RequestDraftPhotoUploadRequest,
  dependencies: RequestDraftPhotoUploadDependencies,
): Promise<UploadTarget> {
  const { sessionPort, listings, storage } = dependencies;

  const session = await requireAuthenticatedSession(sessionPort);

  const draft = await listings.findDraftById(request.listingId);
  if (!draft) {
    throw new AttachPhotoToDraftNotFoundError(request.listingId);
  }

  // Propiedad antes que tope, el mismo orden que `attachPhotoToDraft`: el
  // borrador de un desconocido no debe revelar ni siquiera cuántas fotos
  // tiene.
  if (draft.publisherId !== session.userId) {
    throw new AttachPhotoToDraftNotOwnedError(request.listingId);
  }

  if (draft.photoCount >= MAX_PHOTOS_PER_LISTING) {
    throw new AttachPhotoToDraftLimitReachedError(request.listingId);
  }

  return storage.createUploadTarget({
    // De la sesión, jamás del pedido: es el segmento que hace inútil la URL
    // filtrada de una cuenta para escribir en el espacio de otra.
    publisherId: session.userId,
    contentType: request.contentType,
    byteLength: request.byteLength,
    // El techo del llamador nunca sube el nuestro; el adaptador toma el menor
    // de los dos.
    maxBytes: MAX_PHOTO_BYTES,
  });
}
