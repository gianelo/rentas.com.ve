/**
 * **El latido** (tasks.md 27.5): «no se puede ver el consumo, así que se
 * vigila la consecuencia».
 *
 * En el plan Free de Neon no hay aviso de gasto ni API de consumo — las dos
 * son sólo de los planes Launch/Scale, verificado contra la documentación el
 * 2026-09-07. Por eso este archivo no mide cuota: mide si la base sigue
 * contestando, que es lo único que el plan permite ver sin comprar otro plan.
 *
 * **Puro a propósito**, igual que `row-budget.ts`: sin I/O, sin `fetch`, sin
 * `Date.now()` implícito — quien llama trae el estado ya observado (el
 * status HTTP que la ruta de salud contestó, o `"unreachable"` si ni eso) y
 * el reloj, para que esto se pruebe sin red y sin reloj real.
 */

export type HeartbeatOutcome = "alive" | "dead";

/**
 * **Cualquier cosa que no sea exactamente 200 es la base caída**, no sólo un
 * 5xx. Un 404 —la ruta movida, un despliegue roto— es tan silencioso como un
 * 503 si nadie lo cuenta como falla: el latido no distingue POR QUÉ no
 * contestó, sólo que no contestó lo que se le pidió.
 */
export function heartbeatOutcome(status: number): HeartbeatOutcome {
  return status === 200 ? "alive" : "dead";
}

export interface HeartbeatFailure {
  readonly url: string;
  /** `"unreachable"` cuando el pedido ni siquiera volvió con un status. */
  readonly status: number | "unreachable";
  readonly checkedAt: Date;
}

export interface HeartbeatNotice {
  readonly subject: string;
  readonly body: string;
}

function spellDateTime(date: Date): string {
  return new Intl.DateTimeFormat("es-VE", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(date);
}

/**
 * El correo que se manda cuando el latido no encuentra la base viva.
 *
 * **No dice «vas por el 80%».** No hay ningún número de cuota que este plan
 * pueda ofrecer — es exactamente la ausencia que esta tarea documentó. Dice
 * la consecuencia observada: la URL, cuándo se comprobó y qué contestó (o que
 * no contestó nada), y remite al panel de Neon para lo que el latido no puede
 * ver por ningún medio automático.
 */
export function composeHeartbeatFailureNotice(failure: HeartbeatFailure): HeartbeatNotice {
  const statusText =
    failure.status === "unreachable" ? "no respondió" : `respondió con ${failure.status}`;

  return {
    subject: "El latido no encontró la base viva",
    body:
      `${failure.url} ${statusText} el ${spellDateTime(failure.checkedAt)} (UTC).\n\n` +
      "Esto no mide cuánta cuota queda — el plan Free de Neon no lo permite por " +
      "ningún medio automático (tasks.md 27.5) — sólo que la consecuencia ya se " +
      "ve. Revisá el panel de Neon para confirmar la causa.",
  };
}
