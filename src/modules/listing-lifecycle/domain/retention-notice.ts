import { longSpanishDate } from "../../../shared/format/spanish-date";
import { purgeDueAt, wholeDaysBetween } from "./expiry";

/**
 * **El segundo canal de la retención** (19.6), y qué promete «volver a
 * publicar» a cada lado de la purga (19.7).
 *
 * **Por qué existe.** `lifecycle-notice.ts` anuncia la purga por correo, y un
 * correo puede no llegar: spam, casilla llena, dirección vieja. Es el mismo
 * riesgo de entrega que vuelve frágil el enlace mágico (15.2), sólo que acá
 * lo que se pierde no es un inicio de sesión sino las fotografías de alguien,
 * para siempre. Una política de retención anunciada por un canal que falla en
 * silencio está anunciada por ninguno, y ese anuncio es lo único que la
 * distingue de «borrar data real» (19.8).
 *
 * **Vive acá y no en `/mis-avisos`** (AGENTS.md §1). Qué frase lee quien
 * publica es una afirmación sobre el producto —el mismo reparto que
 * `lifecycle-notice.ts` ya eligió para los dos correos: el dominio decide el
 * caso Y escribe la frase, bajo el piso del 90%—. Escrita en la pantalla
 * sería una promesa que nada protege, y de las dos de 19.7 la equivocada
 * manda a alguien a tocar un botón esperando su aviso de vuelta.
 *
 * **La cuenta de fotos manda sobre el reloj.** El reloj dice cuándo DEBERÍAN
 * borrarse; la fila dice si se borraron. No es lo mismo: el cron de la purga
 * sigue deliberadamente ausente de `vercel.json` (19.4), así que hay avisos
 * cuya fecha ya pasó y cuyas seis fotos siguen ahí. Decidir por el reloj le
 * diría a esa persona que perdió lo que todavía tiene.
 */

export type RetentionNoticeKind = "countdown" | "purged";

export interface RetentionNotice {
  readonly kind: RetentionNoticeKind;
  /** El conteo regresivo, o el hecho ya consumado (19.6). */
  readonly deadline: string;
  /** Qué promete hoy volver a publicar este aviso (19.7). */
  readonly republish: string;
}

function plural(days: number): string {
  return days === 1 ? "falta 1 día" : `faltan ${days} días`;
}

/**
 * El aviso de retención de un ciclo ya vencido.
 *
 * `photoCount` es la cuenta que el puerto ya trajo y `expiresAt` el
 * vencimiento del ciclo; `now` entra por parámetro como en todo este
 * directorio, porque «faltan diez días» es una respuesta sobre un instante.
 */
export function retentionNoticeFor(
  photoCount: number,
  expiresAt: Date,
  now: Date,
): RetentionNotice {
  if (photoCount === 0) {
    return {
      kind: "purged",
      deadline: "Las fotos de este aviso ya se borraron.",
      republish: "Volver a publicarlo significa subir las fotos de nuevo.",
    };
  }

  const remaining = wholeDaysBetween(now, purgeDueAt(expiresAt));

  // Sin días que contar no se nombra un día: `wholeDaysBetween` devuelve cero
  // tanto el día justo como semanas después, y escribir «se borran el 16 de
  // septiembre» un 20 de septiembre es nombrar una fecha que ya pasó.
  if (remaining === 0) {
    return {
      kind: "countdown",
      deadline: "Sus fotos se borran en la próxima limpieza.",
      republish: "Renovalo ya: mientras las fotos estén, el aviso vuelve con ellas.",
    };
  }

  return {
    kind: "countdown",
    deadline: `Sus fotos se borran el ${longSpanishDate(purgeDueAt(expiresAt))} — ${plural(remaining)}.`,
    republish: "Renovalo antes de esa fecha y el aviso vuelve con sus fotos.",
  };
}
