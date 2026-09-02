"use server";

import { redirect } from "next/navigation";
import {
  discardPublicationDraft,
  readPublicationDraft,
  savePublicationDraft,
} from "@/modules/listing-publication/application/publication-draft-session";
import {
  PublishRejectedError,
  publishListing,
} from "@/modules/listing-publication/application/publish-listing";
import { stampUploadInstants } from "@/modules/listing-publication/domain/draft-expiry";
import {
  applyStepAnswers,
  describeDraftChanges,
  draftListingOf,
  nextStepAfter,
  parseStepId,
  stepViolations,
} from "@/modules/listing-publication/domain/publication-steps";
import { validatePublishableListing } from "@/modules/listing-publication/domain/publishable-listing";
import { DrizzleZoneCatalogue } from "@/modules/listing-publication/infrastructure/drizzle-listing-repository";
import { DrizzleZoneVocabulary } from "@/modules/listing-publication/infrastructure/drizzle-zone-vocabulary";
import { db } from "@/shared/db/client";
import { requireSession } from "../_lib/require-session";
import { reviewPathFor } from "./change-notice-url";
import { emptyDraft, publicationDraftDependencies } from "./draft";
import { publishListingDependencies } from "./fotos/publication";
import { readStepAnswers } from "./step-values";

/**
 * Los dos manejadores del flujo de nueve pasos.
 *
 * Server Actions y no manejadores de ruta, porque `page.tsx` y `route.ts` no
 * pueden compartir segmento — y porque funcionan con JavaScript apagado, que
 * es lo que estas pantallas exigen: un POST nativo, un redirect, un
 * re-renderizado.
 *
 * **El resultado viaja en el borrador guardado y no en la URL.** El redirect es
 * lo que hace que el boton de atras y un refresh se comporten, y una descripcion
 * de 1.200 caracteres no tiene nada que hacer en una cadena de consulta. Desde la
 * 18.30 ese borrador es una fila de `publish_draft` con la sesion como llave, y
 * **ninguna de las dos funciones de aca toca una cookie**: la tabla es la unica
 * fuente, y las tres puertas viven en `publication-draft-session`.
 *
 * Ninguna regla vive aca. Este archivo ordena llamadas: leer, aplicar,
 * validar, guardar, redirigir. Cual es el paso siguiente, que esta completo,
 * que cambio y que dice el boton lo contesta `publication-steps`.
 */

function stepPath(step: string, returningToReview: boolean): string {
  return returningToReview ? `/publicar/paso/${step}?volver=revisar` : `/publicar/paso/${step}`;
}

/**
 * Guarda un paso y decide adonde se va.
 *
 * El orden importa y es el unico contenido real de esta funcion:
 *
 * 1. **La sesion primero, antes de leer nada.** Una Server Action es un
 *    endpoint HTTP publico como cualquier otro.
 * 2. Se aplica la respuesta SOBRE el borrador que ya habia — nunca en lugar
 *    de el. Es `applyStepAnswers` quien garantiza que corregir el paso 4 no
 *    toque los pasos 5 a 9.
 * 3. **Se valida el borrador ENTERO**, no solo el paso. Lo que se filtra
 *    despues es que se muestra, no que se comprueba: mostrar en el paso 3 un
 *    error de fotos deja a alguien mirando un boton que no avanza.
 * 4. El borrador se guarda en las dos ramas. En la de error para que quien
 *    publica recupere lo que escribio; en la de exito porque es lo que el
 *    paso siguiente lee.
 */
