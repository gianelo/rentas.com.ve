/**
 * Las dos reglas que toda superficie que dibuja una foto necesita, y que
 * ninguna debería reescribir: **cómo se nombra** y **de dónde se lee**.
 *
 * Puras a propósito. Viven acá y no en el componente porque la lista, la ficha
 * y el visor las necesitan a las tres, y una regla copiada en tres pantallas es
 * una regla que empieza a diferir en la primera que alguien apura.
 */

export interface PhotoCaptionParts {
  /** Base cero, como la guarda `listing_photo.position`. */
  readonly position: number;
  readonly total: number;
  readonly title: string;
  readonly zone: string;
}

/**
 * El texto alternativo, compuesto al renderizar.
 *
 * **No hay columna `alt_text`, y es decisión antes que omisión.** Pedirle a
 * quien llena el formulario de pie y con una mano que describa seis fotografías
 * produce campos vacíos, no accesibilidad. El costo, dicho en vez de escondido:
 * un texto compuesto es más pobre que una descripción real, y se elige porque
 * la alternativa realista no es mejor texto sino **ningún** texto.
 *
 * **La posición va primero** (regla R7 del fundador): *"quien usa lector de
 * pantalla necesita saber dónde está antes que qué mira"*. Al revés obliga a
 * escuchar la descripción entera de cada foto para enterarse de en cuál va,
 * seis veces seguidas.
 */
export function photoAltText({ position, total, title, zone }: PhotoCaptionParts): string {
  // Base uno para quien lee: `position` es un índice, y "Foto 0 de 6" no es
  // algo que nadie diga en voz alta.
  const head = `Foto ${position + 1} de ${total}`;
  // Sin zona no se emite la coma: un lector de pantalla leería el separador y
  // después nada, que suena a error y no a ausencia.
  const tail = zone.trim() === "" ? title : `${title}, ${zone}`;

  return `${head} — ${tail}`;
}

/**
 * Dónde se lee una derivada.
 *
 * La base pública es configuración de entorno (`R2_BUCKET_PUBLIC_URL`) y cambia
 * cuando el bucket se muda detrás de un dominio propio — por eso `listing_photo`
 * guarda claves y nunca URLs, y por eso esta función existe en vez de una
 * columna.
 */
export function photoUrl(publicBaseUrl: string, key: string): string {
  if (key.trim() === "") {
    // Ruidoso, porque el modo de falla silencioso es peor: una
    // `<img src="https://fotos.rentas.com.ve">` no falla de forma visible —
    // pide la raíz del bucket, recibe cualquier cosa y dibuja un ícono roto.
    throw new Error("listing-photo-view: no se puede construir una URL con clave vacía.");
  }

  // La barra final es la parte que nadie recuerda al escribir un `.env`, y una
  // URL con `//` en el medio funciona a veces y rompe el caché otras, porque
  // para un CDN es una URL distinta.
  return `${publicBaseUrl.replace(/\/+$/, "")}/${key}`;
}
