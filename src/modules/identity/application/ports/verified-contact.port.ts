import type { ChosenContact, ContactVerificationEvidence } from "../../domain/contact-verification";

/**
 * Los dos lados de `verified_contact` (tasks.md 19.9), separados a propósito.
 *
 * **La lectura va al lado de la escritura y no dentro de ella** (AGENTS.md
 * §3). La escritura es una sola operación idempotente sobre el triple, y ésa
 * es la forma que hace caer sola la 19.13 —«una inmobiliaria que sube
 * cincuenta avisos verifica una vez»—; agregarle un `find` la convertiría en
 * el sitio donde alguien un día escribe un `findOrCreate`, y ahí se pierde.
 */

export interface ContactVerificationQuery {
  readonly userId: string;
  readonly contact: ChosenContact;
}

/**
 * Una sola lectura para la decisión entera: la fila viva del triple más lo
 * que la cuenta prueba sobre su propio correo. Devuelve `null` cuando la
 * cuenta no existe — que se lee como «no verificado» y nunca como «sin
 * restricciones».
 *
 * **Acá es donde la 19.11 NO vive, y es la advertencia que este comentario
 * tiene que dar en vez de la instrucción que daba.** Decía que los doce meses
 * se aplicaban como un `WHERE verified_at > $desde` de esta consulta. Este
 * puerto lo llaman LOS DOS caminos —`resolveContactVerification` al publicar y
 * `viewListingContact` al dibujar la ficha—, así que ese `WHERE` le borraría
 * la frase «verificado el …» a un aviso ya publicado y todavía activo el día
 * que su verificación caduca: la invalidación que la 19.12 prohíbe. Peor: no
 * lo delataría ninguna prueba, porque las de la ficha reemplazan este puerto
 * por un falso y `infrastructure/` no tiene piso de cobertura.
 *
 * La ventana vive en `decideContactVerification`, que sólo está en el camino
 * de publicar. Lo que sale de acá es la fila CRUDA, y la ficha la quiere así.
 */
export interface ContactVerificationEvidencePort {
  findEvidence(query: ContactVerificationQuery): Promise<ContactVerificationEvidence | null>;
}

export interface NewVerifiedContact {
  readonly userId: string;
  readonly contact: ChosenContact;
  /**
   * Cuándo se verificó el valor, NO cuándo se publicó. Para el atajo del
   * correo de la cuenta es el instante que Auth.js dejó en
   * `user.emailVerified`: es el reloj desde el que la 19.11 tiene que contar,
   * y `now()` adelantaría la caducidad un año entero.
   */
  readonly verifiedAt: Date;
}

/**
 * Escribe —o mueve— el instante de un triple. `record` y nada más: sin
 * `delete`, sin `findOrCreate` y sin poder marcar nada como verificado a
 * medias.
 *
 * **Es un upsert y no un insert**, porque la tabla guarda estado y no una
 * bitácora (ver el comentario de `verified_contact` en schema.ts). Volver a
 * verificar el mismo valor mueve `verified_at` hacia adelante; publicar el
 * aviso cincuenta y uno no escribe una fila nueva porque la clave primaria no
 * lo permite, no porque alguien haya recordado consultar antes.
 */
export interface VerifiedContactPort {
  record(verified: NewVerifiedContact): Promise<void>;
}
