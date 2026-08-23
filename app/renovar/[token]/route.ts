import {
  previewRenewal,
  type RenewalOutcome,
  type RenewalPreview,
  renewListing,
} from "../../../src/modules/listing-lifecycle/application/renew-listing";
import {
  DrizzleLifecycleListings,
  type LifecycleDatabase,
} from "../../../src/modules/listing-lifecycle/infrastructure/drizzle-lifecycle";
import { readRenewalSecret } from "../../../src/modules/listing-lifecycle/infrastructure/lifecycle-config";
import { db } from "../../../src/shared/db/client";

/**
 * El enlace de renovación que viaja en los dos correos (tasks.md 7.8/7.9).
 *
 * **`GET` muestra y `POST` renueva, y la separación es la garantía.** Un
 * enlace de correo lo abre el antivirus del proveedor, el previsualizador de
 * WhatsApp y el prefetch del navegador, todos con `GET` y sin que nadie haya
 * hecho clic. Si el `GET` renovara, el aviso se renovaría solo y el token
 * quedaría quemado antes de que la persona lo viera. Acá el `GET` llama a
 * `previewRenewal`, que no tiene camino hacia la escritura.
 *
 * **Es un manejador de ruta y no una pantalla**, deliberadamente: la
 * confirmación es HTML plano sin una sola regla de estilo propia. Meterla en
 * `components/` habría metido la pantalla del ciclo de vida en el rediseño
 * pendiente sin que nadie lo pidiera; cuando el diseño tenga su lámina, esto
 * se reemplaza por una página y el caso de uso no se entera.
 *
 * **Ninguna decisión vive acá.** Si el token sirve, si el aviso existe, si ya
 * se usó y cuántos días suma lo resuelve `src/modules/listing-lifecycle/`.
 */

export const dynamic = "force-dynamic";

interface Context {
  readonly params: Promise<{ readonly token: string }>;
}

/** Todo lo que llega del token o de la base sale escapado. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function page(title: string, bodyHtml: string, status: number): Response {
  return new Response(
    `<!doctype html><html lang="es"><head><meta charset="utf-8">` +
      `<meta name="viewport" content="width=device-width, initial-scale=1">` +
      // Este enlace no se indexa: lleva un token firmado en la URL.
      `<meta name="robots" content="noindex, nofollow">` +
      `<title>${escapeHtml(title)}</title></head><body><main>${bodyHtml}</main></body></html>`,
    { status, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

function spellDate(date: Date): string {
  return new Intl.DateTimeFormat("es-VE", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

const INVALID_COPY: Record<string, string> = {
  expired: "Este enlace ya no sirve. Entrá a tu cuenta para volver a publicar el aviso.",
  "bad-signature": "Este enlace no es válido. Revisá que lo hayas copiado entero.",
  malformed: "Este enlace no es válido. Revisá que lo hayas copiado entero.",
};

function missingSecret(): Response {
  return page(
    "No se puede renovar ahora",
    "<h1>No se puede renovar ahora</h1><p>Volvé a intentar en un rato.</p>",
    500,
  );
}

export async function GET(_request: Request, context: Context): Promise<Response> {
  const secret = readRenewalSecret();
  if (!secret) return missingSecret();

  const { token } = await context.params;
  const preview: RenewalPreview = await previewRenewal(
    { token },
    {
      listings: new DrizzleLifecycleListings(db as unknown as LifecycleDatabase),
      renewalSecret: secret,
    },
  );

  if (preview.status === "invalid") {
    return page(
      "Enlace no válido",
      `<h1>Enlace no válido</h1><p>${INVALID_COPY[preview.reason]}</p>`,
      400,
    );
  }
  if (preview.status === "not-found") {
    return page(
      "Aviso no encontrado",
      "<h1>Aviso no encontrado</h1><p>Este aviso ya no existe.</p>",
      404,
    );
  }

  // El formulario es lo único que puede renovar, y va al mismo camino por
  // `POST`. La acción queda vacía a propósito: el navegador la resuelve contra
  // la URL actual, así que el token no se vuelve a escribir en el HTML.
  return page(
    "Renovar tu aviso",
    `<h1>Renovar tu aviso</h1>` +
      `<p>«${escapeHtml(preview.listing.title)}» vence el ${escapeHtml(spellDate(preview.listing.expiresAt))}.</p>` +
      `<p>Al confirmar, queda activo 30 días más y vuelve a la búsqueda con sus fotos.</p>` +
      `<form method="post"><button type="submit">Renovar por 30 días</button></form>`,
    200,
  );
}

export async function POST(_request: Request, context: Context): Promise<Response> {
  const secret = readRenewalSecret();
  if (!secret) return missingSecret();

  const { token } = await context.params;
  const outcome: RenewalOutcome = await renewListing(
    { token },
    {
      listings: new DrizzleLifecycleListings(db as unknown as LifecycleDatabase),
      renewalSecret: secret,
    },
  );

  if (outcome.status === "invalid") {
    return page(
      "Enlace no válido",
      `<h1>Enlace no válido</h1><p>${INVALID_COPY[outcome.reason]}</p>`,
      400,
    );
  }
  if (outcome.status === "already-used") {
    // 409 y no 400: el pedido estaba bien, el aviso ya se renovó. Y se dice
    // así — «ya está renovado» tranquiliza, «enlace inválido» asusta a quien
    // hizo doble clic.
    return page(
      "Tu aviso ya está renovado",
      "<h1>Tu aviso ya está renovado</h1><p>Este enlace ya se usó. No hace falta hacer nada más.</p>",
      409,
    );
  }

  return page(
    "Aviso renovado",
    `<h1>Listo, tu aviso está activo</h1><p>Vence el ${escapeHtml(spellDate(outcome.expiresAt))}.</p>`,
    200,
  );
}
