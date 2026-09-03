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

/**
 * **La placa del publicador cambia de sitio con el ancho, medido en un
 * navegador** (tasks.md 14.43; láminas `Rentas - Ficha - Mobile.dc.html`
 * líneas 93-95 y la de escritorio).
 *
 * **Por qué acá y no en dos pruebas de hoja de estilos.** La mudanza vive en DOS
 * archivos que no se conocen: `Nav.module.css` esconde la del encabezado a
 * partir de 768 px y `ficha.module.css` esconde la de la columna de datos por
 * debajo. Cada uno tiene su aserción, y las dos pueden estar verdes con las dos
 * placas visibles a la vez, o con ninguna — que es exactamente el defecto que
 * esta mudanza puede producir y que ninguna de las dos puede ver. Lo único que
 * responde «cuántas se ven a este ancho» es contarlas dibujadas.
 *
 * **Y la garantía de la 14.25 no se hereda: se vuelve a medir.** La 1b.7 fija
 * sobre el átomo que dueño e inmobiliaria se distinguen **en escala de grises**
 * —relleno contra borde, nunca el acento— contra `--surface`. El encabezado es
 * otra superficie: tiene su propio fondo y un borde inferior. Se mide el fondo
 * que el navegador PINTÓ debajo de cada placa y se rehace la cuenta ahí, con la
 * misma aritmética que la 14.53 usó sobre la portada.
 */
