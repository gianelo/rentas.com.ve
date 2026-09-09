import { Resend } from "resend";
import type {
  HeartbeatMailerPort,
  HeartbeatMessage,
} from "../application/ports/heartbeat-mailer.port";

/**
 * El adaptador de correo del latido (tasks.md 27.5), decisión del fundador:
 * Resend, la misma cuenta que `ResendLifecycleMailer` y `ResendMailer` ya
 * usan, con su propia variable de remitente — misma razón que las otras dos:
 * cambiar quién manda el latido no puede llevarse puesto el remitente del
 * ciclo de vida ni el del enlace de acceso.
 *
 * **Mismo mecanismo, mismo archivo repetido a propósito.** Este repositorio
 * ya tiene tres adaptadores de Resend con esta forma exacta —
 * `resend-lifecycle-mailer.ts`, `resend-mailer.ts` (identity),
 * `resend-contact-mailer.ts` (site-contact)— y ninguno comparte código con
 * los otros: cada módulo tiene su propio remitente y su propia decisión de
 * cuándo falla cerrado. Sumarle una abstracción compartida ahora acoplaría
 * cuatro módulos que hoy no se conocen entre sí, por ahorrarse un archivo de
 * cuarenta líneas que ya se prueba solo.
 */

const FROM_ENV = "HEARTBEAT_MAIL_FROM";
const KEY_ENV = "RESEND_API_KEY";

export class HeartbeatMailerNotConfiguredError extends Error {
  constructor(missing: string) {
    super(`resend-heartbeat-mailer: falta ${missing} en el entorno.`);
    this.name = "HeartbeatMailerNotConfiguredError";
  }
}

export class HeartbeatMailerSendError extends Error {
  constructor(to: string, cause: string) {
    super(`resend-heartbeat-mailer: no se pudo enviar a ${to} — ${cause}`);
    this.name = "HeartbeatMailerSendError";
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderHeartbeatHtml(body: string): string {
  const paragraphs = body
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter((block) => block !== "")
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, "<br />")}</p>`)
    .join("");

  return `<div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;font-size:16px;line-height:1.5;color:#101010">${paragraphs}</div>`;
}

/**
 * **Falla cerrado al construirse**, igual que los otros tres adaptadores:
 * sin clave o sin remitente tira acá en vez de dejar que `runHeartbeat`
 * descubra el correo caído justo cuando la base también lo está.
 */
export class ResendHeartbeatMailer implements HeartbeatMailerPort {
  private readonly client: Resend;
  private readonly from: string;

  constructor(
    apiKey: string | undefined = process.env[KEY_ENV],
    from: string | undefined = process.env[FROM_ENV],
    client?: Resend,
  ) {
    if (!apiKey) throw new HeartbeatMailerNotConfiguredError(KEY_ENV);
    if (!from) throw new HeartbeatMailerNotConfiguredError(FROM_ENV);

    this.from = from;
    this.client = client ?? new Resend(apiKey);
  }

  async send(message: HeartbeatMessage): Promise<void> {
    const { error } = await this.client.emails.send({
      from: this.from,
      to: message.to,
      subject: message.subject,
      text: message.body,
      html: renderHeartbeatHtml(message.body),
    });

    if (error) {
      throw new HeartbeatMailerSendError(message.to, error.message);
    }
  }
}
