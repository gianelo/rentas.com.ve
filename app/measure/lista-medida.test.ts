import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * **La atadura entre la pantalla de resultados y lo que el arnés mide**
 * (tasks.md 14.29, y la misma forma que la 16.36 ya usa para la ficha).
 *
 * `tests/measure/lista.spec.ts` cuenta cuántos avisos entran enteros sobre el
 * pliegue, y ese número depende de TODO lo que hay encima de la cuadrícula. Por
 * eso `app/measure/lista/page.tsx` monta la composición real —la hoja de la
 * zona, las mismas piezas, en el mismo orden— en vez de una maqueta parecida.
 *
 * El riesgo que queda es de puntería y no de valor: si la pantalla dejara de
 * dibujar la miga de pan, o renombrara `.count`, el arnés seguiría midiendo un
 * encabezado que ya nadie sirve y los tres números quedarían verdes sobre una
 * pantalla huérfana. Es exactamente el defecto que dejó a este repositorio
 * midiendo un formulario de publicar retirado. Esta prueba lo hace imposible
 * en silencio.
 *
 * Es una aserción de código fuente A PROPÓSITO y no una de tamaño: el tamaño
 * lo mide el navegador. Acá sólo se verifica que las dos pantallas dibujen lo
 * mismo, encima de lo mismo.
 */
const ZONA = readFileSync("app/alquiler/[ciudad]/[zona]/page.tsx", "utf-8");
const CIUDAD = readFileSync("app/alquiler/[ciudad]/page.tsx", "utf-8");
const ARNES = readFileSync("app/measure/lista/page.tsx", "utf-8");

/**
 * Las clases del encabezado que empujan la cuadrícula hacia abajo. Son las
 * cuatro que la lámina 6c NO dibuja y la pantalla servida sí, más el
 * contenedor de la cuadrícula: entre las cinco está el hueco que la 14.29
 * mide.
 */
const MEDIDAS = [
  "breadcrumb",
  "crumbs",
  "crumb",
  "crumbLink",
  "title",
  "count",
  "results",
] as const;

/**
 * **Con cierre de identificador, y esto costó una mutación en rojo en la
 * 16.36.** `toContain("styles.count")` sigue verde si alguien renombra la
 * clase a `styles.countTotal`, porque una es prefijo de la otra. El límite lo
 * pone el carácter siguiente, que en un `className` es la llave de cierre.
 */
function usaClase(fuente: string, objeto: string, nombre: string): boolean {
  return new RegExp(`\\{${objeto}\\.${nombre}\\}`).test(fuente);
}

describe("la pantalla de resultados y su arnés de medición dibujan lo mismo (14.29)", () => {
  it.each(MEDIDAS)("la zona usa styles.%s", (nombre) => {
    expect(usaClase(ZONA, "styles", nombre)).toBe(true);
  });

  it.each(MEDIDAS)("el arnés dibuja styles.%s", (nombre) => {
    expect(usaClase(ARNES, "styles", nombre)).toBe(true);
  });

  /**
   * Y mide la hoja de ESTA pantalla, no una copia con el mismo contenido. Sin
   * esto, alguien podría duplicar `zona.module.css` bajo `app/measure/` y los
   * tres números seguirían verdes midiendo el duplicado.
   */
  it("el arnés importa la hoja real de la zona y no una copia", () => {
    expect(ARNES).toContain('from "../../alquiler/[ciudad]/[zona]/zona.module.css"');
  });

  /**
   * **Las tres piezas que no son una clase, y que también empujan.** La barra
   * con su pastilla, el panel cerrado y las fichas quitables son componentes,
   * así que un renombre de clase no los alcanza: se atan por su nombre.
   */
  it.each(["<Nav", "<SearchPanel", "<FilterChips", "<ListingGrid", "<Container"])(
    "el arnés monta %s, igual que la pantalla",
    (pieza) => {
      expect(ARNES).toContain(pieza);
      expect(ZONA).toContain(pieza);
    },
  );

  /**
   * **La ciudad dibuja el mismo encabezado que la zona**, y por eso una sola
   * medición vale para las dos. El día que dejen de coincidir, esta prueba lo
   * dice antes de que alguien mida una y crea que midió las dos — que es la
   * misma razón por la que `filtros-contract.test.ts` (14.33) corre sus
   * aserciones sobre los dos archivos y no sobre uno.
   */
  it.each(MEDIDAS)("la ciudad también usa styles.%s", (nombre) => {
    expect(usaClase(CIUDAD, "styles", nombre)).toBe(true);
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
