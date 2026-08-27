/**
 * La costura que deja correr la aplicación entera contra un Postgres de verdad
 * sin tocar una línea de ella (tasks.md 11.22).
 *
 * `@neondatabase/serverless` habla HTTP, y a qué dirección lo habla lo decide
 * `neonConfig.fetchEndpoint`. `scripts/neon-http-proxy.mjs` traduce ese
 * protocolo a `pg` contra el contenedor de `docker-compose.yml`, y eso es lo
 * que le devuelve los dientes al proyecto `crawlability`: hasta ahora la suite
 * con el script apagado se saltaba sola porque `/alquiler/**` no tenía catálogo
 * que consultar.
 *
 * **Y es una costura de prueba sólo si no puede ser otra cosa.** Sin esta
 * comprobación, `NEON_FETCH_ENDPOINT` es una variable de entorno capaz de
 * mandar cada consulta de la aplicación —incluida la que trae el contacto de
 * quien publica— al host que alguien escriba en un despliegue, con la cadena de
 * conexión intacta y `assertPooledConnectionString` diciendo que todo está
 * bien, porque el ruteo real ya no viaja por ahí. Aceptando **sólo** el bucle
 * local, el peor caso de una variable filtrada es una aplicación que no
 * arranca.
 *
 * `assertPooledConnectionString` no se debilita ni se toca: la cadena de prueba
 * lleva `-pooler.` en su nombre de host y pasa esa guarda igual que hoy, así que
 * un endpoint directo de Neon en producción se sigue rechazando exactamente
 * como antes.
 */

/** `localhost` incluido: es lo que resuelve a 127.0.0.1 en toda máquina de CI. */
const LOOPBACK_HOSTNAMES = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

export function resolveLocalFetchEndpoint(raw: string | undefined): string | null {
  const value = raw?.trim();
  // Ausente y vacía significan lo mismo, y es el camino de producción: nadie
  // redirige nada. Es la misma lección que `playwright.config.ts` ya anotó —
  // CI pone cadenas vacías donde no hay valor.
  if (!value) return null;

  let hostname: string;
  try {
    ({ hostname } = new URL(value));
  } catch {
    throw new Error(`NEON_FETCH_ENDPOINT no es una dirección válida: "${value}".`);
  }

  // `URL` ya separó el host del usuario y del sufijo, así que
  // `http://127.0.0.1@evil.test/` da `evil.test` y `localhost.evil.test` da
  // exactamente eso. Comparar la cadena entera con `includes` habría aceptado
  // los dos.
  if (!LOOPBACK_HOSTNAMES.has(hostname)) {
    throw new Error(
      `NEON_FETCH_ENDPOINT sólo se acepta hacia el bucle local (loopback), y apunta a "${hostname}". ` +
        "Es la costura del arnés de e2e (tasks.md 11.22), no una forma de mover la base de datos.",
    );
  }

  return value;
}
