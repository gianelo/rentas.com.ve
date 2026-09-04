import type { ContactMethod } from "../../listing-publication/domain/publishable-listing";

/**
 * tasks.md 19.9 / 19.10 — qué hace falta para que el contacto elegido al
 * publicar cuente como verificado.
 *
 * **La unidad es el triple (cuenta, método, valor), nunca la persona.** Si
 * María verifica +58 412 555 0134 y después publica con otro número, ese otro
 * número no está verificado. Tratarlo como verificado porque alguna vez
 * verificó algo es lo que hace que la verificación deje de significar nada, y
 * distinguir un aviso real de uno falso es lo único para lo que existe.
 *
 * **Acá SÍ se decide si una verificación sigue viva, y es una corrección al
 * texto de la 19.9 con su razón (AGENTS.md §5).** Este comentario decía que
 * los doce meses de la 19.11 eran un `WHERE verified_at > $desde` del puerto
 * de lectura y que por eso `verifiedAt` llegaba ya filtrado. Ese puerto lo
 * comparten los DOS caminos —`resolveContactVerification` al publicar y
 * `viewListingContact` al dibujar la ficha—, así que el `WHERE` habría
 * borrado la frase «verificado el …» de un aviso ya publicado y todavía
 * activo el día que su verificación caduca: exactamente la invalidación que
 * la 19.12 prohíbe. La ventana vive entonces en la decisión de publicar, que
 * es la única que la 19.11 nombra, y la ficha sigue leyendo la fila cruda y
 * escribiendo la FECHA en vez de un estado.
 *
 * Sigue sin haber I/O y sin reloj propio: `now` entra como parámetro, la
 * misma forma que `isVerificationLinkExpired` usa en este mismo módulo y que
 * `resolveListingAvailability` documenta —«es lo que mantiene la función pura
 * y su test repetible»—. Sigue sin hacer falta una migración: `verified_at`
 * ya existe.
 */
export interface ChosenContact {
  readonly method: ContactMethod;
  readonly value: string;
}

/**
 * Todo lo que la decisión necesita saber, en una sola lectura.
 *
 * Va junto y no en dos puertos porque es una sola pregunta —«qué sabe esta
 * cuenta de este contacto»— y porque 16.12, 16.34 y 15.11 van a hacerla en el
 * camino de dibujo de la ficha, donde una segunda consulta se paga en cada
 * visita.
 */
export interface ContactVerificationEvidence {
  /**
   * `verified_contact.verified_at` para ESTE triple, o `null`. La ausencia de
   * fila es la respuesta «no verificado» (AGENTS.md §7): no hay valor por
   * defecto que convierta un hueco en un permiso.
   */
  readonly verifiedAt: Date | null;
  /** `user.email`. */
  readonly accountEmail: string | null;
  /**
   * `user.emailVerified`.
   *
   * **Lo pone la puerta del enlace por correo, y NO lo pone Google.** La
   * tarea 19.10 da por hecho que Auth.js lo escribe por las dos puertas;
   * contra `@auth/core` 0.41.3 eso es falso para OAuth —
   * `lib/actions/callback/handle-login.js:260` crea la cuenta con
   * `emailVerified: null` explícito, sea cual sea lo que devuelva
   * `profile()`, así que `toMinimalGoogleProfile` no tiene cómo cambiarlo.
   * Ver la tarea 19.14 del plan: cerrar ese hueco es su propia entrega, y
   * hasta entonces esta regla cierra en falso en vez de inventar el instante.
   */
  readonly accountEmailVerifiedAt: Date | null;
}

/**
 * `already-verified` no pide nada (19.9). `verified-by-account-email` tampoco
 * pide nada, y además hay que registrarlo: la verificación ya ocurrió al
 * entrar, esto sólo la escribe donde la ficha pueda leerla. `unverified` es
 * todo lo demás — y hoy no tiene forma de resolverse, porque el canal de
 * WhatsApp está diferido al final del proyecto (fundador, 2026-08-29).
 */
export type ContactVerification =
  | { readonly kind: "already-verified"; readonly verifiedAt: Date }
  | { readonly kind: "verified-by-account-email"; readonly verifiedAt: Date }
  | { readonly kind: "unverified" };

