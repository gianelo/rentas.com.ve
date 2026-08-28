import { expect, test } from "@playwright/test";

/**
 * Real-layout proof for tasks.md 1b.10–1b.12, 1b.14 — the four claims a
 * stylesheet-content assertion cannot honestly prove. Reads genuine
 * rendered geometry (`getBoundingClientRect`, `scrollWidth` vs
 * `clientWidth`) from app/measure, served by playwright.measure.config.ts's
 * own local Next.js dev server. Every assertion logs the measured number so
 * a failure reads as a real value against a real bound, not a bare
 * pass/fail.
 */
test.describe("layout measurement", () => {
  test("1b.10: result row height stays within 96px at 360px, including a wrapped two-line title", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto("/measure");

    const box = await page
      .getByTestId("row-slot-long")
      .locator('[data-testid="result-row"]')
      .boundingBox();
    if (!box) throw new Error("result row did not render a measurable box");

    console.log(`[1b.10] measured row height at 360px: ${box.height}px (bound: <= 96px)`);
    expect(box.height).toBeLessThanOrEqual(96);
  });

  test("1b.11: no horizontal overflow at a 360px viewport", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto("/measure");

    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));

    console.log(
      `[1b.11] scrollWidth=${scrollWidth}px clientWidth=${clientWidth}px (bound: scrollWidth <= clientWidth)`,
    );
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });

  test("1b.12: at 1280px, result rows stay within the 1100px container and body copy is capped at 520px", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/measure");

    const rowBox = await page
      .getByTestId("row-slot-normal")
      .locator('[data-testid="result-row"]')
      .boundingBox();
    if (!rowBox) throw new Error("result row did not render a measurable box");
    console.log(`[1b.12] measured row width at 1280px: ${rowBox.width}px (bound: <= 1100px)`);
    expect(rowBox.width).toBeLessThanOrEqual(1100);

    const bodyBox = await page.getByTestId("body-copy").boundingBox();
    if (!bodyBox) throw new Error("body copy did not render a measurable box");
    console.log(`[1b.12] measured body-copy width at 1280px: ${bodyBox.width}px (bound: <= 520px)`);
    expect(bodyBox.width).toBeLessThanOrEqual(520);
  });

  /**
   * **`toBe(44)` y no `toBeGreaterThanOrEqual(44)`, y ésa es toda la lección de
   * la 16.24.** Esta prueba afirmaba `>= 36` en escritorio mientras el fundador
   * decidía entre 36, 40 y 44: las tres respuestas posibles pasaban la
   * aserción, así que la suite de medición habría dejado entrar cualquiera de
   * ellas en silencio. Una cota inferior que acepta todas las respuestas
   * válidas no está preguntando nada — el mismo defecto que la 16.25 acababa de
   * encontrar en `--action-h`. Con la decisión tomada (44 en las dos pantallas,
   * WCAG 2.2 SC 2.5.5 AAA) el número se fija, y mover el token pone esto rojo
   * diciendo qué midió.
   */
  test("1b.14/16.24: interactive targets measure exactly 44px on mobile and on desktop", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto("/measure");

    for (const testid of ["btn-action", "btn-selection", "btn-neutral"]) {
      const box = await page.getByTestId(testid).locator("button").boundingBox();
      if (!box) throw new Error(`${testid} did not render a measurable box`);
      const smallest = Math.min(box.width, box.height);
      console.log(`[1b.14] mobile ${testid}: smallest dimension ${smallest}px (bound: === 44px)`);
      expect(smallest).toBe(44);
    }

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/measure");

    for (const testid of ["btn-action", "btn-selection", "btn-neutral"]) {
      const box = await page.getByTestId(testid).locator("button").boundingBox();
      if (!box) throw new Error(`${testid} did not render a measurable box`);
      const smallest = Math.min(box.width, box.height);
      console.log(`[1b.14] desktop ${testid}: smallest dimension ${smallest}px (bound: === 44px)`);
      expect(smallest).toBe(44);
    }
  });
});

