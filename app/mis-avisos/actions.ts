"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { nextAuthSessionPort } from "@/modules/identity/infrastructure/session-port";
import {
  ActivateListingRejectedError,
  activateListing,
} from "@/modules/listing-publication/application/activate-listing";
import { attachPhotoToDraft } from "@/modules/listing-publication/application/attach-photo-to-draft";
import {
  EditListingRejectedError,
  editListing,
} from "@/modules/listing-publication/application/edit-listing";
import {
  attachPhotoToListing,
  detachPhotoFromListing,
  ListingPhotoRemovalRefusedError,
  requestListingPhotoUpload,
} from "@/modules/listing-publication/application/edit-listing-photos";
import { requestDraftPhotoUpload } from "@/modules/listing-publication/application/request-draft-photo-upload";
import type { ListingEdit } from "@/modules/listing-publication/domain/listing-edit";
import {
  DrizzleListingActivation,
  DrizzleListingEdit,
  DrizzleListingPhotoSet,
  DrizzleZoneCatalogue,
} from "@/modules/listing-publication/infrastructure/drizzle-listing-repository";
import { deriveListingPhoto } from "@/modules/listing-publication/infrastructure/photo-derivatives";
import { createR2PhotoStorage } from "@/modules/listing-publication/infrastructure/r2-photo-storage";
import { DrizzlePhotoHash } from "@/modules/listing-trust/infrastructure/drizzle-photo-hash";
import { db } from "@/shared/db/client";
import { getTransactionalDatabase } from "@/shared/db/transactional-client";
import { formCount, formText } from "../publicar/step-values";

/**
 * tasks.md 9.28 — **las dos llamadas que no existían.**
 *
 * `activateListing` y `attachPhotoToDraft` llevaban una porción entera
 * construidos, probados y sin una sola ruta que los llamara: una inmobiliaria
 * podía importar cincuenta avisos y quedaban como borradores que nadie podía
 * fotografiar ni activar desde un navegador. Es la cuarta vez que este
 * trabajo encuentra la misma forma de defecto (el anti-fraude de fotos, la
 * pastilla de búsqueda, el motor de importación y `canImportListings` fueron
 * las tres anteriores). Este archivo la cierra.
 *
 * **Ninguna regla vive acá.** De quién es el borrador, si tiene fotos, si
 * puede activarse y qué se puede firmar lo contestan los tres casos de uso;
 * este archivo elige adaptadores y traduce su respuesta a una dirección.
 *
 * **Una acción de servidor es un endpoint HTTP público.** Que la llame un
 * componente nuestro no es una garantía sobre quién la llama, así que las
 * tres empiezan por la sesión — y ninguna acepta un `publisherId`: el id sale
 * siempre de la sesión, adentro del caso de uso.
 */

/**
 * Composición por pedido y no al importar el módulo: `createR2PhotoStorage`
 * lee seis variables de entorno y tira si falta una — a nivel de módulo eso
 * tumbaría la pantalla entera de quien sólo quiere mirar su lista.
 */
function photoDependencies() {
  const transactional = getTransactionalDatabase();
  const activation = new DrizzleListingActivation(transactional);

  return {
    sessionPort: nextAuthSessionPort,
    listings: activation,
    photos: activation,
    storage: createR2PhotoStorage(),
    derive: (source: Uint8Array) => deriveListingPhoto(Buffer.from(source)),
    computeHash: (source: Uint8Array) => computeHashOf(source),
    photoHashes: new DrizzlePhotoHash(transactional),
  };
}

// `sharp` y el dHash sólo se cargan cuando de verdad llega una foto: son la
// dependencia más pesada de este árbol y la pantalla de la lista no la usa.
async function computeHashOf(source: Uint8Array) {
  const { computeDHash } = await import("@/modules/listing-trust/infrastructure/sharp-dhash");
  return computeDHash(Buffer.from(source));
}

export interface DestinoDeFoto {
  readonly key: string;
  readonly url: string;
  /** Serializado: una `Date` no sobrevive el cruce hacia el componente cliente. */
  readonly expiresAt: string;
}

/**
 * Paso 1 de la subida: la firma. Falla cerrado — un borrador que no existe o
 * que es de otra cuenta no obtiene permiso de escritura (AGENTS.md §7).
 */
export async function pedirDestinoDeFoto(input: {
  readonly listingId: string;
  readonly contentType: string;
  readonly byteLength: number;
}): Promise<DestinoDeFoto> {
  const target = await requestDraftPhotoUpload(input, {
    sessionPort: nextAuthSessionPort,
    listings: new DrizzleListingActivation(db),
    storage: createR2PhotoStorage(),
  });

  return { key: target.key, url: target.url, expiresAt: target.expiresAt.toISOString() };
}

/**
 * Paso 2: adjuntar lo que ya está subido. **Pasa por
 * `processUploadedPhoto`**, adentro de `attachPhotoToDraft`, que es el único
 * punto por el que publicar y adjuntar pasan los dos — y donde vive el
 * rechazo por foto duplicada entre cuentas (tarea 4.7). Un camino de
 * importación que subiera fotos sin pasar por ahí reabriría el agujero que
 * esa tarea cerró.
 */
