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

/**
 * Una unidad del metadato — una zona, "2 hab", "78 m²", "ref. LC-0912" — que
 * nunca se parte por dentro (tasks.md 22.47, fundador 2026-09-06).
 *
 * **Por qué vive acá y no en `ListingMeta` ni en cada consumidor.**
 * `ListingMeta` deliberadamente no compone la frase — sólo lleva el papel
 * tipográfico, para que `ListingCard`, `ResultRow` y `/mis-avisos` sigan
 * decidiendo cada uno cuáles partes tiene y en qué orden (una ciudad, una
 * antigüedad, una referencia). Ponerle a `ListingMeta` la regla de "no te
 * partas" la obligaría a saber qué es una "parte" de una frase que no
 * arma; ponerla en cada consumidor la habría triplicado, que es
 * exactamente el defecto que promovió el átomo (ver el comentario de
 * arriba). `ListingMetaPart` resuelve las dos cosas: declara la regla una
 * sola vez y deja que sea el consumidor quien decide qué texto es una
 * unidad.
 *
 * **Por qué la regla es sólo `white-space: nowrap` y no un separador
 * propio.** El defecto medido es que el navegador puede cortar dentro de
 * una unidad («los» seguido de «palos» en dos líneas); el separador
 * `· ` entre unidades sigue siendo texto normal en el JSX de cada
 * consumidor, con un espacio normal a cada lado — y un espacio normal es
 * exactamente donde SÍ puede cortar, que es lo que hace que la unidad
 * completa caiga entera a la línea de abajo en vez de partirse.
 */
export function ListingMetaPart({ children }: { readonly children: ReactNode }) {
  return <span className={styles.part}>{children}</span>;
}