/**
 * Los nueve pasos, medidos sobre la pantalla que se sirve (3.9).
 *
 * Estas pruebas existen porque el formulario de publicar llegó a producción con
 * once pruebas en verde y nueve diferencias de maquetación: todas leían markup
 * y ninguna podía ver dónde estaba nada.
 *
 * **Y volvieron a existir por la misma razón, un nivel más arriba.** Cuando el
 * formulario de una sola pantalla se retiró en favor de nueve pasos, el arnés
 * quedó dibujando un formulario de ejemplo escrito a mano: `#cityId`, `#zoneId`
 * y `#title` ya no existían en ninguna parte del producto, así que estas
 * medidas o fallaban o medían una pantalla que nadie iba a ver nunca. Ahora
 * `app/measure` monta el `PublishStep` real, el mismo que sirve
 * `/publicar/paso/[paso]`, con el borrador y el riel entrando por props.
 *
 * Se miden dos de los nueve, que son los dos que pueden romperse por geometría:
 * el paso 4, único con cuatro controles, y el paso 2, donde la fila de búsqueda
 * y la lista de resultados reemplazaron al par ciudad/zona.
 */
test.describe("paso 4 — los cuatro números (3.9)", () => {
  test("3.9: la columna del paso no pasa de 520px a 1280px", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.goto("/measure");

    const column = await page.getByTestId("publish-step-tamano").locator("main").boundingBox();
    if (!column) throw new Error("la columna del paso no dibujó una caja medible");

    console.log(`[3.9] ancho de columna a 1280px: ${column.width}px (cota: <= 520px)`);
    // 520 y no 600: los nueve pasos tienen su propia composición, con riel de
    // 240px al lado. Una columna ancha pierde la relación entre etiqueta y
    // campo (D14), y por eso es una cota y no una preferencia.
    expect(column.width).toBeLessThanOrEqual(520);
  });

  test("3.9: el riel de nueve pasos ocupa 240px a la izquierda de la columna", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.goto("/measure");

    const step = page.getByTestId("publish-step-tamano");
    // La LISTA y no el `<nav>` que la envuelve: el nav es la celda de 240px de
    // la grilla y sigue midiendo 240 aunque el riel esté oculto. Ocultarlo es
    // justamente la forma en que esta pantalla pierde lo que la hace soportable
    // en escritorio, así que es lo que hay que medir.
    const rail = await step.locator('nav[aria-label="Progreso"] ol').boundingBox();
    const column = await step.locator("main").boundingBox();
    if (!rail || !column) throw new Error("riel/columna no dibujaron una caja medible");

    const steps = await step.locator('nav[aria-label="Progreso"] ol li').count();
    console.log(
      `[3.9] riel x=${rail.x} ancho=${rail.width} · ${steps} pasos · columna x=${column.x}`,
    );
    // El riel es lo que en 1280 reemplaza a la barra de 3px: se ven los nueve y
    // se puede volver a cualquiera con un clic. Es la diferencia entre saber
    // cuánto falta y poder hacer algo al respecto.
    expect(steps).toBe(9);
    expect(rail.width).toBeLessThanOrEqual(240);
    expect(column.x).toBeGreaterThan(rail.x + rail.width - 1);
  });

  test("3.9: los cuatro números caben en la columna a 360px", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 900 });
    await page.goto("/measure");

    const overflow = await page
      .getByTestId("publish-step-tamano")
      .locator("main")
      .evaluate((node) => ({ scrollWidth: node.scrollWidth, clientWidth: node.clientWidth }));

    console.log(
      `[3.9] paso 4 a 360px: scrollWidth=${overflow.scrollWidth} clientWidth=${overflow.clientWidth}`,
    );
    // Etiqueta y control de 120px en la misma fila, cuatro veces: es la forma
    // más probable de que esta pantalla se desborde de costado, y una columna
    // que se va de lado es una que nadie termina de llenar.
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
  });

  test("3.9: cada uno de los cuatro campos es un objetivo real de 44px a 360px", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 900 });
    await page.goto("/measure");

    for (const selector of ["#rooms", "#bathrooms", "#parkingSpots", "#areaM2"]) {
      const box = await page.locator(selector).boundingBox();
      if (!box) throw new Error(`${selector} no dibujó una caja medible`);
      console.log(`[3.9] móvil ${selector}: alto ${box.height}px (cota: >= 44px)`);
      // Declarado en CSS no es lo mismo que dibujado: un padre flex, un reset
      // que compite o una abreviatura más abajo en la cascada lo encogen en
      // silencio, y nadie se entera hasta que un pulgar falla.
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
  });

  test("3.9: el botón principal también es un objetivo de 44px a 360px", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 900 });
    await page.goto("/measure");

    const box = await page
      .getByTestId("publish-step-tamano")
      .locator('button[type="submit"]')
      .boundingBox();
    if (!box) throw new Error("el botón principal no dibujó una caja medible");

    console.log(`[3.9] móvil botón principal: alto ${box.height}px (cota: >= 44px)`);
    // Es el único camino hacia adelante en una pantalla de una sola pregunta.
    expect(box.height).toBeGreaterThanOrEqual(44);
  });

  test("3.9: la pregunta y las etiquetas comparten el borde izquierdo", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.goto("/measure");

    const step = page.getByTestId("publish-step-tamano");
    const title = await step.locator("h1").boundingBox();
    const label = await step.locator('label[for="rooms"]').boundingBox();
    if (!title || !label) throw new Error("título/etiqueta no dibujaron una caja medible");

    console.log(`[3.9] title.x=${title.x} label.x=${label.x} (cota: mismo borde)`);
    // Contra la ETIQUETA y no contra el campo: en el paso 4 la etiqueta va a la
    // izquierda y el número a la derecha, así que apuntar al `<input>` mediría
    // el borde contrario y llamaría defecto a lo que el diseño pide. Una
    // pantalla cuyo encabezado y contenido no se alinean se lee como dos
    // pantallas apiladas.
    expect(Math.abs(title.x - label.x)).toBeLessThanOrEqual(20);
  });

  test("3.9: los cuatro números quedan alineados contra el borde derecho", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.goto("/measure");

    const step = page.getByTestId("publish-step-tamano");
    const column = await step.locator("main").boundingBox();
    if (!column) throw new Error("la columna no dibujó una caja medible");

    const rights: number[] = [];
    for (const selector of ["#rooms", "#bathrooms", "#parkingSpots", "#areaM2"]) {
      const box = await page.locator(selector).boundingBox();
      if (!box) throw new Error(`${selector} no dibujó una caja medible`);
      rights.push(Math.round(box.x + box.width));
    }

    const columnRight = Math.round(column.x + column.width);
    console.log(
      `[3.9] bordes derechos: ${JSON.stringify(rights)} · columna termina en ${columnRight}`,
    );
    // Los cuatro números forman una columna que se lee de un vistazo. Si uno se
    // corriera —porque su etiqueta es más larga, o porque una fila dejó de ser
    // `space-between`— dejarían de compararse entre sí, que es para lo que
    // están puestos uno debajo del otro.
    expect(new Set(rights).size).toBe(1);
    expect(Math.abs(Math.max(...rights) - columnRight)).toBeLessThanOrEqual(2);
  });
});