export async function adjuntarFotoAlBorrador(input: {
  readonly listingId: string;
  readonly key: string;
  readonly contentType: string;
}): Promise<{ readonly position: number }> {
  const result = await attachPhotoToDraft(
    {
      listingId: input.listingId,
      incomingKey: input.key,
      declaredContentType: input.contentType,
    },
    photoDependencies(),
  );

  // La ficha del aviso cuenta sus fotos y su estado; sin esto la lista
  // seguiría diciendo «faltan fotos» después de subir una.
  revalidatePath("/mis-avisos");

  return { position: result.position };
}

/**
 * tasks.md 18.21 — **las mismas dos mitades, sobre un aviso YA publicado.**
 *
 * No reusan las de arriba y no es duplicación: la puerta de aquéllas es
 * `findDraftById`, cuyo `WHERE` lleva `status = 'draft'` adentro. Ensancharlo
 * le abriría a `activateListing` una fila que ya está activa, así que va un
 * caso de uso al lado con `findEditableById` de puerta — la misma que ya
 * refusa un aviso ajeno, un borrador, un vencido y uno oculto como el mismo
 * `null`. Lo que sí se reusa entero es lo que importa: `processUploadedPhoto`,
 * el único punto por el que pasan publicar, adjuntar a un borrador y esto.
 */
export async function pedirDestinoDeFotoDelAviso(input: {
  readonly listingId: string;
  readonly contentType: string;
  readonly byteLength: number;
}): Promise<DestinoDeFoto> {
  const target = await requestListingPhotoUpload(input, {
    sessionPort: nextAuthSessionPort,
    listings: new DrizzleListingEdit(db),
    storage: createR2PhotoStorage(),
  });

  return { key: target.key, url: target.url, expiresAt: target.expiresAt.toISOString() };
}

export async function adjuntarFotoAlAviso(input: {
  readonly listingId: string;
  readonly key: string;
  readonly contentType: string;
}): Promise<{ readonly position: number }> {
  const transactional = getTransactionalDatabase();

  const result = await attachPhotoToListing(
    {
      listingId: input.listingId,
      incomingKey: input.key,
      declaredContentType: input.contentType,
    },
    {
      ...photoDependencies(),
      // La puerta del aviso publicado, en lugar de la del borrador. El resto
      // de la tubería —almacenamiento, derivadas, hash— es la misma.
      listings: new DrizzleListingEdit(transactional),
      photos: new DrizzleListingActivation(transactional),
    },
  );

  // La ficha pública y la lista cuentan las fotos del aviso.
  revalidatePath("/mis-avisos");
  revalidatePath(`/mis-avisos/${input.listingId}/editar`);

  return { position: result.position };
}

/**
 * Quitar una foto. **Un `<form method="post">` de verdad**, así que llega como
 * `FormData` y funciona con el script apagado — a diferencia de agregar, que
 * necesita comprimir en el teléfono.
 *
 * **La negativa viaja como código, jamás como frase**, igual que las de activar
 * y guardar: la copia la decide `PHOTO_REMOVAL_REFUSAL_COPY`, y una URL con
 * castellano adentro sería una segunda tabla que nadie mantiene. Un aviso
 * ajeno o inexistente no produce ninguna dirección: sube, porque decirle a un
 * desconocido «ese aviso no es tuyo» ya sería contarle que existe.
 */
export async function quitarFotoDelAviso(formData: FormData): Promise<void> {
  const listingId = String(formData.get("listingId") ?? "");
  const photoId = String(formData.get("photoId") ?? "");
  const transactional = getTransactionalDatabase();
  const photoSet = new DrizzleListingPhotoSet(transactional);

  let respuesta: string;
  try {
    const result = await detachPhotoFromListing(
      { listingId, photoId },
      {
        sessionPort: nextAuthSessionPort,
        listings: new DrizzleListingEdit(transactional),
        order: photoSet,
        photos: photoSet,
      },
    );
    // Quien quita la portada cambió la cara del aviso sin pedirlo, así que la
    // pantalla tiene algo que anunciar; el `null` del dominio no manda nada.
    respuesta = result.coverChangedTo === null ? "" : "portada=1";
  } catch (error) {
    if (!(error instanceof ListingPhotoRemovalRefusedError)) throw error;
    respuesta = `foto=${encodeURIComponent(error.refusal)}`;
  }

  revalidatePath("/mis-avisos");

  const destino = `/mis-avisos/${encodeURIComponent(listingId)}/editar`;
  redirect(respuesta === "" ? destino : `${destino}?${respuesta}`);
}

/**
 * El disparador de activación. **Un `<form>` de verdad**, así que llega como
 * `FormData` y funciona con el script apagado: `/mis-avisos` está exento del
 * piso de la ruta de lectura por la compresión de fotos (AGENTS.md §2), no
 * por esto.
 *
 * **La negativa viaja en la dirección.** `activateListing` re-valida en etapa
 * `"activation"` y puede refusar; sin JavaScript no hay dónde devolverle un
 * valor a la pantalla, así que los códigos vuelven como parámetros y la
 * página los traduce al lado del aviso que los pidió. Los códigos son los
 * estables del dominio, nunca la frase — la copia se decide en una tabla, no
 * en una URL.
 */
