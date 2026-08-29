import { expect, test } from "@playwright/test";

/**
 * **La ficha, medida y no declarada** (tasks.md 16.23, 16.25, 16.29).
 *
 * Este bloque existe por un defecto que este repositorio ya cometió y dejó
 * escrito en `src/styles/tokens.css`: sin un token de título de página, el
 * `<h1>` del inicio agarró `--fpb` («precio en ficha»), y `lint:tokens` pasó
 * — verifica que un valor SEA una propiedad personalizada, nunca que sea la
 * CORRECTA. **Un token faltante no produce un gate en rojo; produce una
 * respuesta plausible y equivocada.**
 *
 * Contra eso, una aserción sobre el contenido de la hoja no sirve: `.price`
 * apuntando a `--fpb` (26) en vez de a `--ficha-price-fs` (30) deja verde
 * cualquier `expect(css).toContain("var(--")`. (`--fpb` salió del conjunto que
 * ship*a* en la 16.37; el agujero del gate no se fue con él.) Lo único que distingue un
 * token del token de al lado es **el número dibujado**, y eso se lee del
 * navegador. Por eso estas medidas viven acá y no en un `*.test.tsx`.
 *
 * `getComputedStyle` y no `boundingBox` para la tipografía: el alto de una
 * caja de texto depende del interlineado y del salto de línea, mientras que
 * `font-size` resuelto es exactamente el valor que el token entregó.
 */

/** El tamaño de tipografía resuelto de un elemento, en px, tal como pinta. */
async function typography(page: import("@playwright/test").Page, testid: string) {
  return page.evaluate((id) => {
    const node = document.querySelector(`[data-testid="${id}"]`);
    if (!node) throw new Error(`no se encontró [data-testid="${id}"]`);
    const style = getComputedStyle(node);
    return {
      fontSize: style.fontSize,
      fontWeight: style.fontWeight,
      lineHeight: style.lineHeight,
    };
  }, testid);
}

test.describe("la ficha: tipografía dibujada (16.23)", () => {
  test("16.23: a 360 el precio pinta 30/700 y el título 17/600", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 900 });
    await page.goto("/measure");

    const price = await typography(page, "ficha-price");
    const title = await typography(page, "ficha-title");

    console.log(`[16.23] 360px precio=${JSON.stringify(price)} título=${JSON.stringify(title)}`);

    // 30 y no 28: la lámina móvil dibuja 30 (ver la corrección anotada en
    // tasks.md 16.23). Y no 26, que es `--fpb` — el token que se le parece.
    expect(price.fontSize).toBe("30px");
    expect(price.fontWeight).toBe("700");
    expect(title.fontSize).toBe("17px");
    expect(title.fontWeight).toBe("600");
    // **Regla transversal 2, dibujada**: el precio pesa más que el título. Sin
    // esta comparación, dos tokens intercambiados dejarían las dos aserciones
    // de arriba en rojo pero no diría nada sobre la jerarquía en sí.
    expect(Number.parseFloat(price.fontSize)).toBeGreaterThan(Number.parseFloat(title.fontSize));
  });

  test("16.23: a 1280 el precio sube a 34 y el título a 19 — hay paso de escritorio", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.goto("/measure");

    const price = await typography(page, "ficha-price");
    const title = await typography(page, "ficha-title");

    console.log(`[16.23] 1280px precio=${JSON.stringify(price)} título=${JSON.stringify(title)}`);

    expect(price.fontSize).toBe("34px");
    expect(title.fontSize).toBe("19px");
    // Y crecieron de verdad: una hoja sin `@media` dejaría los dos en el valor
    // del teléfono y las dos aserciones de arriba lo verían, pero una que
    // subiera sólo el precio no. El diseño da DOS pasos, no uno.
    expect(Number.parseFloat(price.fontSize)).toBeGreaterThan(Number.parseFloat(title.fontSize));
  });

  test("16.23: a 360 la descripción pinta 15px con interlineado 1.6", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 1000 });
    await page.goto("/measure");

    const text = await typography(page, "ficha-description");
    console.log(`[16.23] 360px descripción=${JSON.stringify(text)}`);

    expect(text.fontSize).toBe("15px");
    // 1.6 × 15 = 24. El navegador resuelve el interlineado a px, así que el
    // número es comparable y no una razón declarada.
    expect(text.lineHeight).toBe("24px");
  });

  /**
   * **16.38 — el par del cuerpo tiene paso de escritorio** (fundador,
   * 2026-08-29, salida A).
   *
   * Este `it` anclaba 15/24 en los DOS anchos, y eso era exactamente lo que la
   * lámina de escritorio de la ficha contradice: dibuja
   * `font-size:16px;line-height:1.65`. La tabla de §8 escribe 15/1.6 para las
   * dos pantallas; manda la lámina (AGENTS.md §2), y el fundador eligió que el
   * par crezca para TODAS las pantallas que lo comparten, no sólo para la
   * ficha.
   *
   * **1.65 × 16 = 26.4**, y el navegador lo resuelve a px: el interlineado se
   * verifica como número dibujado y no como razón declarada. Sin esta segunda
   * mitad, una hoja que subiera el tamaño y se olvidara del interlineado
   * quedaría verde con el texto apretado.
   */
  test("16.38: a 1280 la descripción sube a 16px con interlineado 1.65 — el par tiene paso de escritorio", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.goto("/measure");

    const text = await typography(page, "ficha-description");
    console.log(`[16.38] 1280px descripción=${JSON.stringify(text)}`);

    expect(text.fontSize).toBe("16px");
    expect(text.lineHeight).toBe("26.4px");
  });

  /**
   * **La decisión es de OCHO pantallas, no de una** (16.38).
   *
   * Medir sólo la ficha dejaría siete hojas creciendo sin que nada lo vea: se
   * podría revertir `publish-steps.module.css` entero y la suite seguiría en
   * verde, que es exactamente el agujero que la trampa 4 de tasks.md describe.
   * Publicar es la que más lo comparte —nueve de las veinte declaraciones— así
   * que es la segunda que se mide, y con el componente REAL que sirve
   * `/publicar/paso/[paso]`, no con una copia del arnés.
   */
  test("16.38: a 1280 el cuerpo de publicar sube igual que el de la ficha — el paso es de las ocho", async ({
    page,
  }) => {
    const ayuda = "Un estudio cuenta como 1 habitación";

    await page.setViewportSize({ width: 360, height: 1200 });
    await page.goto("/measure");
    const movil = await page
      .getByTestId("publish-step-tamano")
      .getByText(ayuda, { exact: false })
      .evaluate((node) => {
        const style = getComputedStyle(node);
        return { fontSize: style.fontSize, lineHeight: style.lineHeight };
      });
    console.log(`[16.38] 360px ayuda de publicar=${JSON.stringify(movil)}`);
    expect(movil.fontSize).toBe("15px");
    expect(movil.lineHeight).toBe("24px");

    await page.setViewportSize({ width: 1280, height: 1200 });
    await page.goto("/measure");
    const escritorio = await page
      .getByTestId("publish-step-tamano")
      .getByText(ayuda, { exact: false })
      .evaluate((node) => {
        const style = getComputedStyle(node);
        return { fontSize: style.fontSize, lineHeight: style.lineHeight };
      });
    console.log(`[16.38] 1280px ayuda de publicar=${JSON.stringify(escritorio)}`);
    expect(escritorio.fontSize).toBe("16px");
    expect(escritorio.lineHeight).toBe("26.4px");
  });
});

