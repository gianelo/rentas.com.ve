/**
 * De dónde lee el navegador una foto ya guardada.
 *
 * **Sólo esta variable, y no las seis de R2.** `readR2Config` exige las seis
 * porque escribe: necesita credenciales, endpoint y cuenta. La capa de lectura
 * no escribe nada, y pedirle las seis a una pantalla pública significaría que
 * la lista de resultados deja de dibujarse porque falta una clave secreta que
 * nunca va a usar.
 *
 * Se lee acá y no en el dominio porque `process.env` es infraestructura:
 * `photoUrl` recibe la base como argumento justamente para poder probarse sin
 * un entorno.
 */
export function readPhotoPublicBaseUrl(env: Record<string, string | undefined> = process.env) {
  const value = env.R2_BUCKET_PUBLIC_URL?.trim();

  // Ruidoso, y a propósito. Con la base vacía `photoUrl` emitiría `/photos/…`,
  // una ruta relativa que el propio sitio responde con un 404 — veinte íconos
  // rotos en la cuadrícula y ni una línea en el log diciendo por qué.
  if (!value) {
    throw new Error(
      "listing-discovery: falta R2_BUCKET_PUBLIC_URL, y sin ella no hay URL de foto que construir.",
    );
  }

  return value;
}
