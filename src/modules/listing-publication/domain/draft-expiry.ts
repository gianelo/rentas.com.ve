import type { DraftPhoto, PublicationDraft } from "./publication-steps";

/**
 * Cuánto vive un borrador de publicar, como regla y no como columna.
 *
 * **Las veinticuatro horas son del fundador** (2026-09-01): «un trabajo que a
 * las 24 horas limpia una publicación abandonada; si el que publica vuelve,
 * retoma donde estaba».
 *
 * **La ventana vive acá y no en el esquema.** Un `DEFAULT` en la columna la haría una
 * migración cada vez que cambie; derivada de un `updated_at`, bajarla a doce horas
 * vencería en el acto borradores guardados con la promesa de veinticuatro. Guardando
 * el INSTANTE, cada fila conserva la promesa con la que se escribió.
 */
export const DRAFT_LIFETIME_MS = 24 * 60 * 60 * 1000;

/**
 * tasks.md 18.36 — **cuánto conserva el bucket un objeto `incoming/`, contado
 * desde la subida y no desde el último guardado.**
 *
 * Es la regla `barrer-subidas-sin-adjuntar` de la 18.23; el fundador la subió de
 * 1 día a 7 el 2026-09-01. **Eso mitiga y no arregla**: la regla cuenta desde la
 * subida y el vencimiento corre en cada guardado, así que un borrador renovado a
 * diario le gana a cualquier plazo fijo. Lo que arregla es el tope de abajo.
 *
 * Vive al lado de la ventana del borrador porque las dos son la misma pregunta
 * por los dos lados: cuánto puede prometer la fila y cuánto conserva el bucket.
 * En dos archivos, el día que el número cambie uno se queda viejo en silencio.
 */
export const INCOMING_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Cuándo el bucket se lleva el objeto que esta foto nombra, o `null` cuando no se
 * sabe. **Sin sello no se acorta nada**: lo pone `stampUploadInstants` en el
 * mismo guardado que calcula el vencimiento, así que una foto sin él viene de una
 * fila anterior a esta regla, y acortarla le quitaría el borrador a alguien por
 * un despliegue que no vio.
 */
function bucketDeadlineOf(photo: DraftPhoto): number | null {
  if (photo.uploadedAt === undefined) return null;

  const uploaded = Date.parse(photo.uploadedAt);
  return Number.isNaN(uploaded) ? null : uploaded + INCOMING_RETENTION_MS;
}

/**
 * Se llama en CADA guardado: así se cumple la segunda mitad de la frase del
 * fundador sin que nadie tenga que acordarse de renovar nada aparte.
 *
 * **Y nunca más allá de la foto que primero se muere** (tasks.md 18.36). El
 * borrador nombra objetos `incoming/` que el bucket borra a los
 * `INCOMING_RETENTION_MS` de la SUBIDA; correr el vencimiento sin mirarlos deja
 * la fila prometiendo un aviso que ya no se puede publicar. Manda la más vieja:
 * con una sola clave que falte, publicar falla entero. El tope puede caer en el
 * pasado, y ahí ya venció (AGENTS.md §7): `load` deja de devolver la fila y
 * `readPublicationDraftOrExpiry` lo explica, que es una negativa con frase en
 * vez de un fallo al publicar sin ninguna.
 */
export function draftExpiresAt(now: Date, photos: readonly DraftPhoto[] = []): Date {
  // Un `Date` nuevo, nunca `now.setUTCHours(...)`: el caso de uso que decidió
  // este instante lo sigue usando después de esta llamada.
  const renewed = now.getTime() + DRAFT_LIFETIME_MS;

  let earliest = renewed;
  for (const photo of photos) {
    const deadline = bucketDeadlineOf(photo);
    if (deadline !== null && deadline < earliest) earliest = deadline;
  }

  return new Date(earliest);
}

/**
 * tasks.md 18.36 — **cuándo vio el servidor cada clave por primera vez.**
 *
 * El sello no puede venir del formulario: el paso 8 manda las fotos en campos
 * ocultos y `applyStepAnswers` reemplaza el arreglo entero con lo que llegó, así
 * que un `uploadedAt` que viajara ahí sería el navegador decidiendo cuánto vive
 * el borrador. **Conservar por clave es la mitad que hace que el tope sirva**:
 * resellar en cada guardado devolvería el defecto entero.
 *
 * El instante llega tarde por lo que la persona tardó entre subir y seguir, nunca
 * temprano — el subidor hace el PUT al elegir el archivo y los campos ocultos
 * viajan con el mismo formulario —, así que el tope que sale de él es optimista
 * en esos minutos y jamás en días.
 */
export function stampUploadInstants(
  previous: PublicationDraft,
  current: PublicationDraft,
  now: Date,
): PublicationDraft {
  const stamped = now.toISOString();

  return {
    ...current,
    photos: current.photos.map((photo) => ({
      ...photo,
      // Sólo `previous` o este instante: lo que `current` traiga en el campo
      // se descarta a propósito, porque `current` es el formulario.
      uploadedAt: previous.photos.find((known) => known.key === photo.key)?.uploadedAt ?? stamped,
    })),
  };
}

/**
 * **El borde se cierra hacia el vencimiento** (AGENTS.md §7): en el instante
 * exacto ya venció, así que la lectura pide `expires_at > $ahora` y no `>=`. El
 * barrido borra las fotos de R2 por esta misma regla, y devolver un borrador cuyas
 * claves otra transacción está borrando es la única forma de llegar a revisar un
 * aviso al que le faltan imágenes.
 */
export function hasDraftExpired(expiresAt: Date, now: Date): boolean {
  return now.getTime() >= expiresAt.getTime();
}