/** Una dirección es la misma escrita con otras mayúsculas o con un espacio pegado. */
export function normaliseEmail(value: string): string {
  return value.trim().toLowerCase();
}

/** tasks.md 19.11 — decisión del fundador del 2026-08-22. */
export const CONTACT_VERIFICATION_MONTHS = 12;

/**
 * Si una verificación todavía vale, contando desde el instante en que
 * ocurrió.
 *
 * **El corte es `>` y no `>=`**, el mismo borde que `resolveListingAvailability`
 * documenta y el mismo que el `WHERE verified_at > $desde` del puerto tenía
 * escrito: los doce meses cumplidos son el primer instante que ya no vale.
 *
 * Los meses se restan del calendario y no en días, así que la ventana no se
 * corre con los años bisiestos; el 29 de febrero cae en el 1 de marzo, que es
 * lo que `setUTCMonth` hace y lo que un vencimiento un día antes haría de
 * todos modos.
 */
export function contactVerificationIsLive(verifiedAt: Date, now: Date): boolean {
  const desde = new Date(now.getTime());
  desde.setUTCMonth(desde.getUTCMonth() - CONTACT_VERIFICATION_MONTHS);
  return verifiedAt > desde;
}

/**
 * tasks.md 22.32 — el sí/no que el estado bloqueado necesita, nunca el valor.
 *
 * **Existe porque el puerto nuevo (`ListingContactVerificationPort`) sólo
 * puede devolver el instante crudo, no la decisión.** Vigencia exige un
 * reloj, y el mismo motivo por el que la ventana de la 19.11 no vive en el
 * `WHERE` de ningún puerto compartido se aplica acá: decidirla en SQL o en el
 * adaptador la volvería invisible a esta prueba. `null` — sin fila de
 * verificación — se lee como «no verificado», el mismo default en falso que
 * el resto de este módulo usa (AGENTS.md §7): no hay instante que envejecer,
 * así que no hay nada que declarar vigente.
 */
export function listingContactIsVerified(verifiedAt: Date | null, now: Date): boolean {
  return verifiedAt !== null && contactVerificationIsLive(verifiedAt, now);
}

export function decideContactVerification(
  chosen: ChosenContact,
  evidence: ContactVerificationEvidence | null,
  now: Date,
): ContactVerification {
  if (!evidence) return { kind: "unverified" };

  // Una fila caducada NO gana por existir: cae, y el atajo del correo de abajo
  // vuelve a contestar si puede. Eso ES «a publish whose verification has
  // lapsed re-verifies» (19.11), y el `upsert` mueve el instante hacia
  // adelante en la misma fila.
  if (evidence.verifiedAt && contactVerificationIsLive(evidence.verifiedAt, now)) {
    return { kind: "already-verified", verifiedAt: evidence.verifiedAt };
  }

  // **El único atajo, y exige `email` antes de mirar el valor.** Mandar un
  // código de WhatsApp para verificar una dirección de correo nunca tuvo
  // sentido (19.10); esto quita el paso en vez de implementarlo. Que la
  // comparación viva DESPUÉS del método es lo que impide que un teléfono
  // llegue nunca a esta rama.
  if (chosen.method !== "email") return { kind: "unverified" };

  if (!evidence.accountEmail || !evidence.accountEmailVerifiedAt) {
    return { kind: "unverified" };
  }

  // **Los MISMOS doce meses, y la 19.10 ya lo había decidido.** Registrar
  // `user.emailVerified` en vez de `now()` sólo tiene sentido si ese instante
  // es el que envejece; si el atajo no caducara, un `emailVerified` de tres
  // años entraría igual y se escribiría ya vencido — y la publicación
  // siguiente lo volvería a escribir, que es la 19.13 al revés.
  if (!contactVerificationIsLive(evidence.accountEmailVerifiedAt, now)) {
    return { kind: "unverified" };
  }

  const value = normaliseEmail(chosen.value);
  if (value === "" || value !== normaliseEmail(evidence.accountEmail)) {
    return { kind: "unverified" };
  }

  return { kind: "verified-by-account-email", verifiedAt: evidence.accountEmailVerifiedAt };
}
