import { readSiteBaseUrl } from "../../../../src/modules/listing-discovery/infrastructure/site-base-url";
import { sendLifecycleNotices } from "../../../../src/modules/listing-lifecycle/application/send-lifecycle-notices";
import { isAuthorizedJobRequest } from "../../../../src/modules/listing-lifecycle/domain/cron-authorization";
import {
  DrizzleJobRuns,
  DrizzleLifecycleListings,
  DrizzleReminderLedger,
  type LifecycleDatabase,
} from "../../../../src/modules/listing-lifecycle/infrastructure/drizzle-lifecycle";
import {
  readCronSecret,
  readMailerConfig,
  readRenewalSecret,
} from "../../../../src/modules/listing-lifecycle/infrastructure/lifecycle-config";
import { ResendLifecycleMailer } from "../../../../src/modules/listing-lifecycle/infrastructure/resend-lifecycle-mailer";
import { db } from "../../../../src/shared/db/client";

/**
 * El trabajo de recordatorios (tasks.md 7.4/7.5/7.7).
 *
 * **Esta ruta no decide nada.** Comprueba el portador, llama al caso de uso y
 * traduce el resultado a JSON. A quién avisar, cuál de los dos correos toca,
 * qué dice y cuándo se marca vencido: todo eso vive en
 * `src/modules/listing-lifecycle/`, y ninguna de esas reglas se puede cambiar
 * editando este archivo.
 *
 * **Sin autenticar devuelve 401 y `reminders_sent: 0`.** El cero es explícito
 * y no una omisión: un cliente que lea la respuesta tiene que poder afirmar
 * que no salió ningún correo, no deducirlo de un campo ausente.
 */

// La corrida toca la base en cada pedido; cachearla devolvería el conteo de
// ayer y haría creer que el trabajo corrió.
export const dynamic = "force-dynamic";

function unauthorized(): Response {
  return Response.json({ error: "unauthorized", reminders_sent: 0 }, { status: 401 });
}

async function run(request: Request): Promise<Response> {
  if (!isAuthorizedJobRequest(request.headers.get("authorization"), readCronSecret())) {
    return unauthorized();
  }

  const renewalSecret = readRenewalSecret();
  if (!renewalSecret) {
    // Sin secreto no se pueden firmar enlaces, y un correo con un enlace roto
    // es peor que ninguno: quema el aviso del ciclo sin dar salida.
    return Response.json({ error: "renewal_secret_missing", reminders_sent: 0 }, { status: 500 });
  }

  const mail = readMailerConfig();
  if (!mail) {
    // Mismo criterio que el secreto de renovación: sin proveedor, la tanda
    // NO empieza. Arrancarla tomaría el libro de reservas de cada aviso —
    // una reserva por ciclo — y los quemaría sin que salga un solo correo;
    // el siguiente intento los encontraría ya reservados y no reintentaría.
    return Response.json({ error: "mailer_not_configured", reminders_sent: 0 }, { status: 500 });
  }

  const handle = db as unknown as LifecycleDatabase;
  const result = await sendLifecycleNotices({
    listings: new DrizzleLifecycleListings(handle),
    ledger: new DrizzleReminderLedger(handle),
    mailer: new ResendLifecycleMailer(mail.apiKey, mail.from),
    jobRuns: new DrizzleJobRuns(handle),
    renewalSecret,
    baseUrl: readSiteBaseUrl(),
  });

  return Response.json({
    reminders_sent: result.remindersSent,
    selected: result.selected,
    skipped: result.skipped,
    failed: result.failed,
    expired_marked: result.expiredMarked,
  });
}

export async function POST(request: Request): Promise<Response> {
  return run(request);
}

/**
 * **El cron de Vercel dispara un `GET`, no un `POST`.**
 *
 * El contrato de la 7.4 es el `POST` y es el que está probado; este `GET`
 * existe porque la plataforma no ofrece otra cosa. No abre nada: pasa por el
 * mismo portador, así que ningún prefetch, previsualizador de enlaces ni
 * rastreador puede dispararlo — a diferencia del enlace de renovación, que sí
 * lo abre cualquiera y por eso su `GET` no muta.
 */
export async function GET(request: Request): Promise<Response> {
  return run(request);
}
