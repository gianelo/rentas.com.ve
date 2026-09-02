/**
 * El reloj del aviso: cuándo vence, cuándo se avisa y cuándo se purgan las
 * fotos (tasks.md 7.2/7.3 y 19.4/19.5).
 *
 * **Todo esto es dominio puro y no toca la base ni el reloj del sistema.** El
 * `now` entra por parámetro en cada función, lo que es la diferencia entre
 * poder probar «el aviso venció hace diez días» en un milisegundo y tener que
 * mover fechas de fixtures cada vez que se corre la suite.
 *
 * La regla del fundador está escrita al lado de cada constante y no dispersa
 * en las consultas: quien cambie los 30 días cambia una línea, no seis
 * `WHERE`.
 */

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

/** SISTEMA.md pantalla 3: «Tu aviso queda activo 30 días». */
export const LISTING_LIFETIME_DAYS = 30;

/**
 * Los 15 días de gracia entre el vencimiento y la purga de las fotos
 * (19c). 30 + 15 = 45 días de retención, que es el número con el que se
 * calculó la capacidad de R2.
 */
export const PURGE_GRACE_DAYS = 15;

/**
 * La ventana con la que el trabajo ELIGE a quién avisar del vencimiento.
 *
 * El plan pide «vence en 3 días» (19.5) y una ventana de selección de 5
 * (7.7), y no se contradicen: la ventana es más ancha que el aviso a
 * propósito, para que un cron caído dos días siga alcanzando al aviso en vez
 * de saltárselo para siempre. Lo que impide que esa holgura mande el correo
 * varias veces NO es esta constante sino la restricción única de
 * `listing_reminder`.
 */
export const EXPIRY_NOTICE_WINDOW_DAYS = 5;

/**
 * Cuántos días antes de la purga sale el segundo correo. 19.5 lo fija en el
 * día 40 de un ciclo que purga el 45.
 */
export const PURGE_NOTICE_LEAD_DAYS = 5;

/**
 * Los estados del ciclo anunciado (19.16).
 *
 * **Es una sola lista porque son un solo conjunto, y ésa es la garantía.** La
 * retención borra fotos para siempre, y lo único que la separa de «borrar data
 * real» es que se anuncia (19.8): por correo en `lifecycle-notice.ts` y en la
 * pantalla en `retention-notice.ts`. Si el conjunto que la purga alcanza fuera
 * más ancho que el conjunto al que se le avisa, la diferencia sería
 * exactamente gente a la que se le borra sin decirle nada — que fue lo que
 * pasó hasta hoy con `hidden` y con `draft`.
 *
 * **`hidden` queda afuera y no por descuido**: a un aviso escondido por
 * reportes no se le ofrece renovar (9.31 deja `hidden` como está al renovar),
 * así que contarle los días sería anunciarle un borrado que no puede evitar, y
 * la frase de la 19.7 —«renovalo y el aviso vuelve con sus fotos»— sería falsa
 * justo en la ficha que la leería. Vuelve a entrar el día que la 9.31 decida
 * qué hace renovar con un oculto, y ese día es un elemento de esta lista.
 *
 * **`draft` queda afuera porque su `expires_at` no significa esto.** La
 * importación de cartera lo escribe como marcador de posición —«no carry
 * meaning before activation», dice `confirm-import.ts` al lado del valor—, así
 * que purgar por esa fecha es borrar por un número que nadie fijó. Si un
 * borrador tiene que perder sus fotos, lo hace el barrido que le corresponde y
 * con su propio criterio (la forma de la 18.32), no de rebote.
 */
export const ANNOUNCED_LIFECYCLE_STATUSES = ["active", "expired"] as const;

export interface ListingClock {
  readonly publishedAt: Date;
  /** `null` mientras nadie haya renovado. */
  readonly lastRenewedAt: Date | null;
}

function addDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * MILLISECONDS_PER_DAY);
}

/**
 * 30 días después de publicar o de la última renovación, **la que sea más
 * tarde**.
 *
 * El `Math.max` no es defensivo por gusto: una renovación con fecha anterior a
 * la publicación —reloj torcido, fila importada, corrección a mano— acortaría
 * la vida del aviso si se tomara sin comparar, y el publicador perdería días
 * que ya pagó con su tiempo. La regla dice «la que sea más tarde» y acá es
 * literal.
 */
export function expiryFor({ publishedAt, lastRenewedAt }: ListingClock): Date {
  const anchor = new Date(Math.max(publishedAt.getTime(), lastRenewedAt?.getTime() ?? 0));
  return addDays(anchor, LISTING_LIFETIME_DAYS);
}

/**
 * El nuevo vencimiento de una renovación hecha AHORA.
 *
 * Se cuenta desde el momento de renovar y no desde `expires_at`. Un aviso que
 * venció hace diez días y se renueva recibe 30 días completos: sumarle 30 al
 * vencimiento viejo le daría 20 y le cobraría el olvido, cuando 19c dice
 * justamente lo contrario — el vencido se conserva y sigue siendo renovable.
 */
export function renewedExpiry(renewedAt: Date): Date {
  return addDays(renewedAt, LISTING_LIFETIME_DAYS);
}

/** Estrictamente después: en el instante exacto el aviso todavía vive. */
export function isExpired(expiresAt: Date, now: Date): boolean {
  return now.getTime() > expiresAt.getTime();
}

/** El día en que las fotos de este ciclo se borran. */
export function purgeDueAt(expiresAt: Date): Date {
  return addDays(expiresAt, PURGE_GRACE_DAYS);
}

/**
 * Días enteros que faltan, redondeando HACIA ARRIBA y sin bajar de cero.
 *
 * Hacia arriba porque el correo dice «vence en 3 días» y truncar convertiría
 * 3 días y 20 horas en «2», que le quita un día a quien lo lee. Cero cuando ya
 * pasó, para que ninguna plantilla tenga que decidir qué hacer con un negativo.
 */
export function wholeDaysBetween(now: Date, target: Date): number {
  const remaining = target.getTime() - now.getTime();
  return remaining <= 0 ? 0 : Math.ceil(remaining / MILLISECONDS_PER_DAY);
}
