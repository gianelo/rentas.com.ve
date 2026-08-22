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

export function safeSignInDestination(candidate: string): string {
  const value = candidate.trim();
  if (value === "") return SIGN_IN_FALLBACK;

  let url: URL;
  try {
    url = new URL(value, SAME_ORIGIN);
  } catch {
    // Basura que ni siquiera parsea. Lanzar acá le daría una pantalla rota a
    // alguien que sólo quería un número de teléfono.
    return SIGN_IN_FALLBACK;
  }

  // Cualquier candidato que traiga su propio origen sale con uno distinto del
  // inventado. Eso cubre `https://evil.test/…` y `//evil.test/…` de una vez, y
  // sin una lista de esquemas que alguien tenga que mantener.
  if (url.origin !== SAME_ORIGIN) return SIGN_IN_FALLBACK;
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
