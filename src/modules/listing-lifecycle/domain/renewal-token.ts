import { createHmac, timingSafeEqual } from "node:crypto";
import { purgeDueAt } from "./expiry";

/**
 * El enlace de renovación que viaja por correo (tasks.md 7.9).
 *
 * Cuatro propiedades, y cada una está resuelta por una decisión distinta —
 * vale la pena decir cuál resuelve cuál, porque tres de ellas parecen la misma:
 *
 * 1. **Firmado (HMAC-SHA256).** Nadie puede fabricar un enlace que renueve el
 *    aviso de otro. La firma se compara en tiempo constante: comparar con `===`
 *    filtra, byte a byte, cuánto acertó quien prueba.
 * 2. **Con alcance al aviso.** El `listingId` va DENTRO de lo firmado, no en la
 *    URL al lado del token. La ruta nunca lee un id del pedido: si lo hiciera,
 *    un token válido para un aviso serviría para renovar cualquier otro.
 * 3. **De un solo uso — y esto es lo que NO se resuelve acá.** El token lleva
 *    firmado el `expiresAt` que el aviso tenía cuando se emitió, y renovar
 *    mueve ese `expires_at`. La quema es entonces el propio `UPDATE`
 *    condicionado (`WHERE id = ? AND expires_at = ?`): un token repetido ya no
 *    encaja con la fila y afecta cero filas. No hay tabla de tokens quemados,
 *    no hay leer-y-después-escribir, y por lo tanto no hay ventana entre las
 *    dos en la que dos pedidos simultáneos ganen los dos. Un token de un solo
 *    uso guardado en una tabla aparte tiene esa ventana salvo que se
 *    transaccione; éste no la tiene porque la unicidad la da el dato que el
 *    token pretende cambiar.
 * 4. **Con vencimiento.** `notAfter` va firmado y se deriva del propio ciclo:
 *    el día de la purga (`expiresAt` + 15). Es exactamente mientras renovar
 *    todavía significa «vuelve con sus fotos». No es un parámetro suelto que
 *    alguien pueda subir a un año sin darse cuenta de lo que promete.
 *
 * **El secreto no vive acá.** Entra por parámetro, igual que `now`, para que
 * este archivo siga siendo puro y probable sin entorno.
 */

/** El prefijo de versión permite rotar el formato sin aceptar el viejo por accidente. */
const TOKEN_VERSION = "v1";

export interface RenewalTokenPayload {
  readonly listingId: string;
  /** El `expires_at` que el aviso tenía al emitirse. Es la cerradura. */
  readonly expiresAt: Date;
  /** Último instante en que el enlace sirve. Derivado, no elegido. */
  readonly notAfter: Date;
}

export type RenewalTokenFailure = "malformed" | "bad-signature" | "expired";

export type RenewalTokenResult =
  | { readonly ok: true; readonly payload: RenewalTokenPayload }
  | { readonly ok: false; readonly reason: RenewalTokenFailure };

interface WireBody {
  readonly l: string;
  readonly e: number;
  readonly n: number;
}

function encode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function sign(body: string, secret: string): string {
  return createHmac("sha256", secret).update(`${TOKEN_VERSION}.${body}`).digest("base64url");
}

/**
 * Comparación en tiempo constante que además tolera largos distintos.
 *
 * `timingSafeEqual` TIRA si los buffers miden distinto, así que un token
 * recortado sería una excepción y no un rechazo — y el largo se filtraría de
 * todos modos. Se compara el digest de cada lado: mide siempre lo mismo,
 * cualquiera sea la basura que llegó.
 */
function signaturesMatch(expected: string, received: string): boolean {
  const a = createHmac("sha256", "compare").update(expected).digest();
  const b = createHmac("sha256", "compare").update(received).digest();
  return timingSafeEqual(a, b);
}

/**
 * Emite el enlace para el ciclo vigente del aviso.
 *
 * `notAfter` NO es un argumento: se deriva del vencimiento con la misma
 * función que usa el trabajo de purga, para que el enlace no pueda quedar
 * vivo un día más que las fotos que promete recuperar.
 */
export function mintRenewalToken(
  input: { readonly listingId: string; readonly expiresAt: Date },
  secret: string,
): string {
  const body: WireBody = {
    l: input.listingId,
    e: input.expiresAt.getTime(),
    n: purgeDueAt(input.expiresAt).getTime(),
  };
  const encoded = encode(JSON.stringify(body));
  return `${TOKEN_VERSION}.${encoded}.${sign(encoded, secret)}`;
}

/**
 * Lee y valida un token. Nunca lanza: un token es entrada de un desconocido y
 * una excepción acá sería un 500 en vez de una pantalla que explica.
 *
 * El orden importa: **la firma se verifica antes que el vencimiento**. Al
 * revés, un token con `notAfter` inventado obtendría del servidor la respuesta
 * «vencido» sobre datos que nadie firmó.
 */
export function readRenewalToken(token: string, secret: string, now: Date): RenewalTokenResult {
  const [version, encoded, signature] = token.split(".");
  if (version !== TOKEN_VERSION || !encoded || !signature) {
    return { ok: false, reason: "malformed" };
  }

  if (!signaturesMatch(sign(encoded, secret), signature)) {
    return { ok: false, reason: "bad-signature" };
  }

  let body: WireBody;
  try {
    body = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as WireBody;
  } catch {
    return { ok: false, reason: "malformed" };
  }

  if (typeof body.l !== "string" || body.l === "") return { ok: false, reason: "malformed" };
  if (!Number.isFinite(body.e) || !Number.isFinite(body.n)) {
    return { ok: false, reason: "malformed" };
  }

  if (now.getTime() > body.n) return { ok: false, reason: "expired" };

  return {
    ok: true,
    payload: { listingId: body.l, expiresAt: new Date(body.e), notAfter: new Date(body.n) },
  };
}
