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

/** Se llama en CADA guardado: así se cumple la segunda mitad de la frase del
 *  fundador sin que nadie tenga que acordarse de renovar nada aparte. */
export function draftExpiresAt(now: Date): Date {
  // Un `Date` nuevo, nunca `now.setUTCHours(...)`: el caso de uso que decidió
  // este instante lo sigue usando después de esta llamada.
  return new Date(now.getTime() + DRAFT_LIFETIME_MS);
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
