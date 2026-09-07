import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * **La atadura entre la pantalla de resultados y lo que el arnés mide**
 * (tasks.md 14.29, y la misma forma que la 16.36 ya usa para la ficha).
 *
 * `tests/measure/lista.spec.ts` cuenta cuántos avisos entran enteros sobre el
 * pliegue, y ese número depende de TODO lo que hay encima de la cuadrícula. Por
 * eso `app/measure/lista/page.tsx` monta la composición real —el mismo
 * `SearchResultsHeader` que las dos rutas de resultados dibujan desde la 22.6,
 * en el mismo orden— en vez de una maqueta parecida.
 *
 * **Reescrita por la 22.6.** Antes de esta extracción el arnés y las dos
 * pantallas dibujaban cada uno su propia miga de pan/título/conteo con
 * `className={styles.X}`, y esta prueba ataba los tres comparando nombres de
 * clase. La 22.6 movió ese marcado a un solo componente compartido —la
 * corrección de duplicación que el enunciado pedía—, así que la atadura ya no
 * puede leerse en nombres de clase repetidos: se lee en que los tres montan el
 * MISMO componente, y en que la cuadrícula del arnés usa la hoja real del
 * componente que dibuja la carcasa de resultados, no una copia.
 *
 * El riesgo que queda es de puntería y no de valor: si una pantalla dejara de
 * montar `SearchResultsHeader`, o el arnés importara una copia de su hoja, los
 * tres números quedarían verdes sobre una pantalla huérfana. Es exactamente el
 * defecto que dejó a este repositorio midiendo un formulario de publicar
 * retirado. Esta prueba lo hace imposible en silencio.
 *
 * Es una aserción de código fuente A PROPÓSITO y no una de tamaño: el tamaño
 * lo mide el navegador. Acá sólo se verifica que las tres pantallas monten lo
 * mismo, encima de lo mismo.
 */
const ZONA = readFileSync("app/alquiler/[ciudad]/[zona]/page.tsx", "utf-8");
const CIUDAD = readFileSync("app/alquiler/[ciudad]/page.tsx", "utf-8");
const ARNES = readFileSync("app/measure/lista/page.tsx", "utf-8");

describe("la pantalla de resultados y su arnés de medición dibujan lo mismo (14.29, 22.6)", () => {
  /**
   * **El encabezado compartido, y no una copia de su marcado.** Con cierre de
   * identificador: `toContain("<SearchResultsHeader")` sigue verde si alguien
   * renombra el componente a `SearchResultsHeaderV2`, porque uno es prefijo
   * del otro — la misma trampa que la 16.36 dejó anotada para `styles.count`.
   * El espacio o el `\n` que sigue al nombre es lo que cierra el identificador
   * en JSX.
   */
  it.each([
    ["la zona", ZONA],
    ["la ciudad", CIUDAD],
    ["el arnés", ARNES],
  ])("%s monta SearchResultsHeader", (_nombre, fuente) => {
    expect(fuente).toMatch(/<SearchResultsHeader[\s>]/);
  });

  /**
   * Y las dos pantallas reales —no el arnés, que mide sólo lo que hay sobre el
   * pliegue y nunca pagina ni cierra la lista— montan también la carcasa de
   * resultados que la 22.6 extrajo del mismo par de hojas.
   */
  it.each([
    ["la zona", ZONA],
    ["la ciudad", CIUDAD],
  ])("%s monta SearchResultsList", (_nombre, fuente) => {
    expect(fuente).toMatch(/<SearchResultsList[\s>]/);
  });

  /**
   * Y mide la hoja de ESTE componente, no una copia con el mismo contenido.
   * Sin esto, alguien podría duplicar `SearchResultsList.module.css` bajo
   * `app/measure/` y la medición seguiría verde midiendo el duplicado.
   */
  it("el arnés importa la hoja real de SearchResultsList y no una copia", () => {
    expect(ARNES).toContain('from "../../../components/organisms/SearchResultsList.module.css"');
  });

  /**
   * **Las piezas que no son una clase, y que también empujan.** La barra con
   * su pastilla, el panel cerrado y el contenedor son componentes, así que un
   * renombre de clase no los alcanza: se atan por su nombre. `ListingGrid` no
   * entra en esta lista desde la 22.6: en la pantalla real vive dentro de
   * `SearchResultsList` y ya no en `page.tsx`, así que se verifica ahí abajo,
   * sobre el componente que de verdad la dibuja.
   */
  it.each(["<Nav", "<SearchPanel", "<Container"])(
    "el arnés monta %s, igual que la pantalla",
    (pieza) => {
      expect(ARNES).toContain(pieza);
      expect(ZONA).toContain(pieza);
    },
  );

  /**
   * **`ListingGrid`, donde de verdad vive ahora.** El arnés la monta sin pasar
   * por `SearchResultsList` —mide sólo lo que hay sobre el pliegue—, y la
   * pantalla real la monta a través de él. Comprobar los dos sitios en vez de
   * uno solo es lo que evita que un cambio en cualquiera de las dos rutas deje
   * de dibujar avisos sin que esta prueba lo note.
   */
  it("el arnés monta ListingGrid, y SearchResultsList la monta por la pantalla real", () => {
    expect(ARNES).toContain("<ListingGrid");

    const SEARCH_RESULTS_LIST = readFileSync("components/organisms/SearchResultsList.tsx", "utf-8");
    expect(SEARCH_RESULTS_LIST).toContain("<ListingGrid");
  });

  /**
   * La marca que el navegador busca. Si el arnés dejara de ponerla, la suite
   * de medición fallaría por sí sola — pero fallaría por «no encontré el
   * elemento», que se parece demasiado a un arnés roto como para dejarlo
   * dependiendo de la lectura de quien mire el log.
   */
  it('el arnés marca "lista-grid" para que el navegador pueda apuntarle', () => {
    expect(ARNES).toContain('data-testid="lista-grid"');
  });

  /**
   * **La puerta, y es la misma que la de `/measure`.** Un arnés que se sirviera
   * en producción sería una pantalla de mentira indexable con avisos que no
   * existen.
   */
  it("el arnés 404 fuera del arnés", () => {
    expect(ARNES).toContain('process.env.MEASURE_HARNESS_ENABLED !== "true"');
    expect(ARNES).toContain("notFound()");
  });
});
