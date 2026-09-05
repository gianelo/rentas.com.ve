"use server";

import { redirect } from "next/navigation";
import { sendContactMessage } from "@/modules/site-contact/application/send-contact-message";
import {
  CONTACT_ERROR_PARAM,
  CONTACT_SENT_PARAM,
} from "@/modules/site-contact/domain/contact-screen";
import { ResendContactMailer } from "@/modules/site-contact/infrastructure/resend-contact-mailer";

/**
 * "Escribinos" (tasks.md 23.7) — la puerta que traduce el POST del
 * formulario en una decisión de `sendContactMessage`, la misma forma que
 * `reportar/actions.ts` traduce el suyo hacia `reportListing`.
 *
 * **`ResendContactMailer` se construye acá, en el envío, no al cargar el
 * módulo** — el mismo argumento que `email-provider.ts` ya documenta para
 * el enlace mágico: construirlo a nivel de módulo tumbaría cualquier página
 * que importe esta acción sin que nadie hubiera escrito una palabra.
 *
 * **Y se construye ANTES de evaluar la entrada, a propósito.** Si el
 * entorno no tiene `RESEND_API_KEY`/`AUTH_MAIL_FROM`/`CONTACT_MAIL_TO`, esa
 * es una falla del canal completo, no de un envío en particular — falla
 * igual para un mensaje válido, uno inválido o uno que sólo un bot mandó, y
 * la excepción se deja propagar en vez de fingir cualquiera de las tres
 * pantallas (AGENTS.md §7, la misma forma que el trabajo de vencimientos
 * "contesta 500 en vez de empezar una tanda que no puede entregar").
 */
export async function sendContactMessageAction(formData: FormData): Promise<void> {
  const result = await sendContactMessage(
    {
      name: String(formData.get("name") ?? ""),
      email: String(formData.get("email") ?? ""),
      message: String(formData.get("message") ?? ""),
      honeypot: String(formData.get("sitioWeb") ?? ""),
    },
    { mailer: new ResendContactMailer() },
  );

  if (result.kind === "invalid") {
    // La validación nativa del navegador (`required`, `type="email"`,
    // `minLength`/`maxLength` en `page.tsx`) atrapa esto antes del POST en
    // cualquier navegador normal; llegar hasta acá significa que alguien
    // posteó directo, sin pasar por el formulario. El aviso es genérico a
    // propósito — no hay borrador que repoblar, a diferencia del paso a
    // paso de publicar, así que no hay dónde devolver lo tecleado.
    redirect(`/ayuda/escribinos?${CONTACT_ERROR_PARAM}`);
  }

  // "valid" mandó de verdad; "spam" no mandó nada. El mismo acuse para las
  // dos, para que quien prueba el formulario con el campo trampa lleno no
  // aprenda que lo atrapamos.
  redirect(`/ayuda/escribinos?${CONTACT_SENT_PARAM}`);
}
