import {
  composeHeartbeatFailureNotice,
  type HeartbeatOutcome,
  heartbeatOutcome,
} from "../domain/heartbeat";
import type { HeartbeatMailerPort } from "./ports/heartbeat-mailer.port";

/**
 * El vigilante en sí (tasks.md 27.5).
 *
 * **Este caso de uso no decide nada nuevo**: el corte alive/dead lo decide
 * `heartbeatOutcome`, el texto del correo lo decide `composeHeartbeatFailureNotice`.
 * Esto sólo orquesta las tres piezas — comprobar, decidir, avisar SOLO si
 * hace falta — y por eso es lo que `scripts/heartbeat.ts` llama sin repetir
 * ninguna de esas reglas.
 *
 * **Manda correo únicamente en la falla, y es la decisión del fundador.**
 * Un latido que también avisara en éxito enseñaría a quien lo lee a
 * ignorarlo, y gastaría cuota de Resend por nada.
 */

export interface HealthCheckResult {
  readonly status: number | "unreachable";
}

export interface RunHeartbeatDependencies {
  readonly checkHealth: () => Promise<HealthCheckResult>;
  readonly mailer: HeartbeatMailerPort;
  readonly url: string;
  readonly notifyTo: string;
  readonly now?: () => Date;
}

export interface HeartbeatResult {
  readonly outcome: HeartbeatOutcome;
  readonly notified: boolean;
}

export async function runHeartbeat(deps: RunHeartbeatDependencies): Promise<HeartbeatResult> {
  const now = deps.now ?? (() => new Date());
  const checked = await deps.checkHealth();

  const outcome: HeartbeatOutcome =
    checked.status === "unreachable" ? "dead" : heartbeatOutcome(checked.status);

  if (outcome === "alive") {
    return { outcome, notified: false };
  }

  const notice = composeHeartbeatFailureNotice({
    url: deps.url,
    status: checked.status,
    checkedAt: now(),
  });
  await deps.mailer.send({ to: deps.notifyTo, ...notice });

  return { outcome, notified: true };
}
