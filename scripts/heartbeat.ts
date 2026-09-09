#!/usr/bin/env tsx
/**
 * El latido en sí (tasks.md 27.5) — lo que `.github/workflows/heartbeat.yml`
 * corre cada 5 minutos, y lo que `pnpm run heartbeat` corre a mano.
 *
 * **Ninguna decisión vive acá.** Comprueba `HEARTBEAT_URL`, llama a
 * `runHeartbeat` y traduce el resultado a un código de salida — la misma
 * separación que cada ruta de `app/api/jobs/*` ya usa entre "traducir HTTP"
 * y "decidir". Vivo/muerto lo decide `heartbeatOutcome`, el correo lo
 * compone `composeHeartbeatFailureNotice`, y a quién avisar y con qué
 * remitente lo decide el entorno, no este archivo.
 *
 * **Sale con código 1 cuando la base está caída, y es a propósito.** Un job
 * de GitHub Actions en rojo nadie lo mira solo — es la misma frase del
 * fundador que abrió esta tarea— pero el correo de Resend YA salió antes de
 * que el proceso termine, así que el rojo es una segunda señal, no la única.
 */
import { runHeartbeat } from "../src/modules/operability/application/run-heartbeat";
import { ResendHeartbeatMailer } from "../src/modules/operability/infrastructure/resend-heartbeat-mailer";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`heartbeat: falta ${name} en el entorno.`);
    process.exit(1);
  }
  return value;
}

const url = requireEnv("HEARTBEAT_URL");
const notifyTo = requireEnv("HEARTBEAT_MAIL_TO");

async function checkHealth() {
  try {
    const response = await fetch(url, { method: "GET" });
    return { status: response.status };
  } catch {
    return { status: "unreachable" as const };
  }
}

const result = await runHeartbeat({
  checkHealth,
  mailer: new ResendHeartbeatMailer(),
  url,
  notifyTo,
});

if (result.outcome === "dead") {
  console.error(`heartbeat: ${url} no contestó viva. Aviso enviado a ${notifyTo}.`);
  process.exit(1);
}

console.log(`heartbeat: ${url} está viva.`);
