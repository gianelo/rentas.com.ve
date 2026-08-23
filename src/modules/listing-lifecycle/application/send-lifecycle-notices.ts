import { composeNotice, noticeDueFor } from "../domain/lifecycle-notice";
import { mintRenewalToken } from "../domain/renewal-token";
import type { JobRunPort } from "./ports/job-run.port";
import type { LifecycleListing, LifecycleListingsPort } from "./ports/lifecycle-listings.port";
import type { LifecycleMailerPort } from "./ports/lifecycle-mailer.port";
import type { ReminderLedgerPort } from "./ports/reminder-ledger.port";

/**
 * El trabajo de los recordatorios (tasks.md 7.7, 19.5).
 *
 * Hace tres cosas, en este orden y por esta razón:
 *
 * 1. **Marca vencidos.** Primero, porque el estado es lo que saca al aviso de
 *    la búsqueda y esa es la parte que un tercero nota. Si el envío del correo
 *    se cayera entero, el catálogo igual quedó correcto.
 * 2. **Manda lo que toca**, reservando ANTES de mandar.
 * 3. **Anota la corrida**, con o sin trabajo, con o sin fallas.
 *
 * **Ninguna de las tres decisiones vive en la ruta.** La ruta traduce HTTP:
 * lee el encabezado, llama acá, devuelve JSON.
 */

export interface LifecycleNoticesResult {
  readonly selected: number;
  readonly remindersSent: number;
  readonly skipped: number;
  readonly failed: number;
  readonly expiredMarked: number;
}

export interface LifecycleNoticesDependencies {
  readonly listings: LifecycleListingsPort;
  readonly ledger: ReminderLedgerPort;
  readonly mailer: LifecycleMailerPort;
  readonly jobRuns: JobRunPort;
  readonly renewalSecret: string;
  readonly baseUrl: string;
  readonly now?: () => Date;
}

/** Se recorta para que una tanda entera caída no escriba un megabyte por fila. */
const MAX_FAILURE_DETAIL = 2000;

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function sendLifecycleNotices(
  dependencies: LifecycleNoticesDependencies,
): Promise<LifecycleNoticesResult> {
  const { listings, ledger, mailer, jobRuns, renewalSecret, baseUrl } = dependencies;
  const now = dependencies.now ?? (() => new Date());
  const startedAt = now();

  const expiredMarked = await listings.markExpired(startedAt);
  const candidates = await listings.noticeCandidates(startedAt);

  let sent = 0;
  let skipped = 0;
  const failures: string[] = [];

  for (const candidate of candidates) {
    const kind = noticeDueFor(candidate.expiresAt, startedAt);
    if (kind === null) continue;

    // La reserva va PRIMERO. Mandar y después anotar convierte cualquier caída
    // en el medio en un correo repetido, que es justo lo que 7.6 prohíbe.
    const claimed = await ledger.claim({
      listingId: candidate.id,
      kind,
      expiresAt: candidate.expiresAt,
      sentAt: startedAt,
    });
    if (!claimed) {
      skipped += 1;
      continue;
    }

    try {
      await deliver(candidate, kind, startedAt, renewalSecret, baseUrl, mailer);
      sent += 1;
    } catch (error) {
      failures.push(`${candidate.id}: ${describeError(error)}`);
      // Se devuelve la reserva para que la próxima corrida reintente. Sin
      // esto, un proveedor caído cinco minutos deja el ciclo mudo para
      // siempre — y en el correo de purga eso cuesta las fotos de alguien.
      await ledger
        .release({ listingId: candidate.id, kind, expiresAt: candidate.expiresAt })
        .catch(() => {
          // La falla ya está contada; no se pisa con la del `release`.
        });
    }
  }

  await jobRuns.record({
    job: "expiry-reminders",
    startedAt,
    finishedAt: now(),
    selected: candidates.length,
    succeeded: sent,
    skipped,
    failed: failures.length,
    failureDetail: failures.length === 0 ? null : failures.join("\n").slice(0, MAX_FAILURE_DETAIL),
  });

  return {
    selected: candidates.length,
    remindersSent: sent,
    skipped,
    failed: failures.length,
    expiredMarked,
  };
}

async function deliver(
  candidate: LifecycleListing,
  kind: "expiry" | "purge",
  now: Date,
  secret: string,
  baseUrl: string,
  mailer: LifecycleMailerPort,
): Promise<void> {
  // Una cuenta sin correo no es un error del trabajo, pero tampoco es un
  // envío: se cuenta como falla para que aparezca en `job_run` en lugar de
  // desaparecer entre los «saltados».
  if (!candidate.publisherEmail) {
    throw new Error("la cuenta que publicó no tiene correo");
  }

  const token = mintRenewalToken(
    { listingId: candidate.id, expiresAt: candidate.expiresAt },
    secret,
  );
  const notice = composeNotice(kind, candidate, now, `${baseUrl}/renovar/${token}`);

  await mailer.send({ to: candidate.publisherEmail, ...notice });
}