test.describe("la ficha: el botón de acción (16.25)", () => {
  test("16.25: el botón mide 46px de alto en las dos pantallas — ni 44 ni 36", async ({ page }) => {
    for (const width of [360, 1280]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto("/measure");

      const box = await page
        .getByTestId("contact-block")
        .locator('form button[type="submit"]')
        .boundingBox();
      if (!box) throw new Error("el botón de acción no dibujó una caja medible");

      console.log(`[16.25] ${width}px alto del botón de acción: ${box.height}px (cota: === 46)`);
      // Exactamente 46, no «al menos 44». Una cota inferior aceptaría las dos
      // respuestas posibles —`--target-min` (44) y `--action-h` (46)— y una
      // aserción que acepta las dos respuestas válidas no está preguntando
      // nada. El diseño fija 46 para móvil Y escritorio, así que el token
      // propio es lo que se verifica: atarlo a `--target-min` lo bajaría a 36
      // en escritorio.
      expect(box.height).toBe(46);
    }
  });
});

test.describe("la ficha: la columna de contacto son 420 y no 328 (16.29)", () => {
  test("16.29: a 1280 la columna derecha dibuja 420px dentro del contenedor de 1100", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 1200 });
    await page.goto("/measure");

    const media = await page.getByTestId("ficha-media").boundingBox();
    const contact = await page.getByTestId("contact-block").boundingBox();
    if (!media || !contact) throw new Error("las dos columnas no dibujaron cajas medibles");

    const span = Math.round(contact.x + contact.width - media.x);
    console.log(
      `[16.29] media=${media.width}px contacto=${contact.width}px separación=${Math.round(contact.x - (media.x + media.width))}px total=${span}px`,
    );

    // La especificación §8 dice «Columna de contacto: 328px, pegada» y §3 da
    // `640px 1fr; gap:40px` dentro de 1100, que computa 420. La lámina de
    // escritorio no dibuja NINGÚN bloque de 328 en esa columna: 328 es el
    // ancho de la foto móvil (360 − 16 − 16). Acá se mide, no se elige.
    expect(Math.round(media.width)).toBe(640);
    expect(Math.round(contact.width)).toBe(420);
    expect(Math.round(contact.x - (media.x + media.width))).toBe(40);
    expect(span).toBe(1100);
  });

  test("16.29: a 360 la columna de contacto ocupa el ancho útil y no 420", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 1200 });
    await page.goto("/measure");

    const contact = await page.getByTestId("contact-block").boundingBox();
    if (!contact) throw new Error("el bloque de contacto no dibujó una caja medible");

    console.log(`[16.29] 360px ancho del contacto: ${contact.width}px (cota: <= 328)`);
    // «Ancho completo» en la tabla de medidas: 360 menos los 16 de margen a
    // cada lado. Sin esto, una columna fija de 420 se desbordaría de costado en
    // un teléfono y las medidas de escritorio seguirían en verde.
    expect(contact.width).toBeLessThanOrEqual(328);
    expect(contact.width).toBeGreaterThan(280);
  });
});