test.describe("la placa del publicador se muda al encabezado en móvil (14.43)", () => {
  /** WCAG 2.x: el canal lineal de un componente sRGB. */
  const canal = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const luminancia = ([r, g, b]: readonly number[]) =>
    0.2126 * canal((r ?? 0) / 255) +
    0.7152 * canal((g ?? 0) / 255) +
    0.0722 * canal((b ?? 0) / 255);
  const contraste = (a: readonly number[], b: readonly number[]) => {
    const [alto, bajo] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
    return ((alto ?? 0) + 0.05) / ((bajo ?? 0) + 0.05);
  };
  const canal255 = (color: string): readonly number[] =>
    (color.match(/^rgba?\(([^)]*)\)$/)?.[1] ?? "")
      .split(",")
      .map((parte) => Number.parseFloat(parte.trim()));
  const alfa = (color: string) => canal255(color)[3] ?? 1;

  /**
   * Cuántas placas del publicador **dibuja** la ficha a este ancho, contando el
   * encabezado y la columna de datos por separado.
   *
   * Se cuenta por `offsetParent`/caja y no por la clase: las clases son hashes
   * de compilación, y una aserción sobre el nombre mide el `build` y no la
   * pantalla. Un `display: none` deja la caja en cero y sin `offsetParent`.
   */
  async function placasVisibles(page: import("@playwright/test").Page, quien: "owner" | "broker") {
    return page.evaluate((tipo) => {
      const palabra = tipo === "owner" ? "Dueño" : "Inmobiliaria";
      const barra = tipo === "owner" ? "nav-harness-ficha" : "nav-harness-ficha-inmobiliaria";

      // **La placa es la HOJA del árbol, no su envoltorio.** El envoltorio que
      // esconde por ancho tiene el mismo `textContent`, así que contar por texto
      // sin más da dos. Se filtra por «no tiene hijos elemento», que es
      // estructura; filtrar por nombre de clase mediría el hash del `build`.
      const hojas = (raiz: ParentNode | null) =>
        [...(raiz?.querySelectorAll("span") ?? [])].filter(
          (s) => s.childElementCount === 0 && s.textContent === palabra,
        );
      const visible = (nodo: Element) => {
        const caja = nodo.getBoundingClientRect();
        return caja.width > 0 && caja.height > 0;
      };

      return {
        encabezado: hojas(document.querySelector(`[data-testid="${barra}"]`)).filter(visible)
          .length,
        datos: hojas(document.querySelector('[data-testid="ficha-summary"]')).filter(visible)
          .length,
      };
    }, quien);
  }

  test("a 360 la placa la lleva el encabezado, y la columna de datos NO la dibuja", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto("/measure");

    const dueño = await placasVisibles(page, "owner");
    console.log(`[14.43] 360: encabezado=${dueño.encabezado} columna de datos=${dueño.datos}`);

    expect(dueño.encabezado).toBe(1);
    expect(dueño.datos).toBe(0);
  });

  test("a 1280 la lleva la columna de datos, y el encabezado NO la dibuja", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/measure");

    const dueño = await placasVisibles(page, "owner");
    console.log(`[14.43] 1280: encabezado=${dueño.encabezado} columna de datos=${dueño.datos}`);

    expect(dueño.encabezado).toBe(0);
    expect(dueño.datos).toBe(1);
  });

  /**
   * **La pareja que hace que las dos de arriba midan algo.** «Inmobiliaria» es
   * la palabra larga y es la mitad de los avisos: una mudanza probada sólo con
   * «Dueño» deja sin medir el caso que más espacio pide.
   */
  test("lo mismo con la palabra larga: exactamente una a cada ancho", async ({ page }) => {
    await page.goto("/measure");

    await page.setViewportSize({ width: 360, height: 800 });
    const movil = await placasVisibles(page, "broker");
    await page.setViewportSize({ width: 1280, height: 900 });
    const escritorio = await placasVisibles(page, "broker");
    console.log(
      `[14.43] inmobiliaria: 360 encabezado=${movil.encabezado}/datos=${movil.datos} · 1280 encabezado=${escritorio.encabezado}/datos=${escritorio.datos}`,
    );

    expect(movil.encabezado + movil.datos).toBe(1);
    expect(escritorio.encabezado + escritorio.datos).toBe(1);
    expect(movil.encabezado).toBe(1);
    expect(escritorio.datos).toBe(1);
  });

  /**
   * **La garantía de la 14.25, rehecha sobre el fondo que el encabezado pinta.**
   *
   * El fondo efectivo de cada placa es el suyo cuando es opaco —dueño, relleno
   * de `--ink`— y el de la barra cuando no lo es —inmobiliaria, sin relleno—.
   * Con ésos se mide lo mismo que `design-contract.test.tsx`, pero sobre lo
   * DIBUJADO y en la superficie donde ahora vive: separación de luminancia entre
   * los dos fondos (la 1b.7 pide > 0,3) y 4,5:1 para cada texto.
   */
  test("a 360, dueño e inmobiliaria siguen separados en escala de grises sobre la barra", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto("/measure");

    const leer = (testid: string) =>
      page.getByTestId(testid).evaluate((nodo) => {
        const barra = nodo.querySelector("header");
        // La hoja del árbol y no el envoltorio que esconde por ancho: aquél
        // tiene el mismo texto y un fondo transparente, y mediría la barra dos
        // veces en vez de la placa. `childElementCount` es estructura; el
        // nombre de la clase sería el hash del `build`.
        const placa = [...nodo.querySelectorAll("span")].find(
          (s) =>
            s.childElementCount === 0 &&
            (s.textContent === "Dueño" || s.textContent === "Inmobiliaria"),
        );
        if (!(barra instanceof HTMLElement) || !(placa instanceof HTMLElement)) {
          throw new Error("el arnés no dibujó la barra y su placa");
        }
        return {
          fondoBarra: getComputedStyle(barra).backgroundColor,
          fondoPlaca: getComputedStyle(placa).backgroundColor,
          textoPlaca: getComputedStyle(placa).color,
          bordePlaca: getComputedStyle(placa).borderTopColor,
          anchoBorde: getComputedStyle(placa).borderTopWidth,
        };
      });

    const dueño = await leer("nav-harness-ficha");
    const inmobiliaria = await leer("nav-harness-ficha-inmobiliaria");

    // La barra no deja pasar nada de lo que tenga debajo: sin esto, el fondo
    // efectivo de la inmobiliaria sería una suposición y no una medición.
    expect(alfa(dueño.fondoBarra)).toBe(1);
    expect(inmobiliaria.fondoBarra).toBe(dueño.fondoBarra);

    const fondoEfectivo = (celda: Awaited<ReturnType<typeof leer>>) =>
      alfa(celda.fondoPlaca) === 1 ? canal255(celda.fondoPlaca) : canal255(celda.fondoBarra);
    const fondoDueño = fondoEfectivo(dueño);
    const fondoInmobiliaria = fondoEfectivo(inmobiliaria);
    const separacion = Math.abs(luminancia(fondoDueño) - luminancia(fondoInmobiliaria));

    console.log(
      `[14.43] barra=${dueño.fondoBarra} · fondo dueño=${fondoDueño} L=${luminancia(fondoDueño).toFixed(3)} · fondo inmobiliaria=${fondoInmobiliaria} L=${luminancia(fondoInmobiliaria).toFixed(3)} · separación=${separacion.toFixed(3)}`,
    );

    // Relleno contra borde: uno pinta y el otro no, y eso en escala de grises
    // son dos luminancias distintas.
    expect(alfa(dueño.fondoPlaca)).toBe(1);
    expect(alfa(inmobiliaria.fondoPlaca)).toBe(0);
    expect(separacion).toBeGreaterThan(0.3);

    const cDueño = contraste(canal255(dueño.textoPlaca), fondoDueño);
    const cInmobiliaria = contraste(canal255(inmobiliaria.textoPlaca), fondoInmobiliaria);
    const cBorde = contraste(canal255(inmobiliaria.bordePlaca), fondoInmobiliaria);
    console.log(
      `[14.43] contraste dueño=${cDueño.toFixed(2)} inmobiliaria=${cInmobiliaria.toFixed(2)} borde=${cBorde.toFixed(2)} (${inmobiliaria.anchoBorde})`,
    );

    expect(cDueño).toBeGreaterThanOrEqual(4.5);
    expect(cInmobiliaria).toBeGreaterThanOrEqual(4.5);
    expect(cBorde).toBeGreaterThanOrEqual(3);
    expect(Number.parseFloat(inmobiliaria.anchoBorde)).toBeGreaterThan(0);
  });

  /**
   * **Lo que la mudanza le cuesta al encabezado de móvil, medido y no estimado.**
   *
   * La lámina dibuja ese encabezado con DOS hijos —`← Resultados` y la placa— y
   * la barra servida lleva además «Publicar gratis» y «Entrar», que la 14.40
   * conservó a propósito («ninguna de las dos láminas dibuja la ficha CON
   * sesión») y dejó como divergencia abierta. Con cuatro hijos a 360 px no
   * entran en un renglón y `flex-wrap` los baja a dos.
   *
   * **Esta prueba no afirma que 96 esté bien: fija el número para que se vea.**
   * Cuál de los cuatro hijos se va es una decisión del fundador y no de quien
   * mide — la misma forma en que la 14.53 dejó su hueco escrito antes de que se
   * decidiera. El día que se decida, esta prueba se pone roja diciendo cuánto se
   * movió.
   */
  test("14.43: a 360 la placa empuja las acciones a un segundo renglón", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto("/measure");

    /**
     * **Se comparan dos cajas, no un umbral en píxeles.** Una cota en px depende
     * de la máquina que renderiza —este repositorio ya midió 69 donde el autor
     * medía 35—, mientras que «las acciones empiezan por debajo de donde termina
     * la vuelta» es una relación entre cajas y vale en cualquier máquina.
     */
    const partido = (testid: string) =>
      page
        .getByTestId(testid)
        .locator("header > div")
        .evaluate((inner) => {
          const cajas = [...inner.children]
            .map((c) => c.getBoundingClientRect())
            .filter((c) => c.width > 0 && c.height > 0);
          const vuelta = cajas[0];
          const acciones = cajas[cajas.length - 1];
          if (!vuelta || !acciones) throw new Error("el encabezado no dibujó sus hijos");
          return {
            partido: acciones.top >= vuelta.bottom,
            hijos: cajas.length,
            alto: Math.round(inner.getBoundingClientRect().height),
          };
        });

    const dueño = await partido("nav-harness-ficha");
    const inmobiliaria = await partido("nav-harness-ficha-inmobiliaria");
    console.log(
      `[14.43] encabezado a 360: «Dueño» partido=${dueño.partido} hijos=${dueño.hijos} alto=${dueño.alto}px · «Inmobiliaria» partido=${inmobiliaria.partido} hijos=${inmobiliaria.hijos} alto=${inmobiliaria.alto}px`,
    );

    // Los tres hijos visibles del encabezado a 360: la vuelta, la placa y las
    // acciones. La marca está en el marcado y la esconde `.brandCentre`.
    expect(dueño.hijos).toBe(3);
    // Las dos palabras cuestan lo mismo: el renglón se parte igual.
    expect(dueño.partido).toBe(inmobiliaria.partido);
    // **Y se parte, que es el hallazgo.** No se afirma que esté bien: se fija
    // para que se vea. La lámina dibuja ese encabezado con DOS hijos y la barra
    // servida lleva además «Publicar gratis» y «Entrar», que la 14.40 conservó a
    // propósito y dejó como divergencia abierta. Cuál de los cuatro se va es
    // decisión del fundador y no de quien mide — igual que la 14.53 dejó su
    // hueco escrito antes de decidirse. El día que se decida, esto se pone rojo.
    expect(dueño.partido).toBe(true);
  });
});
