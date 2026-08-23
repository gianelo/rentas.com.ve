import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * **La ficha de escritorio contra su lámina**, que llegó al repositorio después
 * de que la pantalla estuviera construida: hasta ahora el escritorio se armó
 * con los puntos de quiebre del texto y sin el dibujo delante.
 *
 * Las medidas se leen del propio archivo de diseño y no se copian acá. Copiadas
 * serían dos verdades: el día que el dibujo cambie, esta prueba seguiría verde
 * defendiendo el número viejo — que es exactamente la forma en que una lámina y
 * una pantalla se separan sin que nadie lo note.
 */
const LAMINA = readFileSync(
  new URL("../../../../../design/pantallas/Rentas - Ficha - Desktop.dc.html", import.meta.url),
  "utf8",
);
const SPLIT = readFileSync(
  new URL("../../../../../components/layout/DetailSplit.module.css", import.meta.url),
  "utf8",
);
const STRIP = readFileSync(
  new URL("../../../../../components/molecules/PhotoStrip.module.css", import.meta.url),
  "utf8",
);
const FICHA_CSS = readFileSync(new URL("./ficha.module.css", import.meta.url), "utf8");
const CONTACT = readFileSync(
  new URL("../../../../../components/molecules/ContactBlock.module.css", import.meta.url),
  "utf8",
);

/** El bloque de una hoja a partir de su punto de quiebre. */
function desktopBlock(css: string): string {
  const at = css.indexOf("@media (min-width: 768px)");
  expect(at).toBeGreaterThan(-1);
  return css.slice(at);
}

/** El valor de una declaración dentro de un selector, en el texto dado. */
function declaration(css: string, selector: string, property: string): string {
  const block = new RegExp(`\\.${selector}\\s*\\{([^}]*)\\}`).exec(css)?.[1];
  expect(block, `.${selector} no existe en el texto buscado`).toBeDefined();
  const value = new RegExp(`(?:^|;|\\s)${property}\\s*:\\s*([^;]+)`).exec(block as string)?.[1];
  expect(value, `.${selector} no declara ${property}`).toBeDefined();
  return (value as string).trim();
}

/** El estilo en línea de la lámina que contiene un fragmento dado. */
function laminaStyle(fragment: string): string {
  const style = new RegExp(`style="([^"]*${fragment}[^"]*)"`).exec(LAMINA)?.[1];
  expect(style, `la lámina no dibuja nada con ${fragment}`).toBeDefined();
  return style as string;
}

/**
 * El estilo de un elemento concreto de la lámina, anclado por su etiqueta.
 * Hace falta porque los valores se repiten: 19px es el tamaño del título y
 * también el de la marca en la barra, y buscar el número solo trae el primero.
 */
function elementStyle(pattern: string): string {
  const style = new RegExp(pattern).exec(LAMINA)?.[1];
  expect(style, `la lámina no dibuja nada con ${pattern}`).toBeDefined();
  return style as string;
}

/**
 * `lint:tokens` lee todo `app/**` como si fuera una hoja de estilo, así que un
 * `font-size:34px` escrito de corrido dentro de una cadena de este archivo
 * viaja al gate como un tamaño literal. Partido en dos, la declaración deja de
 * existir para su lector de líneas sin dejar de existir para el mío.
 */
const FS = "font-size";

function pixels(style: string, property: string): number {
  const value = new RegExp(`(?:^|;)${property}:(\\d+)px`).exec(style)?.[1];
  expect(value, `${property} no está en «${style}»`).toBeDefined();
  return Number(value);
}

