/**
 * Las dos escalas de fecha que el producto escribe en pantalla, en un solo
 * sitio (tasks.md 16.34).
 *
 * **Vive acá y no en un dominio a propósito.** Qué FRASE dice la pantalla es
 * producto y se decide en un dominio con su prueba —«verificado
 * por WhatsApp el 19 ago» sale de `contact-verification-notice.ts`—; cómo un
 * `Date` se convierte en «19 ago» no decide nada del producto, es la misma
 * conversión para cualquier frase que lleve una fecha, y compartirla es
 * justamente lo que impide que dos pantallas escriban el mismo día distinto.
 *
 * **Siempre en UTC.** Venezuela es UTC-4, así que un instante de las 02:00 Z
 * cae el día anterior en Caracas: sin fijar la zona, la misma fila se lee «18
 * ago» o «19 ago» según dónde corra el render. `lifecycle-notice.ts` y
 * `/mis-avisos` ya lo escribían ("en UTC para no mentir"); las dos copias
 * cortas que esta función reemplaza no lo hacían.
 *
 * **La abreviatura la pone el CLDR, no una tabla escrita a mano.** Devuelve
 * «19 ago.» y «12 sept.», con el punto que el español abreviado lleva. Las
 * láminas dibujan «19 ago» y «12 sep»; esa diferencia queda registrada como
 * discrepancia lámina/CLDR (tasks.md 16.40) en vez de resolverse acá
 * inventando doce literales, que sería inventar un valor que el sistema no
 * define (AGENTS.md §2).
 */

function formatter(month: "short" | "long"): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat("es-VE", { day: "numeric", month, timeZone: "UTC" });
}

/** «19 ago.» — la escala del pie de la ficha y de la línea de verificación. */
export function shortSpanishDate(date: Date): string {
  return formatter("short").format(date);
}

/** «12 de septiembre» — la escala del recuadro del aviso vencido. */
export function longSpanishDate(date: Date): string {
  return formatter("long").format(date);
}
