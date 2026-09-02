import { expect, test } from "@playwright/test";

/**
 * **Criterio de aceptación 1, medido en vez de afirmado** (tasks.md 14.29).
 *
 * Cuántos avisos COMPLETOS entran sobre el pliegue en la pantalla principal
 * del producto. Hasta acá era una frase en el plan; acá es un número, y el
 * número contesta que **no**: entran la mitad de los que la lámina dibuja.
 *
 * **Actualizado el 2026-09-02 por la 14.53, y los conteos no se movieron.** Las
 * dos decisiones del fundador —las fichas quitables fuera del teléfono, la
 * placa del publicador encima de la portada— se llevaron 181 px del teléfono y
 * 54 del escritorio, y aun así entran los mismos 2 y 4: a la segunda fila le
 * sobran 35 px en el teléfono y 33 en el escritorio. Lo que queda es el
 * encabezado de tres líneas —miga de pan, `<h1>` y conteo— contra la única que
 * dibujan 6c y 7c, y eso es otra decisión de diseño. Está anotado en la 14.53
 * y acá se mide como `sobra`.
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
async function avisosCompletosSobreElPliegue(page: import("@playwright/test").Page): Promise<{
  completos: number;
  dibujadas: number;
  fondos: readonly number[];
  pliegue: number;
}> {
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
        pliegue: alto,
      };
    });
}

test.describe("14.29: los avisos completos sobre el pliegue", () => {
  test("a 360×640 entran 2 avisos completos, y la lámina 6c dibuja 4", async ({ page }) => {
    await page.setViewportSize(MOVIL);
    await page.goto("/measure/lista");

    const { completos, dibujadas, fondos, pliegue } = await avisosCompletosSobreElPliegue(page);
    // Lo que le sobra a la segunda fila para caber: el presupuesto que queda,
    // en píxeles, y por eso se registra y se acota en vez de contarse en una
    // tarea. La 14.53 se llevó 181 de los 243 que faltaban —154 de fichas y 27
    // de la placa por tarjeta—; esto es lo que no se llevó.
    const sobra = (fondos[3] ?? 0) - pliegue;
    console.log(
      `[14.29] 360×640: ${completos} avisos completos (cota: === 2 · lámina 6c: ${LAMINA_MOVIL}) · dibujadas=${dibujadas} · fondos=${fondos} · a la 2ª fila le sobran ${sobra}px`,
    );

    // **La mitad positiva, y sin ella el número no significa nada.** Si el
    // arnés dibujara sólo dos tarjetas, «2 completos» sería el tope del
    // fixture y no una medida de la pantalla: una medición sobre una entrada
    // que el fixture nunca produce no mide nada.
    expect(dibujadas).toBeGreaterThan(LAMINA_MOVIL);
    expect(completos).toBe(2);

    // Y el porqué del 2, como número: la segunda fila termina PASADO el
    // pliegue, y por poco. Las dos cotas juntas — sigue sin entrar, y lo que
    // falta cabe en 40 px — son las que un cambio futuro va a mover.
    expect(sobra).toBeGreaterThan(0);
    expect(sobra).toBeLessThanOrEqual(40);
  });

  test("a 1280×800 entran 4 avisos completos, y la lámina 7c dibuja 8", async ({ page }) => {
    await page.setViewportSize(ESCRITORIO);
    await page.goto("/measure/lista");

    const { completos, dibujadas, fondos, pliegue } = await avisosCompletosSobreElPliegue(page);
    // Lo mismo que en el teléfono: la fila de escritorio son cuatro tarjetas,
    // así que la segunda empieza en la quinta celda.
    const sobra = (fondos[4] ?? 0) - pliegue;
    console.log(
      `[14.29] 1280×800: ${completos} avisos completos (cota: === 4 · lámina 7c: ${LAMINA_ESCRITORIO}) · dibujadas=${dibujadas} · fondos=${fondos} · a la 2ª fila le sobran ${sobra}px`,
    );

    expect(dibujadas).toBeGreaterThan(LAMINA_ESCRITORIO);
    expect(completos).toBe(4);

    expect(sobra).toBeGreaterThan(0);
    expect(sobra).toBeLessThanOrEqual(40);
  });

  /**
   * **El encabezado, que es donde está el hueco del teléfono.**
   *
   * Los 2 de arriba no son culpa de la tarjeta: la cuadrícula empieza a **219
   * px** en un teléfono, contra los ~74 que dibuja la lámina 6c —60 de barra
   * más el relleno—, porque la pantalla servida agrega miga de pan, título y
   * conteo, y ninguno de los tres aparece en 6c.
   *
   * **Eran 373 hasta la 14.53**, y los 154 que faltan son las fichas quitables
   * al irse del teléfono. Lo que queda por encima de la lámina son esos tres
   * bloques: la miga de pan es de la 14.41 —cubre la salida que la
   * `SearchSummaryBar` dejó al borrarse— y sacarla reabre esa puerta, así que
   * es otra decisión y no se toma midiendo.
   *
   * Se afirma como cota superior y no como igualdad exacta: lo que decide es
   * el presupuesto que le queda a la cuadrícula, y una igualdad al píxel sobre
   * texto renderizado se rompe por una versión de fuente sin que nada del
   * producto haya cambiado. Los conteos de arriba son los que van exactos.
   */
  test("el encabezado se come 219 px del teléfono antes de la primera foto", async ({ page }) => {
    await page.setViewportSize(MOVIL);
    await page.goto("/measure/lista");

    const arranque = await page
      .getByTestId("lista-grid")
      .locator("ol")
      .evaluate((node) => Math.round(node.getBoundingClientRect().top));

    console.log(`[14.29] 360×640: la cuadrícula arranca a ${arranque}px (cota: <= 225px)`);
    expect(arranque).toBeLessThanOrEqual(225);

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

/**
 * **Las fichas quitables se van del teléfono** (14.53, decisión del fundador
 * del 2026-09-02: *«sí quítalos, ocupan mucho espacio»*).
 *
 * Acá se mide lo DIBUJADO a los dos anchos, que es lo que la hoja no puede
 * afirmar sola. `FilterChips.test.tsx` fija lo declarado.
 *
 * **Sobre el conjunto de filtros que se mide**: el arnés arma el panel con
 * `buildSearchPanel` y las cinco fichas de la lámina 7c — dos zonas, precio,
 * habitaciones y quién publica—, que es un conjunto que un visitante produce
 * caminando la pantalla. Medir con un conjunto inventado mediría otra cosa.
 */
test.describe("14.53: las fichas quitables y el ancho de la pantalla", () => {
  test("a 360 no se dibujan, y el número de filtros lo dice la pastilla", async ({ page }) => {
    await page.setViewportSize(MOVIL);
    await page.goto("/measure/lista");

    const fichas = page.getByTestId("filter-chips");
    await expect(fichas).toBeHidden();

    // **Ni una parada invisible al tabular.** `display: none` saca al enlace
    // del orden de tabulación y del árbol de accesibilidad; si alguien lo
    // resolviera con `visibility` o un `clip`, esto lo diría.
    const alcanzables = await fichas
      .locator("a")
      .evaluateAll(
        (nodos) => nodos.filter((nodo) => (nodo as HTMLElement).offsetParent !== null).length,
      );
    console.log(`[14.53] 360×640: enlaces de ficha alcanzables=${alcanzables}`);
    expect(alcanzables).toBe(0);

    // **Lo que queda en su lugar, y es lo único que le dice al visitante que
    // hay filtros puestos** (14.31: "en móvil el filtro de la pastilla pierde
    // la palabra, nunca el número"). Sin esta mitad, quitar las fichas deja la
    // pantalla sin decir que está filtrando.
    const conteo = page.getByTestId("pill-filter-count");
    await expect(conteo).toBeVisible();
    const numero = Number.parseInt((await conteo.innerText()).trim(), 10);
    console.log(`[14.53] 360×640: la pastilla dice ${numero} filtros`);
    expect(numero).toBeGreaterThan(0);
  });

  /**
   * **La mitad positiva.** Sin ella, la prueba de arriba pasa igual de bien con
   * las fichas borradas de todas las pantallas — que es exactamente lo que la
   * decisión NO dice: en escritorio entran en un renglón y no cuestan nada.
   */
  test("a 1280 siguen dibujadas, con sus cinco fichas y su «Limpiar todo»", async ({ page }) => {
    await page.setViewportSize(ESCRITORIO);
    await page.goto("/measure/lista");

    const fichas = page.getByTestId("filter-chips");
    await expect(fichas).toBeVisible();

    const alto = await fichas.evaluate((nodo) => Math.round(nodo.getBoundingClientRect().height));
    const enlaces = await fichas.locator("a").count();
    console.log(`[14.53] 1280×800: fichas visibles, alto=${alto}px, enlaces=${enlaces}`);

    // Cinco «×» más «Limpiar todo».
    expect(enlaces).toBe(6);
    expect(alto).toBeGreaterThan(0);
  });
});
