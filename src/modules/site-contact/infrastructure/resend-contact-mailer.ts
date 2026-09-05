import { Resend } from "resend";
import type { ContactMailerPort, ContactMessage } from "../application/ports/contact-mailer.port";

/**
 * El adaptador de Resend de "Escribinos" (tasks.md 23.7) — la "nueva vía de
 * salida" que la tarea pide, y el único lugar donde la dirección de destino
 * se lee.
 *
 * **Reusa `RESEND_API_KEY` y `AUTH_MAIL_FROM`, y NO declara un remitente
 * propio.** Es una excepción deliberada al patrón que `resend-mailer.ts` y
 * `resend-lifecycle-mailer.ts` siguen — cada uno con su propio `_FROM` para
 * no atar el remitente de un módulo al del otro — porque la tarea 23.7 en sí
 * lo decide así: "una variable de entorno nueva JUNTO A `AUTH_MAIL_FROM`",
 * no una cuarta dirección. `identity` ya tiene un remitente verificado para
 * lo que el visitante ve como "un correo de rentas.com.ve"; sumar
 * `CONTACT_MAIL_FROM` habría sido una cuarta variable que la tarea no pidió,
 * por una distinción (¿"entrá con este enlace" vs. "alguien te escribió"?)
 * que ningún destinatario del correo puede notar. Lo único que SÍ es una
 * decisión nueva de este módulo — a quién le llega el mensaje — es
 * `CONTACT_MAIL_TO`, y por eso es la única variable nueva.
 *
 * **Falla cerrado al construirse, igual que los otros dos adaptadores de
 * Resend.** Sin clave, sin remitente o sin destino, esto tira en vez de
 * aceptar un mensaje que no tiene dónde llegar — y `actions.ts` deja que esa
 * excepción se propague en vez de fingir un "gracias por escribirnos" que no
 * pasó: la misma forma que AGENTS.md §7 documenta para el trabajo de
 * vencimientos ("falla con 500 en vez de empezar una tanda que no puede
 * entregar"), trasplantada a un único mensaje.
 */
const KEY_ENV = "RESEND_API_KEY";
const FROM_ENV = "AUTH_MAIL_FROM";
const TO_ENV = "CONTACT_MAIL_TO";

export class ContactMailerNotConfiguredError extends Error {
  constructor(missing: string) {
    super(`resend-contact-mailer: falta ${missing} en el entorno.`);
    this.name = "ContactMailerNotConfiguredError";
  }
}

export class ContactMailerSendError extends Error {
  constructor(cause: string) {
    super(`resend-contact-mailer: no se pudo enviar — ${cause}`);
    this.name = "ContactMailerSendError";
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderContactHtml(body: string): string {
  const paragraphs = body
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter((block) => block !== "")
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, "<br />")}</p>`)
    .join("");

  return `<div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;font-size:16px;line-height:1.5;color:#101010">${paragraphs}</div>`;
}

export class ResendContactMailer implements ContactMailerPort {
  private readonly client: Resend;
  private readonly from: string;
  private readonly to: string;

  constructor(
    apiKey: string | undefined = process.env[KEY_ENV],
    from: string | undefined = process.env[FROM_ENV],
    to: string | undefined = process.env[TO_ENV],
    client?: Resend,
  ) {
    if (!apiKey) throw new ContactMailerNotConfiguredError(KEY_ENV);
    if (!from) throw new ContactMailerNotConfiguredError(FROM_ENV);
    if (!to) throw new ContactMailerNotConfiguredError(TO_ENV);

    this.from = from;
    this.to = to;
    this.client = client ?? new Resend(apiKey);
  }

  async send(message: ContactMessage): Promise<void> {
    const { error } = await this.client.emails.send({
      from: this.from,
      to: this.to,
      replyTo: message.replyTo,
      subject: message.subject,
      text: message.body,
      html: renderContactHtml(message.body),
    });

    if (error) {
      throw new ContactMailerSendError(error.message);
    }
  }
}
