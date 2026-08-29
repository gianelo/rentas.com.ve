import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * **La atadura entre la ficha y lo que el arnés mide** (tasks.md 16.23, 16.36).
 *
 * `tests/measure/ficha.spec.ts` lee geometría dibujada —lo único capaz de
 * distinguir `--ficha-price-fs` (30) de `--fpb` (26), porque `lint:tokens`
 * acepta las dos por igual— y para eso `app/measure/page.tsx` monta la hoja
 * real de esta pantalla con los mismos nombres de clase.
 *
 * El riesgo que queda es de puntería y no de valor: si esta página renombrara
 * `.price`, el arnés seguiría midiendo una clase que la ficha ya no usa y las
 * seis medidas quedarían verdes sobre una pantalla huérfana. Es exactamente el
 * defecto que dejó a este repositorio midiendo un formulario de publicar que
 * ya no existía. Esta prueba lo hace imposible en silencio.
 *
 * Es una aserción de código fuente A PROPÓSITO y no una de tamaño: el tamaño
 * lo mide el navegador. Acá sólo se verifica que las dos pantallas apunten al
 * mismo lugar.
 */
const page = readFileSync("app/alquiler/[ciudad]/[zona]/[slug]/page.tsx", "utf-8");
const harness = readFileSync("app/measure/page.tsx", "utf-8");

/** Las clases cuyo tamaño dibujado prueba `tests/measure/ficha.spec.ts`. */
const MEASURED = ["price", "perMonth", "title", "text", "summary", "contact"] as const;

/**
 * **Con cierre de identificador, y esto costó una mutación en rojo.**
 * `toContain("styles.price")` sigue verde si alguien renombra la clase a
 * `styles.priceUsd`, porque una es prefijo de la otra: la aserción escrita para
 * atrapar exactamente ese renombre lo dejaba pasar. El límite lo pone el
 * carácter siguiente, que en un `className` es la llave de cierre.
 */
function usesClass(source: string, object: string, name: string): boolean {
  return new RegExp(`\\{${object}\\.${name}\\}`).test(source);
}

describe("la ficha y su arnés de medición miran las mismas clases (16.36)", () => {
  it.each(MEASURED)("la ficha usa styles.%s", (name) => {
    expect(usesClass(page, "styles", name)).toBe(true);
  });

  it.each(MEASURED)("el arnés mide fichaStyles.%s", (name) => {
    expect(usesClass(harness, "fichaStyles", name)).toBe(true);
  });

  /**
   * Y mide la hoja de ESTA pantalla, no una copia con el mismo contenido. Sin
   * esto, alguien podría duplicar `ficha.module.css` bajo `app/measure/` y las
   * seis medidas seguirían verdes midiendo el duplicado.
   */
  it("el arnés importa la hoja real de la ficha y no una copia", () => {
    expect(harness).toContain('from "../alquiler/[ciudad]/[zona]/[slug]/ficha.module.css"');
  });

  /**
   * Las tres marcas que el navegador busca. Si el arnés dejara de ponerlas, la
   * suite de medición fallaría por sí sola — pero fallaría por «no encontré el
   * elemento», que se parece demasiado a un arnés roto como para dejarlo
   * dependiendo de la lectura de quien mire el log.
   */
  it.each(["ficha-price", "ficha-title", "ficha-description", "ficha-media"])(
    'el arnés marca "%s" para que el navegador pueda apuntarle',
    (testid) => {
      expect(harness).toContain(`data-testid="${testid}"`);
    },
  );
});
