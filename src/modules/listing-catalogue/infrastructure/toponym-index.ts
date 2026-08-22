/**
 * Lee el «Índice de topónimos» que cada archivo de `docs/territorio/` lleva
 * después de la taxonomía, y devuelve **cómo se busca** cada lugar.
 *
 * **Qué resuelve, y no lo resuelve el árbol.** IPOSTEL entierra topónimos
 * dentro de nombres compuestos: en alcance hay 32 «Oficina Postal Telegráfica
 * X», 90 «X del Sector Y», 8 «Casco Central de X», 33 «Centro X» y 16 «Zona
 * Industrial X». El árbol guarda el nombre completo, que es lo correcto — es lo
 * que la fuente publica — pero **nadie escribe eso en una caja de búsqueda**.
 * Quien busca «Bella Vista» no encuentra hoy la entrada que se llama «Oficina
 * Postal Telegráfica Bella Vista», y son 179 nombres en esa situación.
 *
 * **El índice no crea zonas, y este módulo tampoco.** Cada fila apunta a una
 * entrada que ya existe en el árbol; lo que agrega es un alias por el cual
 * encontrarla. Esa distinción es la misma que el documento fuente declara sobre
 * sí mismo, y romperla sería inventar lugares — que es exactamente lo que la
 * regla del proyecto prohíbe.
 *
 * Separado del parser del árbol a propósito: aquél lee viñetas con marcador de
 * procedencia, éste lee filas de una tabla. Ninguno puede confundir al otro.
 */

export interface ToponymEntry {
  /** El nombre buscable, ya sin la palabra de categoría. */
  readonly toponym: string;
  /** La parroquia donde aparece. Es lo que desambigua un nombre repetido. */
  readonly parish: string;
  /** La entrada del árbol a la que apunta, con su nombre completo. */
  readonly entry: string;
}

/** `| **Topónimo** | **Parroquia** → *Entrada*<br>… |` */
const ROW = /^\|\s*\*\*(.+?)\*\*\s*\|\s*(.+?)\s*\|\s*$/u;

/** Una aparición dentro de la segunda celda. */
const OCCURRENCE = /\*\*(.+?)\*\*\s*→\s*\*(.+?)\*/u;

/**
 * El índice empieza en su propio encabezado de primer nivel y termina donde
 * empieza el siguiente. Delimitarlo importa: la sección «Fuentes» que viene
 * después también lleva viñetas, y una tabla suelta en cualquier otra parte del
 * documento no es este índice.
 */
const INDEX_HEADING = /^#\s+Índice de topónimos\s*$/u;

export function parseToponymIndex(markdown: string): readonly ToponymEntry[] {
  const entries: ToponymEntry[] = [];
  let inside = false;

  for (const line of markdown.split("\n")) {
    if (INDEX_HEADING.test(line)) {
      inside = true;
      continue;
    }
    if (inside && line.startsWith("# ")) break;
    if (!inside) continue;

    const row = ROW.exec(line);
    if (!row?.[1] || !row[2]) continue;

    const toponym = row[1];
    // El encabezado de la tabla es una fila más para un regex, y su primera
    // celda dice literalmente «Topónimo». Se descarta por lo que dice, no por
    // su posición: una tabla puede llevar líneas de prosa antes.
    if (toponym === "Topónimo") continue;

    // **Cada aparición es su propia fila.** La fuente las junta con `<br>` para
    // que se lean como una celda, pero un topónimo en dos parroquias son dos
    // filtros distintos: la sugerencia tiene que poder decir «05 de Julio ·
    // Coquivacoa» y «05 de Julio · Olegario Villalobos» por separado, o el
    // visitante aplica el de la parroquia equivocada y se lleva cero
    // resultados sin entender por qué.
    for (const chunk of row[2].split("<br>")) {
      const occurrence = OCCURRENCE.exec(chunk);
      if (!occurrence?.[1] || !occurrence[2]) continue;
      entries.push({ toponym, parish: occurrence[1], entry: occurrence[2] });
    }
  }

  return entries;
}
