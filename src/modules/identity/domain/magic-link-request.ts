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

/**
 * **Cada cuánto vuelve a preguntar la pestaña que espera** (15.12, 15.14).
 *
 * Cuatro segundos: la lámina 9c promete «te avisamos acá cuando pase», y quien
 * lee el correo en el teléfono tarda en volver la vista. Más seguido no se nota
 * y multiplica consultas; más espaciado convierte la promesa en un retraso que
 * se siente. Vive acá y no en el guion porque es una decisión de producto — el
 * guion sólo la ejecuta.
 */
export const MAGIC_LINK_POLL_INTERVAL_SECONDS = 4;

/** La huella de un enlace: sha256 en hexadecimal, y nada más se acepta. */
const FINGERPRINT = /^[0-9a-f]{64}$/;

/** RFC 5321 §4.5.3.1.3. Más largo que esto no lo acepta ningún servidor. */
const MAX_ADDRESS_LENGTH = 254;

export interface MagicLinkTicket {
  readonly address: string;
  /** Cuándo salió el enlace, en milisegundos del reloj del servidor. */
  readonly sentAtMs: number;
  /** Ya juzgado por `safeSignInReturn`. `null` es «sin destino». */
  readonly returnTo: string | null;
  /**
   * **La huella del enlace que salió para ESTE navegador** (15.14): el sha256
   * del token que Auth.js acaba de escribir en `verificationToken`. Es lo que
   * convierte el sondeo en «¿sigue vivo MI enlace?» en vez de «¿entró esta
   * persona?», que es una pregunta que cualquiera podría hacer sobre
   * cualquiera. El token en claro NO se guarda: quien robara la cookie tendría
   * el enlace entero, y una huella no se puede caminar hacia atrás.
   *
   * `null` cuando el comprobante es anterior a esta regla o la huella no se
   * pudo leer: entonces no hay sondeo, y la pantalla sigue completa sin él.
   */
  readonly linkFingerprint?: string | null;
  /**
   * **El sello que prueba que la dirección y la huella salieron de acá.** Sin
   * él la cookie es papel: la escribe cualquiera, y el sondeo volvería a
   * contestar sobre la dirección que le pongan. Lo calcula y lo comprueba el
   * transporte (`app/(auth)/signin/enlace.ts`), que es donde vive la llave;
   * este dominio sólo lo lleva y lo devuelve.
   */
  readonly seal?: string | null;
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

/**
 * Lo que el sondeo contesta, o `null` cuando no hay nada que contestar.
 *
 * **`null` no es «no entró»**: es «esta pregunta no se puede responder para
 * quien la hace». Un booleano solo tendría que elegir entre dos mentiras.
 */
export interface MagicLinkPoll {
  readonly entro: boolean;
}

export interface MagicLinkWait {
  readonly title: string;
  readonly leadBefore: string;
  /** La dirección tecleada, mostrada de vuelta y a nadie más. */
  readonly address: string;
  readonly leadAfter: string;
  readonly troublesTitle: string;
  readonly troubles: readonly string[];
  readonly resend: ResendState;
  /**
   * Lo que la pestaña dice cuando el enlace se abrió en otro dispositivo — la
   * frase que la lámina 9c promete («te avisamos acá cuando pase») y que hasta
   * la 15.14 no se podía decir sin mentir. Va servida y escondida: el guion la
   * descubre, no la escribe, así que no hay copia de producto en el frente.
   */
  readonly signedInNotice: string;
  /**
   * Cada cuánto preguntar y por cuánto tiempo, o `null` cuando no hay nada que
   * preguntar. **El techo lo fija la vida del enlace**: pasada ella la
   * respuesta ya no distingue «lo abrió» de «se venció», así que seguir
   * preguntando sólo gasta consultas y podría anunciar una entrada que nunca
   * ocurrió.
   */
  readonly poll: { readonly everySeconds: number; readonly forSeconds: number } | null;
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
  return JSON.stringify({
    a: ticket.address,
    t: ticket.sentAtMs,
    r: ticket.returnTo ?? undefined,
    k: ticket.linkFingerprint ?? undefined,
    s: ticket.seal ?? undefined,
  });
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

  const { a, t, r, k, s } = parsed as {
    a?: unknown;
    t?: unknown;
    r?: unknown;
    k?: unknown;
    s?: unknown;
  };
  const address = magicLinkAddressOf(a);
  if (address === null || typeof t !== "number" || !Number.isFinite(t)) return null;