/**
 * El paso 2, que es lo que reemplazó al par ciudad/zona (3.9).
 *
 * Las dos pruebas que vivían acá medían un `<select>` de ciudad que recargaba
 * la página para ofrecer las zonas de esa ciudad. **Ese control ya no existe, y
 * su ausencia es una decisión, no una omisión**: la ciudad se deriva de la zona
 * elegida (criterio de aceptación 7), así que preguntarla por separado traía de
 * vuelta el caso borde de cambiar la ciudad después de la zona. Lo que hay en
 * su lugar es una caja de búsqueda y una lista cerrada de resultados, y eso es
 * lo que corresponde medir.
 */
test.describe("paso 2 — elegir la zona (3.9)", () => {
  test("3.9: la caja de búsqueda y su botón van en una fila a 360px", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 900 });
    await page.goto("/measure");

    const step = page.getByTestId("publish-step-zona");
    const input = await page.locator("#q").boundingBox();
    const button = await step.locator('form[method="get"] button').boundingBox();
    if (!input || !button) throw new Error("buscador/botón no dibujaron una caja medible");

    console.log(`[3.9] 360px buscador y=${input.y} botón y=${button.y} (cota: misma fila)`);
    // Apilados, el botón queda debajo del pliegue en un teléfono y la búsqueda
    // parece no tener con qué dispararse.
    expect(Math.abs(input.y - button.y)).toBeLessThanOrEqual(1);
    expect(button.x).toBeGreaterThan(input.x);
  });

  test("3.9: la ciudad no se pregunta en ninguna parte del paso", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 900 });
    await page.goto("/measure");

    const cityControls = await page.getByTestId("publish-step-zona").locator("#cityId").count();

    console.log(`[3.9] controles de ciudad en el paso 2: ${cityControls} (cota: 0)`);
    // La ciudad la determina la zona. Un control propio para la ciudad es el
    // camino de vuelta al caso que la especificación da por resuelto —
    // cambiarla después de haber elegido la zona— y por eso su ausencia se
    // verifica en vez de darse por sentada.
    expect(cityControls).toBe(0);
  });

  test("3.9: cada resultado de zona es un objetivo real de 44px a 360px", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 900 });
    await page.goto("/measure");

    const results = page.getByTestId("publish-step-zona").locator("ul li label");
    const count = await results.count();
    expect(count).toBeGreaterThan(0);

    for (let index = 0; index < count; index += 1) {
      const box = await results.nth(index).boundingBox();
      if (!box) throw new Error(`el resultado ${index} no dibujó una caja medible`);
      console.log(`[3.9] móvil resultado ${index}: alto ${box.height}px (cota: >= 44px)`);
      // La pastilla lleva el nombre y debajo el municipio y la ciudad: es lo
      // único que separa dos zonas homónimas, y se toca de pie con una mano.
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
  });

  test("3.9: el paso 2 no se desborda de costado a 360px", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 900 });
    await page.goto("/measure");

    const overflow = await page
      .getByTestId("publish-step-zona")
      .locator("main")
      .evaluate((node) => ({ scrollWidth: node.scrollWidth, clientWidth: node.clientWidth }));

    console.log(
      `[3.9] paso 2 a 360px: scrollWidth=${overflow.scrollWidth} clientWidth=${overflow.clientWidth}`,
    );
    // El renglón de alcance —"Municipio Chacao · Distrito Capital"— es texto
    // largo dentro de una pastilla, y es lo que más fácilmente empuja la
    // columna hacia afuera.
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
  });
});

