"use server";

import { redirect } from "next/navigation";
import { UnauthenticatedError } from "@/modules/identity/application/require-authenticated-session";
import { safeReturnPath } from "@/modules/identity/domain/safe-return-destination";
import { nextAuthSessionPort } from "@/modules/identity/infrastructure/session-port";
import {
  ListingNotFoundError,
  reportListing,
} from "@/modules/listing-trust/application/report-listing";
import { REPORT_SENT_PARAM } from "@/modules/listing-trust/domain/report-screen";
import {
  DrizzleListingModeration,
  DrizzleListingReports,
} from "@/modules/listing-trust/infrastructure/drizzle-listing-moderation";
import { db } from "@/shared/db/client";

/**
 * Reportar un aviso (F31) — **la puerta que le faltaba a `reportListing`**
 * (tasks.md 8.7).
 *
 * El caso de uso estaba completo desde la Fase 8: cuenta reportantes distintos,
 * oculta al tercero, no resucita un aviso vencido y está probado contra
 * Postgres real. Y no lo llamaba **ninguna ruta**: en un navegador nadie podía
 * reportar, así que el umbral no podía dispararse nunca y «Oculta por reportes»
 * —que la lámina 14d ya dibuja— era la consecuencia de algo que no ocurría.
 *
 * **Una acción de servidor y no un enlace, y ésa es la garantía.** Un `GET` lo
 * dispara el antivirus del proveedor, el previsualizador de WhatsApp y el
 * prefetch del navegador, sin que nadie haya tocado nada; un reporte que se
 * ejecutara al abrir gastaría uno de los tres asientos que hacen falta para
 * ocultar un aviso. Es la misma separación que `/renovar/[token]` documenta y
 * que `renewal-link.spec.ts` prueba en un navegador de verdad. Y sigue andando
 * sin JavaScript, porque es un POST nativo de un `form`.
 *
 * **Ninguna decisión de producto vive acá.** Si hay sesión, si el aviso existe,
 * cuántas cuentas distintas lo reportaron y si eso lo oculta lo resuelve
 * `reportListing`; a dónde se puede mandar a alguien lo resuelve
 * `safeReturnPath`; qué se dibuja y qué se dice lo resuelve
 * `resolveReportScreen`. Esto sólo traduce cada resultado en una redirección.
 */
export async function reportarAviso(formData: FormData): Promise<void> {
  // **Primero la vuelta, y antes de reportar.** El campo lo manda el navegador,
  // así que es entrada de quien envía: sin la regla del dominio en el medio,
  // esta acción es un redirector abierto con nuestro dominio en la barra. Un
  // formulario que no dibujamos nosotros no es un formulario sobre el que
  // actuemos, así que el rechazo es no hacer nada — ni reportar, ni acusar.
  const listingPath = safeReturnPath(String(formData.get("listingPath") ?? ""));
  if (!listingPath) redirect("/");

  const reportPath = `${listingPath}/reportar`;

  try {
    // El resultado —`{ autoHidden }`— se descarta a propósito y no se guarda ni
    // en una variable: decirle a quien reporta «este aviso quedó oculto» le
    // entrega a quien ataca el único dato que le falta, cuántas cuentas más
    // necesita. `ReportSentScreen` no tiene dónde ponerlo y esta acción no
    // tiene por dónde pasarlo.
    await reportListing(
      { listingId: String(formData.get("listingId") ?? "") },
      {
        sessionPort: nextAuthSessionPort,
        listings: new DrizzleListingModeration(db),
        reports: new DrizzleListingReports(db),
      },
    );
  } catch (error) {
    // La spec lo dice en esos términos: «the system blocks the action and
    // requires sign-in first». Se vuelve a la pantalla de reportar y no a la
    // ficha — quien entró para reportar sigue queriendo reportar. El destino se
    // arma acá con la ruta ya validada, no con un segundo campo del formulario.
    if (error instanceof UnauthenticatedError) {
      redirect(`/signin?callbackUrl=${encodeURIComponent(reportPath)}`);
    }

    // Vuelve a la ficha y que conteste ella: ya trata inexistente, oculto y
    // borrado por igual, así que quien sondea URLs no aprende nada. Inventar
    // acá una segunda forma de decirlo sería decirlo dos veces y distinto.
    if (error instanceof ListingNotFoundError) redirect(listingPath);

    // Tragar todo sería peor que romper: con el acuse dibujado, quien reportó
    // se va creyendo que su reporte quedó guardado.
    throw error;
  }

  redirect(`${reportPath}?${REPORT_SENT_PARAM}`);
}
