import { MAGIC_LINK_MAX_AGE_SECONDS } from "./magic-link";
import { safeSignInReturn } from "./safe-return-destination";
import { type SignInWayOut, signInPathFor } from "./sign-in-page";

/**
 * **Pedir el enlace cuesta un correo de verdad** (tasks.md 15.9/22.22, láminas
 * 8a/9a y 8c/9c), y por eso todo lo de acá es producto y no formato: a qué
 * dirección estamos dispuestos a escribir, cuándo se puede volver a pedir, y
 * qué dice la pantalla mientras se espera. **La tercera depende de la segunda a
 * propósito**: la cara del botón la calcula la MISMA función que autoriza el
 * envío, así que «Volver a enviar en 0:42» no puede mentir sobre lo que pasa si
 * alguien lo empuja igual (§5). Nada de esto vive en la pantalla — el suelo del
 * 90 % llega a `domain/` y no llega a `app/`.
 *
 * **La cuenta regresiva no se calcula en el navegador.** El servidor sabe
 * cuándo salió el enlace, así que sirve el control ya habilitado o ya negado
 * con el número puesto. Con el script apagado ese número es una foto del
 * instante en que se sirvió la página; el tic es la mejora de la 15.12 y
 * deliberadamente no está acá. El piso primero.
 */

/**
 * **Un minuto**, y la lámina lo respalda: 8c y 9c dibujan «Volver a enviar en
 * 0:42», que sólo cae adentro de una ventana de este tamaño.
 *
 * Separado de `MAGIC_LINK_MAX_AGE_SECONDS` (900) porque son dos decisiones:
 * cuánto vale un enlace y cada cuánto se puede pedir otro. Atarlas haría que
 * acortar la vida del enlace acortara la espera sin que nadie lo pidiera — el
 * mismo error que `tokens.css` ya documenta con `--target-min-desktop`.
 */
export const MAGIC_LINK_RESEND_COOLDOWN_SECONDS = 60;

/** RFC 5321 §4.5.3.1.3. Más largo que esto no lo acepta ningún servidor. */
const MAX_ADDRESS_LENGTH = 254;

export interface MagicLinkTicket {
  readonly address: string;
  /** Cuándo salió el enlace, en milisegundos del reloj del servidor. */
  readonly sentAtMs: number;
  /** Ya juzgado por `safeSignInReturn`. `null` es «sin destino». */
  readonly returnTo: string | null;
}

export interface ResendState {
  readonly allowed: boolean;
  /** 0 cuando se puede. Nunca mayor que la ventana. */
  readonly retryInSeconds: number;
  /** Lo que se lee en el botón: la cuenta va adentro, no al lado. */
  readonly label: string;
}

export type MagicLinkRequest =
  | { readonly send: true; readonly address: string }
  | { readonly send: false; readonly reason: "sin-direccion" }
  | { readonly send: false; readonly reason: "muy-pronto"; readonly retryInSeconds: number };

export interface MagicLinkWait {
  readonly title: string;
  readonly leadBefore: string;
  /** La dirección tecleada, mostrada de vuelta y a nadie más. */
  readonly address: string;
  readonly leadAfter: string;
  readonly troublesTitle: string;
  readonly troubles: readonly string[];
  readonly resend: ResendState;
  readonly googleLabel: string;
  readonly wayOut: SignInWayOut;
  readonly returnTo: string | null;
}

/**
 * A qué dirección estamos dispuestos a escribirle, o `null`.
 *
 * **Normaliza exactamente igual que Auth.js** (`defaultNormalizer` en
 * `@auth/core/.../send-token.js`: NFKC, minúsculas, recorte), porque la
 * pantalla muestra de vuelta lo que esta función devuelve y el correo sale a lo
 * que Auth.js normalice. **Y es más estrecha en los dos puntos donde la
 * librería recorta en vez de negarse**: la comilla y la coma —
 * `maria@gmail.com,evil.test` le sale como `maria@gmail.com` mientras la
 * pantalla mostraría el texto entero. Negarse es lo único que mantiene la
 * igualdad, y es la forma que este repositorio prefiere (§7).
 */
