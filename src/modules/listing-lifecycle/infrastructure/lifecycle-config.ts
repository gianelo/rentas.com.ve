/**
 * Los dos secretos del ciclo de vida, leídos en un solo lugar.
 *
 * **Ninguno tiene valor por defecto, y ninguno de los dos lectores lanza.**
 * Un default convertiría un despliegue al que se le olvidó la variable en uno
 * que firma tokens con un secreto que está escrito en el repositorio; lanzar,
 * en cambio, tumbaría la ruta con un 500 en vez de contestar 401. Devuelven
 * `undefined` y quien llama decide — `isAuthorizedJobRequest` ya falla cerrado
 * con `undefined`.
 */

export function readCronSecret(env: Record<string, string | undefined> = process.env) {
  return env.CRON_SECRET || undefined;
}

/**
 * El secreto que firma los enlaces de renovación.
 *
 * **Cae en `CRON_SECRET` si no está declarado aparte, y eso es una decisión
 * con su costo escrito.** Lo correcto es una variable propia: el secreto del
 * cron lo conoce Vercel y el de los tokens sólo tiene que conocerlo la
 * aplicación, y compartirlos hace que rotar uno invalide todos los enlaces de
 * renovación que estén viajando por correo. Se comparte igual porque hoy
 * ninguna de las dos variables existe en el proyecto y pedir dos hace que se
 * configure una: la caída deja la puerta cerrada, no abierta.
 */
export function readRenewalSecret(env: Record<string, string | undefined> = process.env) {
  return env.RENEWAL_TOKEN_SECRET || env.CRON_SECRET || undefined;
}

/**
 * Lo que hace falta para que salga un correo (tasks.md 7.11).
 *
 * **Las dos o ninguna.** Una clave sin remitente manda todo al rebote y un
 * remitente sin clave no manda nada; devolver una mitad dejaría a quien llama
 * construyendo un adaptador que falla en el primer envío, con la tanda ya
 * empezada y el libro de reservas tomado. Se comprueban acá, antes.
 *
 * Sigue la misma regla que los otros dos: no lanza, devuelve `undefined` y
 * la ruta decide qué contestar.
 */
export function readMailerConfig(env: Record<string, string | undefined> = process.env) {
  const apiKey = env.RESEND_API_KEY || undefined;
  const from = env.LIFECYCLE_MAIL_FROM || undefined;

  if (!apiKey || !from) return undefined;

  return { apiKey, from } as const;
}
