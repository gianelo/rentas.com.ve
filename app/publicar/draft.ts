import type { StoredPublicationDraft } from "../../src/modules/listing-publication/domain/publication-steps";
import { normaliseStoredDraft } from "../../src/modules/listing-publication/domain/stored-draft";

/**
 * Las dos cookies del borrador, **ya sin nadie que las escriba** (tasks.md 18.30).
 *
 * El borrador vive en `publish_draft`, con la sesión como llave y veinticuatro
 * horas de vida. Lo que queda acá es el PUENTE de una sola entrega: quien estaba
 * en el paso 6 el día del despliegue tiene su borrador entero en estas dos
 * cookies y la tabla vacía, y un corte seco le vaciaría el formulario. Así que
 * todavía se leen —una vez, cuando la tabla no tiene fila— y se borran en cuanto
 * la tabla se escribe.
 *
 * **Nada las vuelve a escribir.** No hay `serialiseStoredDraft`, no hay
 * `DRAFT_TTL_SECONDS` y no hay opciones de cookie: los treinta minutos dejaron de
 * gobernar el día en que `DRAFT_LIFETIME_MS` tomó su lugar, y una constante de
 * vencimiento sin nadie que la aplique es una regla que miente. Sacar el puente
 * entero es la 18.33.
 *
 * **`path` es parte del borrado y no un detalle.** Se escribieron bajo
 * `/publicar`, y un `delete(nombre)` sin decirlo pone una cookie vencida en `/`
 * y deja la de `/publicar` viva — o sea, exactamente la segunda fuente que este
 * puente existe para no dejar.
 */

export const DRAFT_COOKIE = "rentas_publish_draft";
/** La descripción, aparte: sola ya rozaba el techo de ~4 KB de una cookie. */
export const DRAFT_TEXT_COOKIE = "rentas_publish_texto";
export const DRAFT_COOKIE_PATH = "/publicar";

/** El mismo tipo. La forma se mudó al dominio (18.29) para que el puerto de la
 *  tabla no dependa de `app/`. */
export type StoredDraft = StoredPublicationDraft;

export function emptyDraft(): StoredDraft {
  return { listing: {}, photos: [], violations: [] };
}

function decode(raw: string | undefined): unknown {
  if (!raw) return undefined;
  try {
    return JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
  } catch {
    // Una cookie truncada o editada a mano no es un error que valga la pena
    // mostrar: quien publica recibe un formulario vacío, que se recupera.
    return undefined;
  }
}

/**
 * Decodifica las dos cookies y **le pasa la decisión al dominio**: qué campos se
 * aceptan es la misma regla que valida una fila de `publish_draft`, y tenerla
 * escrita dos veces es la forma exacta del defecto que esta rebanada evita.
 */
export function parseStoredDraft(
  rawDraft: string | undefined,
  rawText: string | undefined,
): StoredDraft | null {
  const body = decode(rawDraft);
  // Sólo se pega la descripción si hay dónde pegarla. Qué se acepta y qué se
  // rechaza lo sigue decidiendo el dominio, también en esta rama.
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return normaliseStoredDraft(body);
  }

  const { listing, ...rest } = body as { listing?: unknown };
  const source = typeof listing === "object" && listing !== null ? listing : {};

  // **La descripción se pega ANTES de normalizar**, no después: así "vacía es lo
  // mismo que no escrita" está dicho una sola vez, en el dominio, y no una vez
  // por puerta. Pegarla después dejaría a esta función decidiendo una regla.
  return normaliseStoredDraft({ ...rest, listing: { ...source, description: decode(rawText) } });
}