  // **Una huella mal formada se cae sola, y no se lleva el comprobante.** Sin
  // ella no hay sondeo y la pantalla queda igual de completa: es la misma
  // asimetría que el destino inadmisible de arriba.
  const fingerprint = typeof k === "string" && FINGERPRINT.test(k) ? k : null;
  const seal = fingerprint !== null && typeof s === "string" && FINGERPRINT.test(s) ? s : null;

  return {
    address,
    sentAtMs: t,
    returnTo: typeof r === "string" ? safeSignInReturn(r) : null,
    linkFingerprint: seal === null ? null : fingerprint,
    seal,
  };
}

/**
 * **Si el enlace que salió para este navegador sigue vivo** (15.14).
 *
 * La pregunta que se contesta es «¿sigue pendiente MI enlace?», nunca «¿entró
 * esta persona?». La diferencia es la tarea entera: la segunda la podría hacer
 * cualquiera sobre cualquiera con sólo saber una dirección, y eso convierte la
 * pantalla de espera en una forma de saber cuándo alguien está conectado.
 *
 * **La huella desaparecida es la señal.** Auth.js borra la fila al canjear el
 * enlace (`useVerificationToken`, probado contra Postgres en la 15.4), así que
 * que la huella ya no esté entre las pendientes significa que el enlace se
 * usó. Vencerse produce lo mismo, y por eso el sondeo se apaga con el enlace
 * (`MagicLinkWait.poll`): mientras corre, no estar es haber entrado.
 *
 * `null` cuando el comprobante no trae huella — no hay respuesta que dar, y
 * «no entró» sería inventarla.
 */
export function magicLinkPollFor(input: {
  readonly ticket: MagicLinkTicket;
  readonly pendingFingerprints: readonly string[];
}): MagicLinkPoll | null {
  const fingerprint = input.ticket.linkFingerprint ?? null;
  if (fingerprint === null) return null;

  return { entro: !input.pendingFingerprints.includes(fingerprint) };
}

/**
 * Por cuánto tiempo tiene sentido preguntar. Deriva de la vida del enlace, que
 * es el único reloj que importa acá: un enlace vencido ya no se puede abrir.
 */
function pollWindowFor(input: { readonly ticket: MagicLinkTicket; readonly nowMs: number }) {
  if ((input.ticket.linkFingerprint ?? null) === null) return null;

  const livedSeconds = Math.max(input.nowMs - input.ticket.sentAtMs, 0) / 1000;
  const forSeconds = Math.ceil(MAGIC_LINK_MAX_AGE_SECONDS - livedSeconds);

  return forSeconds <= 0 ? null : { everySeconds: MAGIC_LINK_POLL_INTERVAL_SECONDS, forSeconds };
}

/**
 * Lo que dice la pantalla de espera (F18, láminas 8c y 9c). El vencimiento se
 * **deriva** de `MAGIC_LINK_MAX_AGE_SECONDS`: dos lugares con el mismo número
 * es cómo uno se queda viejo.
 *
 * **Falta a propósito una frase dibujada, y la otra ya se puede decir.** «Abrí
 * el enlace en este mismo teléfono» (8c) es la regla de mismo dispositivo que
 * el fundador quitó en la 15.6 y que la 15.15 manda corregir en la lámina: no
 * se dibuja. «Te avisamos acá cuando pase» (9c) sí, desde la 15.14: la cumple
 * `signedInNotice`, servida escondida y descubierta por el sondeo.
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
    // **«Podés seguir ahí» y no «ya entraste acá»**: la sesión quedó en el otro
    // dispositivo y esta pestaña no la tiene. Prometerle que ya está adentro
    // sería la casilla que miente, sólo que dicha en pantalla.
    signedInNotice:
      "Abriste el enlace en otro dispositivo. Podés seguir ahí: acá ya no hace falta esperar.",
    poll: pollWindowFor({ ticket, nowMs }),
    googleLabel: "Mejor entro con Google",
    // Conserva el destino: cambiar de correo no puede costar la vuelta al
    // aviso. La dirección la escribe `signInPathFor`, que es la misma que usa
    // la acción cuando se niega — una sola forma de nombrar esta pantalla.
    wayOut: { href: signInPathFor(ticket.returnTo), label: "← Cambiar de correo" },
    returnTo: ticket.returnTo,
  };
}