export async function submitStep(formData: FormData): Promise<void> {
  // **De aca sale el llavero del borrador.** Donde antes se leia una cookie
  // ahora hace falta saber DE QUIEN es la fila, y la unica fuente de eso es la
  // sesion que esta linea ya pedia y descartaba.
  const session = await requireSession("/publicar");
  const now = new Date();
  const draftStore = publicationDraftDependencies();

  const stepId = parseStepId(formData.get("step") as string | undefined);
  // Un paso inventado no se dibuja a medias: se vuelve al principio, que es
  // donde el flujo sabe en cual esta la persona.
  if (!stepId) redirect("/publicar");

  const returningToReview = formData.get("volver") === "revisar";

  const before = (await readPublicationDraft(session.userId, now, draftStore)) ?? emptyDraft();

  // El vocabulario solo hace falta para el paso 2, y solo acotado a lo que el
  // formulario devolvio. Los otros ocho no consultan nada.
  const vocabulary =
    stepId === "zona"
      ? await new DrizzleZoneVocabulary(db).lookup(String(formData.get("zoneId") ?? ""))
      : { cities: [], zones: [], aliases: [] };

  const { answers, raw } = readStepAnswers(stepId, formData, vocabulary);
  // El sellado va PEGADO al merge y no en `savePublicationDraft`, que no ve el
  // borrador anterior: el paso 8 manda las fotos en campos ocultos y
  // `applyStepAnswers` reemplaza el arreglo entero con ellos, asi que sin esta
  // linea cada guardado reestrenaria el sello y el tope de la 18.36 no serviria.
  // La regla vive entera en el dominio; aca solo se ordena la llamada.
  const after = stampUploadInstants(before, applyStepAnswers(before, stepId, answers), now);

  const curatedZones = after.listing.cityId
    ? await new DrizzleZoneCatalogue(db).listZonesForCity(after.listing.cityId)
    : [];

  const violations = validatePublishableListing(draftListingOf(after), curatedZones);
  const own = stepViolations(stepId, violations);

  await savePublicationDraft(
    session.userId,
    {
      ...after,
      violations: own,
      // Lo tecleado vuelve SOLO cuando hay algo que explicar. En la rama buena
      // seria peso muerto en una fila que se reescribe en cada paso.
      ...(own.length > 0 ? { raw } : {}),
    },
    now,
    draftStore,
  );

  // `redirect` lanza por diseno, asi que nada debajo de una llamada corre.
  if (own.length > 0) redirect(stepPath(stepId, returningToReview));

  const next = nextStepAfter(stepId, returningToReview);

  if (next !== "revisar") redirect(`/publicar/paso/${next}`);

  // Se dice que cambio, y se dice en la pantalla de revisar, que es adonde
  // vuelve quien vino de ahi. Van TODOS los campos distintos y no el primero:
  // la frase termina afirmando que el resto del aviso quedo como estaba, y el
  // paso 4 escribe cuatro campos de una sola vez.
  const changes = returningToReview ? describeDraftChanges(before, after) : [];

  redirect(reviewPathFor(changes));
}

/**
 * Publica lo revisado.
 *
 * **El aviso se guarda ANTES de pedir el codigo de verificacion** (criterio de
 * aceptacion 12). Pedir un codigo antes de que el aviso exista es pedir
 * esfuerzo sin nada a cambio, y deja sin resolver el caso de cerrar el
 * navegador a mitad de camino.
 *
 * La validacion corre otra vez aca, entera, dentro de `publishListing`. La
 * repeticion es deliberada: la importacion de cartera en lote pasa por la
 * misma funcion, y una regla implementada solo en un formulario es una regla
 * que el importador no tiene.
 */
export async function publishFromReview(): Promise<void> {
  const session = await requireSession("/publicar/revisar");
  const now = new Date();
  const draftStore = publicationDraftDependencies();

  const draft = await readPublicationDraft(session.userId, now, draftStore);
  // Sin borrador vencieron las 24 horas o la URL se escribio a mano. El
  // principio del flujo es donde eso se recupera.
  if (!draft) redirect("/publicar");

  const { photoCount: _derivado, ...values } = draftListingOf(draft);

  let listingId: string;
  try {
    const published = await publishListing(
      {
        ...values,
        photos: draft.photos.map((photo) => ({
          incomingKey: photo.key,
          // Todo lo que el subidor manda es WebP, porque lo comprimio el. La
          // declaracion se comprueba contra la cabecera del archivo despues
          // de bajarlo, asi que un valor equivocado se detecta, no se cree.
          declaredContentType: "image/webp",
        })),
      },
      publishListingDependencies(),
    );
    listingId = published.listingId;
  } catch (error) {
    // Un borrador rechazado vuelve al paso que tiene el campo. Cualquier otra
    // cosa — R2 inalcanzable, una foto que no es una imagen, una base que
    // rechazo la escritura — no es algo que quien publica pueda arreglar
    // editando un campo, asi que se deja propagar en vez de disfrazarla de
    // error de formulario.
    if (!(error instanceof PublishRejectedError)) throw error;

    await savePublicationDraft(
      session.userId,
      { ...draft, violations: error.violations },
      now,
      draftStore,
    );
    redirect("/publicar/revisar");
  }

  // Se descarta solo despues de que la escritura salio bien. Descartarlo antes
  // perderia lo que alguien escribio por una falla en la que no tuvo parte. Y se
  // descarta: dejar la fila viva haria que el aviso recien publicado volviera
  // como borrador en la pantalla siguiente.
  await discardPublicationDraft(session.userId, draftStore);
  redirect(`/publicar/listo?id=${encodeURIComponent(listingId)}`);
}
