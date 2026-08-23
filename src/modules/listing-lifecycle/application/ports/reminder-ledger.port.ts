import type { NoticeKind } from "../../domain/lifecycle-notice";

/**
 * El libro de correos ya enviados (tasks.md 7.6).
 *
 * **`claim` es la restricción única, no una consulta.** La firma no ofrece un
 * `wasSent(...)` a propósito: cualquier «preguntar y después escribir» tiene
 * una ventana entre las dos operaciones, y dos corridas superpuestas del cron
 * caen las dos adentro y mandan las dos. `claim` es un solo `INSERT … ON
 * CONFLICT DO NOTHING` que devuelve si ganó. Quien pierde, no manda.
 *
 * **`release` existe por el otro lado del trato.** Se reserva ANTES de mandar,
 * porque al revés —mandar y después anotar— una caída en el medio manda dos
 * veces, que es exactamente lo que 7.6 prohíbe. El costo de reservar primero
 * es que un fallo del correo dejaría el ciclo mudo para siempre; `release`
 * devuelve la reserva para que la próxima corrida reintente. Si el proceso
 * muere entre el fallo y el `release`, ese aviso pierde su correo: queda
 * anotado en `job_run` como falla en vez de desaparecer.
 */

export interface ReminderClaim {
  readonly listingId: string;
  readonly kind: NoticeKind;
  readonly expiresAt: Date;
  readonly sentAt: Date;
}

export interface ReminderLedgerPort {
  /** `true` si esta corrida se quedó con el envío; `false` si ya era de otra. */
  claim(claim: ReminderClaim): Promise<boolean>;

  /** Devuelve la reserva cuando el envío falló, para que se reintente. */
  release(claim: Omit<ReminderClaim, "sentAt">): Promise<void>;
}