/**
 * Artboard 2a's two metadata sentences (5.7). The city and the age are in the
 * DOM at every width — a crawler with no viewport should read the fuller one
 * — and only 1280 shows them. Markup tests cannot tell those apart; this can.
 */
test.describe("result row metadata (5.7)", () => {
  test("5.7: the phone row hides city and age", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 900 });
    await page.goto("/measure");

    const meta = page.getByTestId("result-row").first().locator("p");
    const visible = await meta.innerText();
    const inDom = await meta.innerHTML();

    console.log(`[5.7] 360px visible: ${JSON.stringify(visible)}`);
    // Present, and not shown. Removing it from the DOM instead would cost the
    // indexable sentence D11 wants.
    expect(inDom).toContain("Distrito Capital");
    expect(visible).not.toContain("Distrito Capital");
    expect(visible).not.toContain("hace 2 días");
  });

  test("5.7: at 1280 the same row reads the fuller sentence", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/measure");

    const visible = await page.getByTestId("result-row").first().locator("p").innerText();

    console.log(`[5.7] 1280px visible: ${JSON.stringify(visible)}`);
    expect(visible).toContain("Distrito Capital");
    expect(visible).toContain("hace 2 días");
  });
});

/**
 * Artboard 2a's filters (5.7). The city and rooms controls are the ones a
 * thumb has to hit on a phone and a pointer at 1280, and the design gives
 * each width a different minimum. Markup cannot tell those apart.
 */