export async function activarBorrador(formData: FormData): Promise<void> {
  const listingId = String(formData.get("listingId") ?? "");

  let violations: readonly string[] | null = null;
  try {
    await activateListing(
      { listingId },
      {
        sessionPort: nextAuthSessionPort,
        zones: new DrizzleZoneCatalogue(db),
        listings: new DrizzleListingActivation(getTransactionalDatabase()),
      },
    );
  } catch (error) {
    // Sólo la negativa del validador se dibuja. Un borrador que no existe o
    // que es de otro no produce una explicación: sube, y Next responde como
    // ante cualquier otro fallo — decirle a un desconocido «ese borrador no
    // es tuyo» ya sería contarle que existe.
    if (!(error instanceof ActivateListingRejectedError)) throw error;
    violations = error.violations;
  }

  revalidatePath("/mis-avisos");

  // Fuera del `try`: `redirect` funciona tirando, y atraparlo acá adentro lo
  // convertiría en «un error inesperado» silenciosamente.
  redirect(
    violations === null
      ? "/mis-avisos"
      : `/mis-avisos?fallo=${encodeURIComponent(listingId)}&motivos=${encodeURIComponent(violations.join(","))}`,
  );
}

/**
 * Lo que el formulario de editar posteó, en el vocabulario del dominio.
 *
 * **Nada se decide acá.** Los dos lectores vienen de `step-values.ts`, así que
 * un precio vacío sale `undefined` (no 0) y uno escrito «quinientos» sale
 * `NaN`, que `validatePublishableListing` ya rechaza como `priceUsd.invalid`.
 * Lo único que esta capa resuelve es la forma: `FormData` habla en cadenas.
 *
 * **`publisherType` se lee aunque la pantalla no lo dibuje**, y esa es la
 * diferencia entre una garantía y una omisión. Una acción de servidor es un
 * endpoint HTTP público: descartarlo acá aceptaría en silencio un pedido que
 * el producto refusa. Se manda como llegó y lo juzga el dominio, que lo mira
 * dos veces — `publisherType.immutable` si cambia, y `publisherType.invalid`
 * si además no es ninguno de los dos. El `as` afirma la forma, nunca el
 * valor, que es el mismo reparto que `readStepAnswers` ya usa para el paso 9.
 */
function leerEdicion(formData: FormData): ListingEdit {
  return {
    title: formText(formData, "title"),
    description: formText(formData, "description"),
    priceUsd: formCount(formData, "priceUsd"),
    rooms: formCount(formData, "rooms"),
    bathrooms: formCount(formData, "bathrooms"),
    areaM2: formCount(formData, "areaM2"),
    contactMethod: formText(formData, "contactMethod") as ListingEdit["contactMethod"],
    contactValue: formText(formData, "contactValue"),
    publisherType: formText(formData, "publisherType") as ListingEdit["publisherType"],
  };
}

/**
 * tasks.md 18.20 — **la ruta que le faltaba a `editListing`.**
 *
 * La regla (`planListingEdit`), el caso de uso (`editListing`), el puerto y el
 * adaptador shipearon enteros y probados sin un solo llamador. Esto es el
 * llamador, con la misma forma que `activarBorrador`: un `<form>` de verdad,
 * así que llega como `FormData` y funciona con el script apagado.
 *
 * **Ninguna regla vive acá.** Qué campos puede tocar una edición y con qué
 * reglas se validan lo contesta el dominio; este archivo elige adaptadores y
 * traduce la respuesta a una dirección.
 *
 * **La negativa viaja como código, nunca como frase**, igual que la de activar:
 * la copia se decide en una tabla (`listingEditViolationMessage`), y una URL
 * con castellano adentro sería una segunda tabla que nadie mantiene. Un aviso
 * ajeno o inexistente no produce ninguna dirección: sube, porque decirle a un
 * desconocido «ese aviso no es tuyo» ya sería contarle que existe.
 */
export async function guardarEdicion(formData: FormData): Promise<void> {
  const listingId = String(formData.get("listingId") ?? "");

  let violations: readonly string[] | null = null;
  try {
    await editListing(
      { listingId, edit: leerEdicion(formData) },
      {
        sessionPort: nextAuthSessionPort,
        zones: new DrizzleZoneCatalogue(db),
        listings: new DrizzleListingEdit(getTransactionalDatabase()),
      },
    );
  } catch (error) {
    if (!(error instanceof EditListingRejectedError)) throw error;
    violations = error.violations;
  }

  revalidatePath("/mis-avisos");

  // Fuera del `try`: `redirect` funciona tirando, y atraparlo adentro lo
  // convertiria en «un error inesperado» silenciosamente.
  redirect(
    violations === null
      ? "/mis-avisos"
      : `/mis-avisos/${encodeURIComponent(listingId)}/editar?motivos=${encodeURIComponent(violations.join(","))}`,
  );
}
