/**
 * A dónde se puede mandar a alguien después de pedirle que entre.
 *
 * **Es una regla de negocio, no una validación de formato**, y por eso vive acá
 * y no en la acción de servidor que la usa: decide a qué destinos el producto
 * está dispuesto a llevar a una persona. La regla permanente del fundador —
 * una regla de negocio nunca vive en el frente — aplica igual que en
 * `zone-route.ts`, con la misma razón práctica al lado: el suelo de cobertura
 * del 90 % llega a `domain/` y no llega a `app/`.
 *
 * **El destino llega en un campo del formulario.** Es entrada de quien envía,
 * nunca un dato del servidor. Sin esta regla la acción de revelar es un
 * redirector abierto: un enlace de rentas.com.ve que deja a quien lo toca en
 * cualquier parte. Lo caro no es el salto, es que el enlace se ve nuestro —
 * exactamente lo que un phishing necesita.
 *
 * **Se resuelve parseando, no comparando prefijos de texto.** Un prefijo deja
 * pasar `/signin?callbackUrl=https%3A%2F%2Fevil.test`, donde la ruta es la
 * nuestra y lo hostil viaja adentro del parámetro. Parsear contra un origen
 * inventado es lo que hace que cualquier candidato que traiga su propio origen
 * — `https://evil.test/…`, `//evil.test/…` — salga con un origen distinto y se
 * caiga solo.
 */

/** La pantalla de entrar sin destino: siempre segura, y siempre nuestra. */
export const SIGN_IN_FALLBACK = "/signin";

/**
 * Un origen que no existe. Nunca se emite: sólo sirve para que `URL` acepte una
 * ruta relativa y para tener contra qué comparar el origen del candidato.
 */
const SAME_ORIGIN = "https://destino.invalid";

/** La vuelta sólo puede ser a una ficha: es el único lugar del que se sale. */
const RETURN_PREFIX = "/alquiler/";

/**
 * El parseo, una sola vez para las tres reglas de abajo: lo que cambia entre
 * ellas es a qué pantallas se deja ir, no cómo se lee la dirección.
 *
 * `null` cuando el candidato viene vacío, no parsea, o trae su propio origen —
 * eso cubre `https://evil.test/…`, `//evil.test/…` y `/\evil.test/…` de una
 * vez, y sin una lista de esquemas que alguien tenga que mantener.
 */
function internalUrl(candidate: string): URL | null {
  const value = candidate.trim();
  if (value === "") return null;

  try {
    const url = new URL(value, SAME_ORIGIN);
    return url.origin === SAME_ORIGIN ? url : null;
  } catch {
    // Basura que ni siquiera parsea. Lanzar acá le daría una pantalla rota a
    // alguien que sólo quería un número de teléfono.
    return null;
  }
}

export function safeSignInDestination(candidate: string): string {
  const value = candidate.trim();
  const url = internalUrl(value);
  if (url === null) return SIGN_IN_FALLBACK;
  if (url.pathname !== SIGN_IN_FALLBACK) return SIGN_IN_FALLBACK;

  // `searchParams` decodifica una sola vez, que es lo correcto: `%252F` queda
  // como el texto `%2F` y no como una barra, así que la doble codificación no
  // se convierte en una ruta al pasar por acá.
  const back = url.searchParams.get("callbackUrl");
  if (!back) return SIGN_IN_FALLBACK;

  // **La barra invertida NO se comprueba acá, y eso está verificado.** El
  // riesgo real es `/\evil.test`, que algunos navegadores normalizan a
  // `//evil.test` — otro origen — y ése ya cae en la comprobación de ruta de
  // arriba. Adentro del parámetro una barra invertida no crea un origen, así
  // que una comprobación extra pasaba todas las mutaciones sin atrapar nada:
  // código de seguridad que ningún ataque alcanza, que es peor que no tenerlo
  // porque hace confiar de más.
  if (!back.startsWith(RETURN_PREFIX)) return SIGN_IN_FALLBACK;

  return value;
}

/**
 * La misma regla, sobre una ruta pelada (tasks.md 8.7).
 *
 * `safeSignInDestination` valida `/signin?callbackUrl=<ficha>`; esto valida la
 * ficha sola. La acción de reportar la recibe en un campo oculto y la usa para
 * dos redirecciones —el acuse y la vuelta cuando el aviso no existe—, así que
 * es exactamente la misma entrada de quien envía y el mismo riesgo: un enlace
 * que se ve nuestro y deja a quien lo toca en cualquier parte.
 *
 * **Comparte el origen inventado y el prefijo con la función de arriba a
 * propósito.** Dos copias de esta comprobación es cómo una de las dos se queda
 * vieja el día que el prefijo cambie.
 *
 * **Devuelve `null` y no un respaldo.** Mandar a alguien a `/signin` cuando no
 * se sabe de dónde vino es inofensivo; acá el valor se concatena para armar
 * `…/reportar?enviado`, y un respaldo silencioso convertiría una ruta hostil en
 * un acuse dibujado sobre una pantalla que no es la nuestra. `null` obliga a
 * quien llama a ver el rechazo y a decidir — y esa decisión es negarse.
 */
export function safeReturnPath(candidate: string): string | null {
  const value = candidate.trim();
  const url = internalUrl(value);
  if (url === null) return null;
  if (!url.pathname.startsWith(RETURN_PREFIX)) return null;

  return value;
}

/**
 * Las pantallas de cuenta desde las que se pide entrar. Van con la ruta exacta
 * porque abajo cuelgan pasos —`/publicar/paso/fotos`— y la vuelta es al paso.
 */
const ACCOUNT_DOORS = ["/publicar", "/mis-avisos", "/importar"] as const;

function isSignInDoor(pathname: string): boolean {
  if (pathname.startsWith(RETURN_PREFIX)) return true;

  // La barra del segundo caso importa: sin ella `/publicarx` sería una puerta.
  return ACCOUNT_DOORS.some((door) => pathname === door || pathname.startsWith(`${door}/`));
}

/**
 * A dónde puede volver quien entró (tasks.md 15.10, F19).
 *
 * **Es más estrecha que la regla de Auth.js, y ésa es toda la razón por la que
 * existe.** La librería acepta cualquier destino del mismo origen —conducido y
 * medido en `infrastructure/magic-link-ida-y-vuelta.test.ts`—, así que el
 * inicio le vale. La F19 dice «vuelve a la pantalla de donde salió, nunca al
 * inicio»: eso es una lista de puertas, no una comprobación de origen. `null` y
 * no un respaldo, igual que `safeReturnPath`: quien llama sabe qué hacer.
 */
export function safeSignInReturn(candidate: string): string | null {
  const value = candidate.trim();
  const url = internalUrl(value);
  if (url === null) return null;
  if (!isSignInDoor(url.pathname)) return null;

  return value;
}