test.describe("search filters (5.7)", () => {
  test("5.7: every filter control is a real 44px target at 360px", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 1200 });
    await page.goto("/measure");

    const boxes = await page
      .getByTestId("search-filters-harness")
      .locator("span, select, input[type='text']")
      .filter({ hasNot: page.locator("script") })
      .evaluateAll((nodes) =>
        nodes
          .map((n) => n.getBoundingClientRect())
          .filter((r) => r.width > 0 && r.height > 0)
          .map((r) => Math.round(r.height)),
      );

    const controls = boxes.filter((h) => h >= 20);
    console.log(`[5.7] 360px filter control heights: ${JSON.stringify(controls)}`);
    // Declared in CSS is not rendered: a flex parent or a later shorthand can
    // shrink these silently, and nobody notices until a thumb misses.
    expect(Math.min(...controls)).toBeGreaterThanOrEqual(44);
  });

  test("5.7: the filter column never overflows a 360px screen", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 1200 });
    await page.goto("/measure");

    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));

    console.log(
      `[5.7] 360px scrollWidth=${overflow.scrollWidth} clientWidth=${overflow.clientWidth}`,
    );
    // Four room chips and two price inputs in a row is the likeliest way this
    // breaks, and a sideways-scrolling filter panel is one nobody finishes.
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
  });
});

/**
 * **El nav, medido y no leído** (14.41).
 *
 * Este bloque existe por un defecto concreto: los tres slots de escritorio se
 * colocan por `order`, y los valores declarados —marca 1, acciones 2, pastilla
 * 3— son los del teléfono, donde la pastilla baja a su propio renglón. En la
 * grilla de 1280 esos mismos valores dejaban **la pastilla en la columna
 * derecha de 250 px y las acciones en el centro flexible**, o sea el
 * encabezado al revés de como lo dibujan las láminas 14a y 7b/7c.
 *
 * La prueba que había afirmaba `grid-template-columns: 250px 1fr 250px`, que
 * era cierto y no decía nada sobre qué cae en cada columna — un gate que no
 * afirma nada sobre lo que tenía que proteger. Lo que hay que verificar es
 * geometría renderizada, y para eso existe este arnés (1b.10).
 */
test.describe("la barra del producto (14a, 14.41)", () => {
  /**
   * El centro de un elemento y el de la barra que lo contiene, para
   * compararlos. `text` desambigua cuando el selector casa más de uno — no se
   * usa `:has-text()` porque ése es un selector de Playwright y acá se corre
   * `querySelector` del navegador, que no lo conoce.
   */
  async function centres(
    page: import("@playwright/test").Page,
    testid: string,
    child: string,
    text?: string,
  ) {
    return page.evaluate(
      ([id, sel, needle]) => {
        const host = document.querySelector(`[data-testid="${id}"]`);
        const inner = host?.querySelector("header > div");
        const all = [...(inner?.querySelectorAll(sel as string) ?? [])];
        const target = needle ? all.find((el) => el.textContent?.includes(needle)) : all[0];
        if (!inner || !target) throw new Error(`no se encontró ${id} > ${sel} ${needle ?? ""}`);
        const a = inner.getBoundingClientRect();
        const b = target.getBoundingClientRect();
        return {
          barCentre: Math.round(a.left + a.width / 2),
          barRight: Math.round(a.right),
          centre: Math.round(b.left + b.width / 2),
          left: Math.round(b.left),
          right: Math.round(b.right),
          visible: b.width > 0 && b.height > 0,
        };
      },
      [testid, child, text] as const,
    );
  }

  test("14a: a 1280 la pastilla va en el centro y las acciones contra el borde", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/measure");

    const pill = await centres(page, "nav-harness-busqueda", "search");
    const actions = await centres(page, "nav-harness-busqueda", "a[href='/publicar']");

    console.log(`[14a] centro de la barra ${pill.barCentre}, centro de la pastilla ${pill.centre}`);
    // El centro real, no "está en alguna columna": la lámina la dibuja
    // centrada, y con los `order` del teléfono caía en la columna derecha.
    expect(Math.abs(pill.centre - pill.barCentre)).toBeLessThanOrEqual(4);
    // Y las acciones quedan a la derecha DE la pastilla, no en su lugar.
    expect(actions.left).toBeGreaterThan(pill.right);
  });

  test("11: en la ficha a 1280 la marca no cede, se corre al centro", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/measure");

    const back = await centres(page, "nav-harness-ficha", "a", "← Resultados");
    const brand = await centres(page, "nav-harness-ficha", "a", "rentas.");

    console.log(`[11] ← en ${back.left}, marca centrada en ${brand.centre} de ${brand.barCentre}`);
    expect(back.visible).toBe(true);
    expect(brand.visible).toBe(true);
    // Los tres hijos de la lámina 11, en orden: ← Resultados · rentas · Publicar.
    expect(back.right).toBeLessThan(brand.left);
    expect(Math.abs(brand.centre - brand.barCentre)).toBeLessThanOrEqual(4);
  });

  test("10: en la ficha a 360 la marca no se dibuja — el ← le tomó el lugar", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 900 });
    await page.goto("/measure");

    const back = await centres(page, "nav-harness-ficha", "a", "← Resultados");
    const brand = await centres(page, "nav-harness-ficha", "a", "rentas.");

    expect(back.visible).toBe(true);
    // A 360 px no caben tres, y la lámina 10 dibuja dos. Declarado en la hoja
    // no es renderizado: esto lo mide.
    expect(brand.visible).toBe(false);
  });
});