export function magicLinkAddressOf(raw: unknown): string | null {
  if (typeof raw !== "string") return null;

  const value = raw.normalize("NFKC").toLowerCase().trim();
  if (value === "" || value.length > MAX_ADDRESS_LENGTH) return null;
  if (/["',\s]/.test(value)) return null;

  const parts = value.split("@");
  if (parts.length !== 2) return null;

  const local = parts[0] ?? "";
  const domain = parts[1] ?? "";
  // El punto del dominio: `maria@gmail` no llega a ninguna parte, y un enlace
  // que nunca aterriza se ve igual que uno que cayó en no deseado.
  if (local === "" || domain === "" || !domain.includes(".")) return null;
  if (domain.startsWith(".") || domain.endsWith(".")) return null;

  return value;
}

function formatRemaining(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds - minutes * 60).padStart(2, "0")}`;
}

/**
 * Si se puede volver a pedir el enlace, y qué dice el control mientras no.
 * `sentAtMs` en `null` es «todavía no se mandó nada»: el primer pedido.
 *
 * **El techo contra un reloj del futuro no es defensivo de más**: `sentAtMs`
 * viaja en una cookie y una cookie la escribe cualquiera. Sin él, un
 * comprobante fechado en el año 3000 dibuja «Volver a enviar en 16666:40» y
 * deja esa pestaña sin reenvío para siempre.
 */
export function resendStateFor(input: {
  readonly sentAtMs: number | null;
  readonly nowMs: number;
}): ResendState {
  const { sentAtMs, nowMs } = input;
  if (sentAtMs === null) {
    return { allowed: true, retryInSeconds: 0, label: "Volver a enviar el enlace" };
  }

  const elapsed = Math.min(
    Math.max(nowMs - sentAtMs, 0),
    MAGIC_LINK_RESEND_COOLDOWN_SECONDS * 1000,
  );
  const remaining = Math.ceil(MAGIC_LINK_RESEND_COOLDOWN_SECONDS - elapsed / 1000);
  if (remaining <= 0) {
    return { allowed: true, retryInSeconds: 0, label: "Volver a enviar el enlace" };
  }

  return {
    allowed: false,
    retryInSeconds: remaining,
    label: `Volver a enviar en ${formatRemaining(remaining)}`,
  };
}

/**
 * Si sale un correo, y si no, por qué.
 *
 * **La ventana se cuenta por buzón y no por pestaña**, y la diferencia es el
 * error de tipeo: quien escribe `gmial.com` y se da cuenta al segundo tiene que
 * poder corregirlo ya. Bloquearlo un minuto en la pantalla que el propio
 * documento del fundador llama «el punto de fuga principal» no ahorra un correo
 * — cuesta la cuenta entera. Lo que la ventana evita es machacar el mismo
 * buzón, que es donde el costo existe de verdad.
 */
export function magicLinkRequestFor(input: {
  readonly address: string | null;
  readonly ticket: MagicLinkTicket | null;
  readonly nowMs: number;
}): MagicLinkRequest {
  const { address, ticket, nowMs } = input;
  if (address === null) return { send: false, reason: "sin-direccion" };
  if (ticket === null || ticket.address !== address) return { send: true, address };

  const state = resendStateFor({ sentAtMs: ticket.sentAtMs, nowMs });

  return state.allowed
    ? { send: true, address }
    : { send: false, reason: "muy-pronto", retryInSeconds: state.retryInSeconds };
}

/** Las tres letras son del formato de la cookie, no del dominio: van cortas. */
export function serialiseMagicLinkTicket(ticket: MagicLinkTicket): string {
  return JSON.stringify({ a: ticket.address, t: ticket.sentAtMs, r: ticket.returnTo ?? undefined });
}

/**
 * El comprobante que el navegador guardó, o `null`.
 *
 * **Todo lo de adentro se vuelve a juzgar con las reglas que ya existen** — la
 * dirección por `magicLinkAddressOf`, el destino por `safeSignInReturn`: una
 * cookie es entrada de quien envía igual que un campo, y sin esto la salida a
 * Google sería un redirector abierto con nuestro dominio en la barra.
 *
 * **Un destino inadmisible no invalida el comprobante entero**: se cae el
 * destino, no la espera. La persona sigue esperando un enlace real.
 */
export function magicLinkTicketOf(raw: string | undefined): MagicLinkTicket | null {
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;

  const { a, t, r } = parsed as { a?: unknown; t?: unknown; r?: unknown };
  const address = magicLinkAddressOf(a);
  if (address === null || typeof t !== "number" || !Number.isFinite(t)) return null;

  return { address, sentAtMs: t, returnTo: typeof r === "string" ? safeSignInReturn(r) : null };
}

/**
 * Lo que dice la pantalla de espera (F18, láminas 8c y 9c). El vencimiento se
 * **deriva** de `MAGIC_LINK_MAX_AGE_SECONDS`: dos lugares con el mismo número
 * es cómo uno se queda viejo.
 *
 * **Faltan a propósito dos frases dibujadas.** «Abrí el enlace en este mismo
 * teléfono» (8c) es la regla de mismo dispositivo que el fundador quitó en la
 * 15.6 y que la 15.15 manda corregir en la lámina; «te avisamos acá cuando
 * pase» (9c) la cumple el sondeo de la 15.12, que no está construido. Prometer
 * cualquiera de las dos es la mentira que §5 describe.
 */
export function magicLinkWaitFor(input: {
  readonly ticket: MagicLinkTicket;
  readonly nowMs: number;
}): MagicLinkWait {
  const { ticket, nowMs } = input;

  return {
    title: "Revisá tu correo",
    leadBefore: "Le mandamos un enlace a ",
    address: ticket.address,
    // **«Tocalo» (8c) contra «Hacé clic» (9c)**: cada una es falsa en el otro
    // ancho, y la copia sale del dominio, así que no puede cambiar con el
    // ancho sin duplicarse. Se aplica la regla que la 22.26 dejó dicha en voz
    // alta — la redacción que sigue siendo cierta en los dos — y ninguna de
    // las dos dibujadas lo es. Queda anotado en la 22.27.
    leadAfter: ". Abrilo y entrás sin escribir nada más.",
    troublesTitle: "Si no llega",
    troubles: [
      "Puede tardar hasta dos minutos.",
      "Mirá en correo no deseado.",
      `El enlace sirve una sola vez y vence en ${MAGIC_LINK_MAX_AGE_SECONDS / 60} minutos.`,
    ],
    resend: resendStateFor({ sentAtMs: ticket.sentAtMs, nowMs }),
    googleLabel: "Mejor entro con Google",
    // Conserva el destino: cambiar de correo no puede costar la vuelta al
    // aviso. La dirección la escribe `signInPathFor`, que es la misma que usa
    // la acción cuando se niega — una sola forma de nombrar esta pantalla.
    wayOut: { href: signInPathFor(ticket.returnTo), label: "← Cambiar de correo" },
    returnTo: ticket.returnTo,
  };
}