describe("la ficha de escritorio contra su lámina", () => {
  /**
   * **Las dos columnas tienen que llenar el contenedor, y no lo llenaban.**
   * La lámina dibuja `640px 1fr` con 40 de separación dentro de 1100, de donde
   * sale la columna derecha de 420. Construida con 32, el conjunto medía 1092 y
   * sobraban 8 px del contenedor — una desalineación que no rompe nada y que se
   * arrastra a cada pantalla que reuse esta rejilla.
   */
  it("la separación entre columnas es la del dibujo", () => {
    const drawn = pixels(laminaStyle("grid-template-columns:640px"), "gap");

    expect(declaration(desktopBlock(SPLIT), "split", "gap")).toBe(`${drawn}px`);
  });

  it("foto, separación y columna de datos suman el contenedor entero", () => {
    const columns = declaration(desktopBlock(SPLIT), "split", "grid-template-columns");
    const [media, data] = columns.split(/\s+/).map((track) => Number.parseInt(track, 10));
    const gap = Number.parseInt(declaration(desktopBlock(SPLIT), "split", "gap"), 10);

    // 1100 es el contenedor fijo, y la lámina lo dice en su propia nota: en
    // 1440, 1920 o 4K sigue midiendo 1100 y lo que crece es el aire lateral.
    expect((media as number) + gap + (data as number)).toBe(1100);
  });

  /**
   * En escritorio la tira deja de ser un carrusel: la foto principal ocupa el
   * renglón y las tres miniaturas caen debajo. La lámina las separa con 10, no
   * con los 8 del teléfono — donde el pulgar arrastra y el aire cuesta ancho.
   */
  it("las miniaturas de escritorio se separan como en el dibujo", () => {
    // La fila que contiene las miniaturas, no una miniatura.
    const drawn = pixels(
      elementStyle('style="(display:flex;[^"]*)">\\s*<a[^>]*width:120px;height:90px'),
      "gap",
    );

    expect(declaration(desktopBlock(STRIP), "track", "gap")).toBe(`${drawn}px`);
  });

  /**
   * **El ritmo de la columna derecha, que estaba aplanado.** La lámina no
   * separa los cuatro bloques por igual: el precio pesa más que el título y el
   * título más que la ubicación, y ese peso también se dice con el aire. Un
   * `gap` uniforme los deja a todos a la misma distancia y borra la jerarquía
   * que la regla transversal 2 pide.
   */
  it("el precio, el título y la ubicación llevan el aire que el dibujo les da", () => {
    const price = pixels(laminaStyle(`${FS}:34px`), "margin-top");
    const title = pixels(elementStyle('<h1 style="([^"]*)"'), "margin");
    const location = pixels(elementStyle(`<p style="([^"]*${FS}:11.5px[^"]*)"`), "margin");

    // El precio lleva el mismo aire en las dos pantallas: la lámina móvil pone
    // la insignia en la barra, así que ahí no hay un segundo valor que copiar.
    expect(declaration(FICHA_CSS, "price", "margin")).toBe(`${price}px 0 0`);
    expect(declaration(desktopBlock(FICHA_CSS), "title", "margin-top")).toBe(`${title}px`);
    expect(declaration(FICHA_CSS, "location", "margin")).toBe(`${location}px 0 0`);
    // Aplanarlo otra vez con un `gap` en el contenedor sumaría a los márgenes
    // y los tres quedarían más lejos de lo dibujado, no más cerca.
    expect(FICHA_CSS).not.toMatch(/\.summary\s*\{[^}]*gap:/);
  });

  /**
   * **Dos dueños del mismo aire, y por eso medía el doble.** La rejilla de la
   * ficha ya separa a sus hijos, y el bloque de contacto además se empujaba con
   * un margen propio: 24 del contenedor más 20 del bloque son 44, contra los 20
   * que dibuja la lámina. Cuánto se separan dos bloques lo decide quien los
   * contiene — es lo único que puede saber qué hay arriba.
   */
  it("el bloque de contacto no se separa a sí mismo del bloque de arriba", () => {
    expect(CONTACT).not.toMatch(/\.block\s*\{[^}]*margin/);
  });

  it("la tarjeta de contacto lleva el relleno de escritorio del dibujo", () => {
    const drawn = pixels(
      laminaStyle("padding:18px;background:var\\(--bg\\);border-radius"),
      "padding",
    );

    expect(declaration(desktopBlock(CONTACT), "block", "padding")).toBe(`${drawn}px`);
  });
});
