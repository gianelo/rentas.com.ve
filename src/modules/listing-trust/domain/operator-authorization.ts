import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * La puerta de la ruta de restauración del operador (tasks.md 8.6).
 *
 * **Es dominio y no la ruta, siguiendo el mismo precedente que
 * `listing-lifecycle/domain/cron-authorization.ts`.** Este módulo declara su
 * propio secreto (`OPERATOR_SECRET`) en vez de importar el de los trabajos:
 * son dos guardias distintas — quién puede disparar un cron y quién puede
 * moderar un aviso — y compartir el secreto haría que rotar uno afecte al
 * otro sin ninguna razón de producto que lo pida.
 *
 * Comparación en tiempo constante por la misma razón que allá: un `===`
 * corta en el primer byte distinto, y esa diferencia de tiempo es medible
 * por red en suficientes intentos.
 *
 * Falla cerrado: sin `OPERATOR_SECRET` en el servidor no hay forma de
 * acertar.
 */
const SCHEME = "Bearer ";

export function isAuthorizedOperatorRequest(
  authorizationHeader: string | null,
  serverSecret: string | undefined,
): boolean {
  if (!serverSecret) return false;
  if (!authorizationHeader?.startsWith(SCHEME)) return false;

  const presented = authorizationHeader.slice(SCHEME.length);
  const a = createHmac("sha256", "compare").update(presented).digest();
  const b = createHmac("sha256", "compare").update(serverSecret).digest();
  return timingSafeEqual(a, b);
}
