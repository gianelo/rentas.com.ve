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
 * **Acá no se decide si una verificación sigue viva.** Los doce meses de la
 * 19.11 son un `WHERE` del puerto de lectura, y por eso `verifiedAt` llega ya
 * filtrado: esta función recibe la fila que YA está dentro de la ventana, del
 * mismo modo que `reveal-rate-limit.ts` recibe los avisos que ya están dentro
 * de la suya. Sin `Date`, sin I/O y sin una sola comparación de fechas — lo
 * que convierte la 19.11 en un cambio de consulta y no en una migración.
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
function normaliseEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function decideContactVerification(
  chosen: ChosenContact,
  evidence: ContactVerificationEvidence | null,
): ContactVerification {
  if (!evidence) return { kind: "unverified" };

  if (evidence.verifiedAt) {
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

  const value = normaliseEmail(chosen.value);
  if (value === "" || value !== normaliseEmail(evidence.accountEmail)) {
    return { kind: "unverified" };
  }

  return { kind: "verified-by-account-email", verifiedAt: evidence.accountEmailVerifiedAt };
}
