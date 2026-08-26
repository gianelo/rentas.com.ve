import type { MailerPort } from "../application/ports/mailer.port";
import { composeMagicLinkEmail, MAGIC_LINK_MAX_AGE_SECONDS } from "../domain/magic-link";
import {
  type AuthMailerConfig,
  AuthMailerNotConfiguredError,
  ResendMailer,
  readAuthMailerConfig,
} from "./resend-mailer";

/**
 * El proveedor "email" de Auth.js (tasks.md 15.2–15.3, F17).
 *
 * **Separado de `auth.ts` a propósito**, igual que `google-profile.ts` — ver
 * el comentario de `email-provider.test.ts`. `auth.ts` importa `db`, que
 * exige `DATABASE_URL` al cargarse; este archivo no importa nada de eso, así
 * que se puede probar sin base de datos ni Next.js.
 *
 * **No se usa `next-auth/providers/nodemailer`/`Email`.** Las dos exigen un
 * `server` SMTP para poder construirse — tirar sin uno es lo primero que
 * hacen (`@auth/core/providers/nodemailer.js`), incluso si después se
 * reemplaza `sendVerificationRequest` entero y ese `server` nunca se toca.
 * Un objeto propio, con la forma que `@auth/core` espera de un
 * `EmailConfig`, evita instalar `nodemailer` y evita un campo de
 * configuración que mentiría sobre cómo sale el correo.
 *
 * **Falla cerrado en el envío, no al cargar el módulo.** `auth.ts` se
 * importa en cada arranque de la app — construir el mailer ahí y tirar sin
 * `RESEND_API_KEY`/`AUTH_MAIL_FROM` tumbaría el proceso entero por un enlace
 * que nadie pidió todavía. La lectura de configuración se pospone hasta que
 * alguien de verdad intenta entrar por este camino.
 */

export interface EmailProviderDependencies {
  readonly readConfig?: () => AuthMailerConfig | undefined;
  readonly createMailer?: (config: AuthMailerConfig) => MailerPort;
}

/**
 * Forma mínima de lo que Auth.js espera de un provider `type: "email"`
 * (`@auth/core/providers/email.d.ts`, `EmailConfig`). No se importa ese tipo
 * porque arrastra los tipos de `nodemailer`, paquete que este adaptador no
 * instala ni necesita — ver el comentario de arriba.
 */
export interface EmailProvider {
  readonly id: "email";
  readonly type: "email";
  readonly name: string;
  readonly maxAge: number;
  sendVerificationRequest(params: { identifier: string; url: string }): Promise<void>;
}

export function buildEmailProvider(deps: EmailProviderDependencies = {}): EmailProvider {
  const readConfig = deps.readConfig ?? readAuthMailerConfig;
  const createMailer =
    deps.createMailer ??
    ((config: AuthMailerConfig) => new ResendMailer(config.apiKey, config.from));

  return {
    id: "email",
    type: "email",
    name: "Correo",
    // F17: 15 minutos, no el día que hereda Auth.js por defecto — la
    // constante vive en el dominio (magic-link.ts) para que sólo haya un
    // lugar donde se pueda cambiar, y un solo test que se rompa si desaparece.
    maxAge: MAGIC_LINK_MAX_AGE_SECONDS,
    async sendVerificationRequest({ identifier, url }) {
      const config = readConfig();
      if (!config) {
        throw new AuthMailerNotConfiguredError("RESEND_API_KEY y/o AUTH_MAIL_FROM");
      }

      await createMailer(config).send({ to: identifier, ...composeMagicLinkEmail(url) });
    },
  };
}