/**
 * **El panel de filtros, medido y no leído** (14.32, 14.33).
 *
 * Este bloque existe por el mismo defecto que el del nav, un nivel más arriba.
 * `SearchPanel.module.css` afirmaba abrir los cuatro grupos en escritorio con
 * `::details-content` — una declaración cierta en la hoja y **silenciosa sobre
 * lo que se dibuja**: en un navegador que no lo entiende, 1280 seguía dibujando
 * el acordeón del teléfono y ninguna prueba se ponía roja. Lo que hay que
 * verificar es cuántos cuerpos de grupo se dibujan a cada ancho.
 *
 * «Visible» se mide como caja real (`getBoundingClientRect`) y no como clase o
 * como `display` declarado: eso es exactamente lo que la prueba de
 * `grid-template-columns` demostró que no alcanza.
 */
test.describe("el panel de filtros a los dos anchos (14.32)", () => {
  /** Cuántos cuerpos de grupo dibujan una caja de verdad. */
  async function openBodies(page: import("@playwright/test").Page) {
    return page.evaluate(() => {
      const host = document.querySelector('[data-testid="search-panel-harness"]');
      const groups = [...(host?.querySelectorAll("section[id^='filtros-']") ?? [])];
      return groups.map((group) => {
        const body = group.lastElementChild as HTMLElement | null;
        const box = body?.getBoundingClientRect();
        return {
          id: group.id,
          visible: Boolean(box && box.width > 0 && box.height > 0),
        };
      });
    });
  }

  test("14.32: a 1280 los cuatro grupos se ven a la vez — no hay secuencia", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1200 });
    await page.goto("/measure");

    const bodies = await openBodies(page);
    console.log(`[14.32] 1280px: ${JSON.stringify(bodies)}`);

    // Los cuatro que la lámina 7b dibuja en tres columnas: precio,
    // habitaciones, quién publica y atributos.
    expect(bodies).toHaveLength(4);
    expect(bodies.filter((body) => body.visible)).toHaveLength(4);
  });

  test("14.32: a 360 sigue siendo un acordeón — sólo el grupo abierto se dibuja", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 900 });
    await page.goto("/measure");

    const bodies = await openBodies(page);
    console.log(`[14.32] 360px: ${JSON.stringify(bodies)}`);

    expect(bodies).toHaveLength(4);
    // Uno solo, y es el que el servidor marcó: con los cuatro abiertos en
    // 360 px el botón del conteo queda cuatro pantallas más abajo, y ése es
    // justamente el botón que hay que ver mientras se filtra.
    expect(bodies.filter((body) => body.visible).map((body) => body.id)).toEqual([
      "filtros-precio",
    ]);
  });

  test("14.33: la cuadrícula gana el ancho de la barra lateral — cuatro columnas a 1280", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 1200 });
    await page.goto("/measure");

    const tops = await page
      .getByTestId("listing-grid-harness")
      .locator("li")
      .evaluateAll((nodes) => nodes.map((node) => Math.round(node.getBoundingClientRect().top)));

    const firstRow = tops.filter((top) => top === tops[0]).length;
    console.log(`[14.33] avisos en la primera fila: ${firstRow} (cota: 4) · tops=${tops}`);
    // «Cuatro columnas de 254: 8 avisos sobre el pliegue, contra 6 antes»
    // (lámina 7c). Contar cuántas tarjetas comparten el borde superior es la
    // pregunta de verdad; `grid-template-columns` sólo dice qué se declaró.
    expect(firstRow).toBe(4);
  });

  /**
   * **14.34 — el número baja antes de que el servidor conteste.**
   *
   * Vive acá y no en `tests/e2e/` a propósito: aquella suite corre los MISMOS
   * archivos en el proyecto `crawlability`, con el script apagado, donde una
   * mejora de cliente no puede existir. Ponerla ahí obligaba a un `test.skip`,
   * y un `skip` es un gate en verde que no mide nada — hoy hay CERO y no se
   * agrega uno. Este arnés tiene un solo proyecto, con JavaScript, y monta el
   * componente de producción con conteos deterministas.
   *
   * **La navegación se deja colgada a propósito.** El manejador de ruta nunca
   * contesta, así que la petición del enlace queda pendiente para siempre:
   * es exactamente el estado que la mejora existe para cubrir —el medio
   * segundo en que Neon todavía no contestó desde Venezuela— y lo vuelve
   * determinista en vez de una carrera contra el reloj.
   */
  test("14.34: el botón baja de 16 a 9 al tocar el filtro, sin esperar al servidor", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 1200 });
    await page.goto("/measure");

    const confirm = page.getByTestId("search-confirm");
    await expect(confirm).toHaveText("Ver 16 avisos");

    // Nada de `/alquiler/**` va a contestar nunca: el enlace queda navegando.
    await page.route("**/alquiler/**", () => {});

    await page.getByRole("link", { name: "2 9" }).click();
    await expect(confirm).toHaveText("Ver 9 avisos");
    console.log("[14.34] 16 -> 9 con la navegación todavía en vuelo");

    // Y el teclado entra por la misma puerta: `Enter` sobre un enlace dispara
    // el mismo `click`, así que no hay un segundo camino que mantener.
    await page.getByRole("link", { name: "3 4" }).focus();
    await page.keyboard.press("Enter");
    await expect(confirm).toHaveText("Ver 4 avisos");
    console.log("[14.34] 9 -> 4 con el teclado");

    // El anuncio: sin esto el cambio existe sólo para quien lo ve.
    await expect(confirm.locator("[aria-live='polite']")).toHaveAttribute("aria-live", "polite");

    // Tocar algo que NO adelanta un número borra la vista previa en vez de
    // dejarla colgada: el encabezado de un grupo no es un filtro.
    await page.getByRole("link", { name: "Precio" }).click();
    await expect(confirm).toHaveText("Ver 16 avisos");
    console.log("[14.34] el encabezado de grupo devuelve el conteo del servidor");
  });

  /**
   * **El piso, medido y no afirmado.** El mismo botón dice el número correcto
   * en los bytes que el servidor manda, sin una línea de script ejecutada.
   */
  test("14.34: con el script apagado el botón sigue diciendo el número del servidor", async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const sinScript = await context.newPage();
    await sinScript.setViewportSize({ width: 1280, height: 1200 });
    await sinScript.goto("/measure");

    await expect(sinScript.getByTestId("search-confirm")).toHaveText("Ver 16 avisos");
    // Y cada opción sigue siendo un enlace de verdad con su dirección: el
    // filtro se aplica volviendo al servidor, igual que antes de la mejora.
    await expect(sinScript.getByRole("link", { name: "2 9" })).toHaveAttribute("href", /hab=2/);
    console.log("[14.34] piso intacto: el conteo y los enlaces sin JavaScript");
    await context.close();
  });
});
