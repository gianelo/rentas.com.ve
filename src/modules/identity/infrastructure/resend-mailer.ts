import { Resend } from "resend";
import type { MailerPort, MailMessage } from "../application/ports/mailer.port";

/**
 * El adaptador de Resend del enlace mágico (tasks.md 15.2).
 *
 * Es el mismo mecanismo que `resend-lifecycle-mailer.ts` — mismo proveedor,
 * misma clave de cuenta— pero un adaptador propio: ver
 * `application/ports/mailer.port.ts` para la razón de no compartir el puerto.
 * El dominio (`domain/magic-link.ts`) redacta; esto sólo envuelve en el HTML
 * mínimo, sin decidir ni una palabra de lo que dice.
 */

const FROM_ENV = "AUTH_MAIL_FROM";
const KEY_ENV = "RESEND_API_KEY";

export class AuthMailerNotConfiguredError extends Error {
  constructor(missing: string) {
    super(`resend-mailer (identity): falta ${missing} en el entorno.`);
    this.name = "AuthMailerNotConfiguredError";
  }
}

export class AuthMailerSendError extends Error {
  constructor(to: string, cause: string) {
    super(`resend-mailer (identity): no se pudo enviar a ${to} — ${cause}`);
    this.name = "AuthMailerSendError";
  }
}

export interface AuthMailerConfig {
  readonly apiKey: string;
  readonly from: string;
}

/**
 * Las dos o ninguna, igual que `readMailerConfig` en
 * `listing-lifecycle/infrastructure/lifecycle-config.ts`. No lanza: devuelve
 * `undefined` y quien llama decide — acá es `sendVerificationRequest` en
 * `auth.ts`, que falla cerrado con `AuthMailerNotConfiguredError`.
 *
 * **Reusa `RESEND_API_KEY`** (misma cuenta de Resend que el ciclo de vida) y
 * **declara `AUTH_MAIL_FROM` aparte**: el remitente del enlace de acceso es
 * una decisión propia de `identity`, no la del correo de vencimiento — y
 * compartir la variable ataría un cambio de remitente en un módulo al otro.
 */
export function readAuthMailerConfig(
  env: Record<string, string | undefined> = process.env,
): AuthMailerConfig | undefined {
  const apiKey = env[KEY_ENV] || undefined;
  const from = env[FROM_ENV] || undefined;

  if (!apiKey || !from) return undefined;

  return { apiKey, from };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderAuthMailHtml(body: string): string {
  const paragraphs = body
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter((block) => block !== "")
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, "<br />")}</p>`)
    .join("");

  return `<div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;font-size:16px;line-height:1.5;color:#101010">${paragraphs}</div>`;
}

/**
 * Falla cerrado al construirse, igual que `ResendLifecycleMailer`: sin clave
 * o sin remitente, tira acá en vez de aceptar un envío que va a rebotar.
 */
export class ResendMailer implements MailerPort {
  private readonly client: Resend;
  private readonly from: string;

  constructor(
    apiKey: string | undefined = process.env[KEY_ENV],
    from: string | undefined = process.env[FROM_ENV],
    client?: Resend,
  ) {
    if (!apiKey) throw new AuthMailerNotConfiguredError(KEY_ENV);
    if (!from) throw new AuthMailerNotConfiguredError(FROM_ENV);

    this.from = from;
    this.client = client ?? new Resend(apiKey);
  }

  async send(message: MailMessage): Promise<void> {
    const { error } = await this.client.emails.send({
      from: this.from,
      to: message.to,
      subject: message.subject,
      text: message.body,
      html: renderAuthMailHtml(message.body),
    });

    if (error) {
      throw new AuthMailerSendError(message.to, error.message);
    }
  }
}
