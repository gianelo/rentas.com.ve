/**
 * **Un fallo tiene dos mitades, y el digest las une** (tareas 11b.2 y 11b.4).
 *
 * La mitad de arriba es lo que el visitante recibe: hoy, la pantalla por
 * defecto de Next —*«Application error: a server-side exception has
 * occurred»* más un hash, en inglés y sin una salida—. La de abajo es lo que
 * queda escrito en `stdout`, que Vercel captura. **El valor no es
 * «escribirlo» sino escribirlo en una forma que se pueda buscar y alertar**,
 * y que un visitante que nos cita un código nos lleve a UNA línea.
 *
 * **Vive en el dominio y no en `app/` a propósito.** Dar formato a una línea
 * de registro no es una regla de negocio; **qué puede aparecer en ella sí lo
 * es**, con una consecuencia de privacidad directa, y el suelo de cobertura
 * del 90 % llega a `src/modules/` y no llega a `app/`. Una regla escrita en
 * una frontera es una regla que nada protege.
 *
 * El idioma de este repositorio para eso ya existe: el estado de contacto
 * bloqueado **no tiene propiedad `value`**, así que un render no puede
 * filtrarlo. Acá la forma equivalente es una salida de seis claves fijas —
 * lo que no está en la lista no llega al registro, aunque quien llame lo
 * pase.
 */

/**
 * Dónde falló. Es el vocabulario cerrado de `onRequestError`, y se vuelve a
 * cerrar acá: la frontera llega como cadena desde Next, así que un valor que
 * una versión futura agregue se anota como `desconocido` en vez de entrar sin
 * que nadie lo mire. Un campo de registro con un valor inesperado es una
 * alerta que deja de disparar en silencio.
 */
const BOUNDARIES = ["render", "route", "action", "middleware"] as const;

export interface FailureInput {
  readonly boundary: string;
  /**
   * El **patrón** de ruta (`/renovar/[token]`), no la URL.
   *
   * No es un detalle de estilo: `/renovar/<token>` lleva el token de
   * renovación **en el camino**, así que una URL real escrita en el registro
   * publicaría en `stdout` la llave que renueva el aviso de otra persona.
   * `onRequestError` entrega el patrón en `context.routePath`; el recorte de
   * abajo es la segunda red.
   */
  readonly route: string;
  readonly digest?: string;
  readonly cause: unknown;
}

/**
 * El único código que puede salir a un documento HTML **y** a una línea de
 * registro.
 *
 * `error.digest` es una cadena que llega del servidor y esta función es lo
 * único entre ella y la pantalla. Un digest de Next es hexadecimal; cualquier
 * otra cosa —un mensaje de error, una ruta, un token— es algo que alguien
 * puso ahí, y dibujarlo sería filtrar por la puerta que abrimos para ayudar.
 */
export function failureReference(digest: string | undefined): string | null {
  if (digest === undefined) return null;
  return /^[0-9a-f]{1,40}$/i.test(digest) ? digest : null;
}

/** Correos, y rachas de 7 dígitos o más — que es un teléfono venezolano. */
const LEAKS = [/[\w.+-]+@[\w-]+\.[\w.-]+/g, /\d[\d\s.-]{6,}\d/g];
const MAX_CAUSE = 200;

function describeCause(cause: unknown): string {
  // **Falla cerrado.** `throw { token }` es JavaScript válido, y serializar
  // ese objeto entero pondría el token en el registro. De un valor que no es
  // `Error` se anota QUÉ era, nunca su contenido.
  if (!(cause instanceof Error)) {
    return `valor lanzado que no es Error (${typeof cause})`;
  }

  // La pila no se escribe, y no es por tamaño: lleva rutas de archivo,
  // argumentos y —en este producto— el valor de contacto que el caso de uso
  // acababa de leer. El mensaje alcanza para buscar y alertar.
  let described = `${cause.name}: ${cause.message}`;
  for (const leak of LEAKS) described = described.replace(leak, "[oculto]");

  return described.length > MAX_CAUSE ? `${described.slice(0, MAX_CAUSE - 1)}…` : described;
}

/**
 * Una línea de JSON por fallo, con la ruta, el digest que se le mostró al
 * visitante y la causa. Sin marca de tiempo: Vercel le pone la suya a cada
 * línea, y un segundo reloj es un segundo reloj que reconciliar.
 */
export function failureLogLine(input: FailureInput): string {
  return JSON.stringify({
    level: "error",
    event: "failure",
    boundary: BOUNDARIES.includes(input.boundary as (typeof BOUNDARIES)[number])
      ? input.boundary
      : "desconocido",
    // El corte deja fuera lo que el visitante escribió y lo que un enlace
    // arrastró. `replace` y no `split(...)[0]`: con `noUncheckedIndexedAccess`
    // el índice devuelve `string | undefined` y el `??` que haría falta sería
    // una rama que ninguna prueba puede alcanzar.
    route: input.route.replace(/[?#].*$/, ""),
    digest: failureReference(input.digest),
    cause: describeCause(input.cause),
  });
}

/** Lo que se dibuja cuando algo falla. Sin una sola decisión en la pantalla. */
export interface FailureScreen {
  readonly heading: string;
  readonly body: string;
  /** El código que el visitante puede citarnos, o `null` si no hay ninguno. */
  readonly reference: string | null;
  readonly exit: { readonly href: string; readonly label: string };
}

/**
 * **La salida, y es una sola constante compartida.** El criterio permanente
 * del fundador es que ninguna pantalla termina en un vacío sin salida; dos
 * literales separados son dos que pueden discrepar el día que la portada
 * cambie de dirección.
 */
export const ERROR_SCREEN_EXIT = { href: "/", label: "Ir al inicio" } as const;

export function resolveErrorScreen(digest: string | undefined): FailureScreen {
  return {
    heading: "Algo falló de nuestro lado",
    body: "No es tu conexión ni el aviso que buscabas. El fallo quedó registrado con el código de abajo, y desde el inicio puedes volver a buscar.",
    reference: failureReference(digest),
    exit: ERROR_SCREEN_EXIT,
  };
}

/**
 * **No dice si el aviso venció, si lo ocultaron o si nunca existió** (tarea
 * 16.20). Las tres respuestas son la misma a propósito: distinguirlas le
 * entrega a quien sondea direcciones el dato exacto que le falta.
 */
export const NOT_FOUND_SCREEN: FailureScreen = {
  heading: "No encontramos esa página",
  body: "El enlace puede estar mal copiado, o el aviso ya no está publicado. Desde el inicio puedes buscar en la zona que te interesa.",
  reference: null,
  exit: ERROR_SCREEN_EXIT,
};
