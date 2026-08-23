import {
  EXPIRY_NOTICE_WINDOW_DAYS,
  PURGE_NOTICE_LEAD_DAYS,
  purgeDueAt,
  wholeDaysBetween,
} from "./expiry";

/**
 * **DOS correos, no uno** (19.5, decisión del fundador).
 *
 * Uno ANTES de vencer, para renovar. Otro ANTES de la purga, avisando que las
 * fotos se van. El segundo existe porque el primero puede no llegar —spam,
 * casilla llena, dirección vieja— y quien lo perdió perdería sus fotografías
 * sin ninguna otra advertencia. La borrada es irreversible; el correo es lo
 * único que la vuelve anunciada en vez de sorpresiva (19.8).
 *
 * **Quién recibe qué y qué dice se decide acá**, no en la ruta ni en la
 * plantilla. La plantilla dibuja un asunto y un cuerpo que llegan hechos.
 */

export type NoticeKind = "expiry" | "purge";

export interface NoticeListing {
  readonly id: string;
  readonly title: string;
  readonly expiresAt: Date;
}

export interface Notice {
  readonly subject: string;
  readonly body: string;
}

/**
 * Qué aviso corresponde HOY para este ciclo, o `null` si ninguno.
 *
 * Las dos ventanas no se solapan por construcción: la primera termina en el
 * vencimiento y la segunda empieza después. Sin esa frontera un aviso caería
 * en las dos y el mismo día saldrían los dos correos, que es lo contrario de
 * lo que 19.5 pide.
 */
export function noticeDueFor(expiresAt: Date, now: Date): NoticeKind | null {
  const untilExpiry = expiresAt.getTime() - now.getTime();
  if (untilExpiry > 0) {
    return wholeDaysBetween(now, expiresAt) <= EXPIRY_NOTICE_WINDOW_DAYS ? "expiry" : null;
  }

  const purgeAt = purgeDueAt(expiresAt);
  if (now.getTime() >= purgeAt.getTime()) return null;
  return wholeDaysBetween(now, purgeAt) <= PURGE_NOTICE_LEAD_DAYS ? "purge" : null;
}

/**
 * Fecha en español de Venezuela, escrita entera.
 *
 * Sin abreviar y sin formato numérico: `15/9` y `9/15` son la misma cadena
 * leída por dos personas distintas, y acá el número es el día en que alguien
 * pierde sus fotos.
 */
function spellDate(date: Date): string {
  return new Intl.DateTimeFormat("es-VE", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function plural(days: number): string {
  return days === 1 ? "1 día" : `${days} días`;
}

export function composeNotice(
  kind: NoticeKind,
  listing: NoticeListing,
  now: Date,
  renewalUrl: string,
): Notice {
  if (kind === "expiry") {
    const remaining = plural(wholeDaysBetween(now, listing.expiresAt));
    return {
      subject: `Tu aviso vence en ${remaining}`,
      body:
        `«${listing.title}» vence el ${spellDate(listing.expiresAt)}.\n\n` +
        `Renovalo por 30 días más desde acá:\n${renewalUrl}\n\n` +
        "Si no lo renovás, el aviso sale de la búsqueda pero no se borra: " +
        "podés volver a activarlo después.",
    };
  }

  const purgeAt = purgeDueAt(listing.expiresAt);
  return {
    subject: "Las fotos de tu aviso se borran pronto",
    body:
      `«${listing.title}» venció el ${spellDate(listing.expiresAt)} y sus fotos ` +
      `se borran el ${spellDate(purgeAt)}.\n\n` +
      `Renovalo antes de esa fecha y el aviso vuelve con sus fotos:\n${renewalUrl}\n\n` +
      "Después de esa fecha el aviso sigue existiendo, pero para volver a " +
      "publicarlo vas a tener que subir las fotos de nuevo. Esto no se deshace.",
  };
}
