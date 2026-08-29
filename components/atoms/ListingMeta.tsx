import type { ReactNode } from "react";
import styles from "./ListingMeta.module.css";

/**
 * La línea de metadatos de un aviso — `zona · N hab · N m²` (tasks.md 1b.5,
 * SISTEMA.md "Metadato").
 *
 * **Por qué es un átomo y no tres bloques de CSS parecidos.** El disparador
 * que la propia 1b.5 escribió —«promote if a second consumer appears»— se
 * disparó hace tiempo: `ListingCard`, `ResultRow` y `/mis-avisos` dibujaban
 * cada uno su copia. Las dos primeras eran idénticas byte a byte salvo un
 * comentario; la tercera ya había perdido `font-family`, `font-weight` y
 * `line-height`, así que la misma frase se dibujaba en dos pesos distintos
 * según la pantalla. Ninguna prueba podía verlo, porque cada hoja era
 * coherente consigo misma.
 *
 * **No decide qué dice, sólo cómo se ve.** Quién compone la frase —y con qué
 * separador— es del dominio de cada superficie; acá sólo vive el papel
 * tipográfico. Un átomo que además armara el texto le quitaría a
 * `/mis-avisos` su `· ref. LC-0912`, que la lámina 14d sí dibuja.
 */
export function ListingMeta({ children }: { readonly children: ReactNode }) {
  return <p className={styles.meta}>{children}</p>;
}
