import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * La puerta de las rutas de trabajos (tasks.md 7.5).
 *
 * **Es dominio y no middleware, y ésa es la decisión.** Escrita en la ruta,
 * la comparación se copia y pega al agregar el segundo trabajo, y la copia
 * es donde aparece el `===`. Acá se prueba una vez, con las siete formas de
 * encabezado torcido, y las dos rutas la llaman.
 *
 * **Comparación en tiempo constante.** `header === "Bearer " + secret` corta
 * en el primer byte distinto, y esa diferencia de tiempo es medible por red
 * en suficientes intentos: alcanza para adivinar el secreto carácter por
 * carácter. Se comparan los HMAC de los dos lados, que miden siempre lo mismo
 * y no dependen del largo de lo que llegó.
 *
 * **Falla cerrado.** Sin `CRON_SECRET` en el servidor no hay forma de acertar:
 * un despliegue al que se le olvidó la variable deja la ruta cerrada en vez de
 * abierta al mundo, que es el error que no se nota hasta que alguien lo usa.
 */
const SCHEME = "Bearer ";

export function isAuthorizedJobRequest(
  authorizationHeader: string | null,
  serverSecret: string | undefined,
): boolean {
  if (!serverSecret) return false;
  if (!authorizationHeader?.startsWith(SCHEME)) return false;

  const presented = authorizationHeader.slice(SCHEME.length);
  const a = createHmac("sha256", "compare").update(presented).digest();
  const b = createHmac("sha256", "compare").update(serverSecret).digest();
  return timingSafeEqual(a, b);
}
