import { expect, test } from "@playwright/test";

/**
 * **Criterio de aceptación 1, medido en vez de afirmado** (tasks.md 14.29).
 *
 * Cuántos avisos COMPLETOS entran sobre el pliegue en la pantalla principal
 * del producto. Hasta acá era una frase en el plan; acá es un número, y el
 * número contesta que **no**: entran la mitad de los que la lámina dibuja.
 *
 * **Las cotas son las medidas de HOY y no las de la lámina, a propósito.** Una
 * prueba que afirme 4 cuando entran 2 no es una medición, es un pendiente
 * escrito en rojo permanente, y una suite con un rojo permanente deja de
 * distinguir la próxima regresión. Lo que fija esta prueba es el número
 * dibujado, con `toBe` exacto en las dos pantallas: mover el alto de la
 * tarjeta, el ancho de la columna o cualquier cosa del encabezado lo pone
 * rojo diciendo cuánto se movió y hacia dónde. **Lo que falta para la lámina
 * está anotado en la 14.29 con su presupuesto en píxeles**, que es donde una
 * decisión de diseño se puede tomar; acá no se toma ninguna.
 *
 * **De dónde salen los dos objetivos, que no son los del enunciado.** El
 * enunciado de la 14.29 dice «6 a 1280» y ese 6 es anterior a la 14.33: la
 * lámina 7c lo escribe entero —*«cuatro columnas de 254: 8 avisos sobre el
 * pliegue, contra 6 antes»*—, donde el 6 es el de la barra lateral que el
 * fundador sacó el 2026-08-26. El 4 del teléfono sí sobrevive: la lámina 6c lo
 * anota con esas palabras, *«tarjeta de 195 px · 4 avisos completos»*.
 *
 * **Por qué necesita su propia ruta y no cabía en `/measure`.** Aquel arnés
 * apila veinte composiciones en una sola página para medirlas de a una, y
 * funciona porque cada medida es local: el alto de una fila, el ancho de una
 * columna, cuántas tarjetas comparten el borde superior. *Sobre el pliegue* no
 * es local — depende de TODO lo que hay encima de la cuadrícula, y encima de
 * aquélla hay diecinueve cosas que esta pantalla no dibuja.
 * `app/measure/lista-medida.test.ts` ata este arnés a la pantalla real para
 * que un renombre no deje esto midiendo una pantalla huérfana.
 */

/** El pliegue de la lámina 6c: 360×640. */
const MOVIL = { width: 360, height: 640 } as const;
/** El pliegue de la lámina 7c. */
const ESCRITORIO = { width: 1280, height: 800 } as const;

/** Lo que la lámina 6c dibuja sobre el pliegue del teléfono. */
const LAMINA_MOVIL = 4;
/** Lo que la lámina 7c dibuja sobre el pliegue del escritorio, después de la 14.33. */
const LAMINA_ESCRITORIO = 8;

/**
 * Cuántas tarjetas se ven ENTERAS sin tocar la rueda.
 *
 * Se mide sobre el `<li>` y no sobre la tarjeta: el `<li>` es la celda de la
 * cuadrícula, y es lo que se recorre. Se apunta por estructura y nunca por
 * nombre de clase — los de producción son hashes de compilación.
 */
async function avisosCompletosSobreElPliegue(
  page: import("@playwright/test").Page,
): Promise<{ completos: number; dibujadas: number; fondos: readonly number[] }> {
  return page
    .getByTestId("lista-grid")
    .locator("ol > li")
    .evaluateAll((nodes) => {
      const alto = window.innerHeight;
      const fondos = nodes.map((node) => Math.round(node.getBoundingClientRect().bottom));

      return {
        completos: fondos.filter((fondo) => fondo <= alto).length,
        dibujadas: nodes.length,
        fondos,
      };
    });
}

test.describe("14.29: los avisos completos sobre el pliegue", () => {
  test("a 360×640 entran 2 avisos completos, y la lámina 6c dibuja 4", async ({ page }) => {
    await page.setViewportSize(MOVIL);
    await page.goto("/measure/lista");

    const { completos, dibujadas, fondos } = await avisosCompletosSobreElPliegue(page);
    console.log(
      `[14.29] 360×640: ${completos} avisos completos (cota: === 2 · lámina 6c: ${LAMINA_MOVIL}) · dibujadas=${dibujadas} · fondos=${fondos}`,
    );

    // **La mitad positiva, y sin ella el número no significa nada.** Si el
    // arnés dibujara sólo dos tarjetas, «2 completos» sería el tope del
    // fixture y no una medida de la pantalla: una medición sobre una entrada
    // que el fixture nunca produce no mide nada.
    expect(dibujadas).toBeGreaterThan(LAMINA_MOVIL);
    expect(completos).toBe(2);
  });

  test("a 1280×800 entran 4 avisos completos, y la lámina 7c dibuja 8", async ({ page }) => {
    await page.setViewportSize(ESCRITORIO);
    await page.goto("/measure/lista");

    const { completos, dibujadas, fondos } = await avisosCompletosSobreElPliegue(page);
    console.log(
      `[14.29] 1280×800: ${completos} avisos completos (cota: === 4 · lámina 7c: ${LAMINA_ESCRITORIO}) · dibujadas=${dibujadas} · fondos=${fondos}`,
    );

    expect(dibujadas).toBeGreaterThan(LAMINA_ESCRITORIO);
    expect(completos).toBe(4);
  });

  /**
   * **El encabezado, que es donde está el hueco del teléfono.**
   *
   * Los 2 de arriba no son culpa de la tarjeta: la cuadrícula empieza a 373 px
   * en un teléfono, contra los ~74 que dibuja la lámina 6c —60 de barra más el
   * relleno—, porque la pantalla servida agrega miga de pan, título, conteo y
   * las fichas quitables, y ninguno de esos cuatro aparece en 6c. Las fichas
   * solas ocupan 154 px al plegarse a cuatro líneas en 360.
   *
   * Se afirma como cota superior y no como igualdad exacta: lo que decide es
   * el presupuesto que le queda a la cuadrícula, y una igualdad al píxel sobre
   * texto renderizado se rompe por una versión de fuente sin que nada del
   * producto haya cambiado. Los conteos de arriba son los que van exactos.
   */
  test("el encabezado se come 373 px del teléfono antes de la primera foto", async ({ page }) => {
    await page.setViewportSize(MOVIL);
    await page.goto("/measure/lista");

    const arranque = await page
      .getByTestId("lista-grid")
      .locator("ol")
      .evaluate((node) => Math.round(node.getBoundingClientRect().top));

    console.log(`[14.29] 360×640: la cuadrícula arranca a ${arranque}px (cota: <= 380px)`);
    expect(arranque).toBeLessThanOrEqual(380);

    // Y la parte positiva: la cuadrícula existe y arrancó debajo de la barra,
    // no encima. Una cota superior sola pasaría con la cuadrícula en 0.
    const barra = await page
      .locator("header")
      .first()
      .evaluate((node) => Math.round(node.getBoundingClientRect().bottom));
    console.log(`[14.29] 360×640: la barra termina a ${barra}px`);
    expect(arranque).toBeGreaterThan(barra);
  });
});
