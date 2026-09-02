import { expect, test } from "@playwright/test";

/**
 * **Criterio de aceptación 1, medido en vez de afirmado** (tasks.md 14.29).
 *
 * Cuántos avisos COMPLETOS entran sobre el pliegue en la pantalla principal
 * del producto.
 *
 * **EL CRITERIO SON 2 Y 4, POR DECISIÓN DEL FUNDADOR DEL 2026-09-02 — y esto
 * NO es una cota bajada para que dé.** La distinción importa y por eso se
 * escribe entera. El criterio decía 4 y 8, que es lo que dibujan las láminas
 * 6c y 7c. La 14.53 construyó las dos decisiones que él tomó ese día —las
 * fichas quitables fuera del teléfono, la placa del publicador encima de la
 * portada— y se llevó 181 px del teléfono y 54 del escritorio; siguieron
 * entrando 2 y 4, con la segunda fila a 35 px del pliegue en el teléfono y a
 * 33 en el escritorio. Lo único que quedaba por sacar era el encabezado de
 * tres líneas: miga de pan, `<h1>` y conteo, contra la única línea que dibujan
 * las láminas.
 *
 * **Preguntó lo correcto —«pero los avisos pueden ser con scroll, no?»— y la
 * respuesta es que sí: nada está roto y la lista se baja.** Lo que el criterio
 * mide es la primera pantalla, y el argumento de su propio documento es que la
 * densidad es lo que hace que un catálogo chico se lea como un mercado y no
 * como un vacío. Sabiendo eso eligió: **volver, en un teléfono, vale más que un
 * aviso y medio.** La miga de pan es la salida que la 14.41 dejó puesta al
 * borrarse la `SearchSummaryBar`, y sacarla del teléfono se la quita a quien
 * llegó a una zona filtrada. El `<h1>` y el conteo se quedan por lo mismo.
 *
 * **Lo que cuesta, dicho y no rodeado**: las láminas dibujan 4 y 8, el producto
 * sirve 2 y 4, y la diferencia es ese encabezado de tres líneas que las láminas
 * no dibujan. Está anotado en la 14.29 con su fecha y su razón.
 *
 * **Las cotas son exactas a propósito.** Un `toBe` en las dos pantallas: mover
 * el alto de la tarjeta, el ancho de la columna o cualquier cosa del encabezado
 * lo pone rojo diciendo cuánto se movió y hacia dónde.
 *
 * **Y son las dos únicas cotas de esta pantalla que las dos plataformas
 * firman.** Medido: sobre el mismo commit, macOS mide la tarjeta del teléfono
 * en 222 px y el Linux de CI en 239 —una caja de línea de metadato de
 * diferencia—, y aun así las dos cuentan 2 y 4. Una cota en píxeles sobre esta
 * pantalla mide la máquina; el conteo, no. El porqué está medido abajo, en «el
 * metadato del teléfono va a un pelo de plegarse».
 *
 * **De dónde salían los dos objetivos de las láminas.** El enunciado de la
 * 14.29 dice «6 a 1280» y ese 6 es anterior a la 14.33: la lámina 7c lo escribe
 * entero —*«cuatro columnas de 254: 8 avisos sobre el pliegue, contra 6
 * antes»*—, donde el 6 es el de la barra lateral que el fundador sacó el
 * 2026-08-26. El 4 del teléfono venía de la 6c, *«tarjeta de 195 px · 4 avisos
 * completos»*.
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

/** El criterio, revisado por el fundador el 2026-09-02. Ver la cabecera. */
const CRITERIO_MOVIL = 2;
const CRITERIO_ESCRITORIO = 4;

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
      };
    });
}

test.describe("14.29: los avisos completos sobre el pliegue", () => {
  test("a 360×640 entran 2 avisos completos, que es el criterio del fundador", async ({ page }) => {
    await page.setViewportSize(MOVIL);
    await page.goto("/measure/lista");

    const { completos, dibujadas, fondos } = await avisosCompletosSobreElPliegue(page);
    console.log(
      `[14.29] 360×640: ${completos} avisos completos (criterio: === ${CRITERIO_MOVIL} · lámina 6c: ${LAMINA_MOVIL}) · dibujadas=${dibujadas} · fondos=${fondos}`,
    );

    // **La mitad positiva, y sin ella el número no significa nada.** Si el
    // arnés dibujara sólo dos tarjetas, «2 completos» sería el tope del
    // fixture y no una medida de la pantalla: una medición sobre una entrada
    // que el fixture nunca produce no mide nada.
    expect(dibujadas).toBeGreaterThan(LAMINA_MOVIL);
    expect(completos).toBe(CRITERIO_MOVIL);
  });

  test("a 1280×800 entran 4 avisos completos, que es el criterio del fundador", async ({
    page,
  }) => {
    await page.setViewportSize(ESCRITORIO);
    await page.goto("/measure/lista");

    const { completos, dibujadas, fondos } = await avisosCompletosSobreElPliegue(page);
    console.log(
      `[14.29] 1280×800: ${completos} avisos completos (criterio: === ${CRITERIO_ESCRITORIO} · lámina 7c: ${LAMINA_ESCRITORIO}) · dibujadas=${dibujadas} · fondos=${fondos}`,
    );

    expect(dibujadas).toBeGreaterThan(LAMINA_ESCRITORIO);
    expect(completos).toBe(CRITERIO_ESCRITORIO);
  });

  /**
   * **El encabezado, que es lo que el fundador eligió conservar.**
   *
   * Los 2 de arriba no son culpa de la tarjeta: la cuadrícula empieza a **219
   * px** en un teléfono, contra los ~74 que dibuja la lámina 6c —60 de barra
   * más el relleno—, porque la pantalla servida agrega miga de pan, `<h1>` y
   * conteo, y ninguno de los tres aparece en 6c. **Eran 373 hasta la 14.53**, y
   * los 154 que faltan son las fichas quitables al irse del teléfono.
   *
   * Esos tres bloques son exactamente el aviso y medio que separa el 2 del 4, y
   * el 2026-09-02 el fundador decidió que se quedan: la miga de pan es la
   * salida que la 14.41 dejó puesta al borrarse la `SearchSummaryBar`, y
   * **volver, en un teléfono, vale más que un aviso y medio**. Así que esta
   * medida dejó de ser un pendiente y pasó a ser una guardia: si el encabezado
   * creciera, esto lo dice.
   *
   * Se afirma como cota superior y no como igualdad exacta: una igualdad al
   * píxel sobre texto renderizado se rompe por una versión de fuente sin que
   * nada del producto haya cambiado. **La holgura de 6 px que se deja está
   * medida y no elegida a ojo**: 219 px en macOS y 219 en el Linux de CI sobre
   * el mismo commit — este encabezado es corto y sobrado en las dos, que es
   * justo lo contrario de lo que le pasa al metadato de la tarjeta.
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

  /**
   * **Por qué esta pantalla no admite una cota en píxeles, medido.**
   *
   * Esto no nació como una prueba: nació de una diferencia. La primera versión
   * de este archivo acotaba en 40 px lo que le faltaba a la segunda fila para
   * caber, y sobre **el mismo commit** macOS medía 35 y el Linux de CI 69. La
   * causa se midió en vez de suponerse, y no es la que parecía:
   *
   * - el encabezado mide **219 px en las dos** — o sea que no es una diferencia
   *   de interlínea en sus tres renglones;
   * - la tarjeta de **escritorio mide 294 px en las dos**, mismas fuentes,
   *   mismos átomos;
   * - la del teléfono mide **222 en una y 239 en la otra**, y la diferencia es
   *   exactamente una caja de línea de metadato (12 px × 1,4 = 16,8).
   *
   * La causa es esta medida: la línea `Chacao · 2 hab · 78 m²` ocupa **131,3 px
   * de los 136 disponibles** en la tarjeta del teléfono —**4,7 px de holgura, un
   * 3,5 %**— y `system-ui` no resuelve a la misma fuente en macOS que en Linux.
   * Un 3,6 % más ancha y la línea se pliega: +16,8 px por tarjeta, ×2 filas =
   * +33,6, que son los 34 px de diferencia. En escritorio la misma frase tiene
   * **100,7 px de holgura** y por eso allá las dos máquinas coinciden al píxel.
   *
   * **La aritmética descarta la otra causa posible.** Si en Linux se angostara
   * la columna —una barra de desplazamiento clásica— la segunda fila caería en
   * 707; si la columna sigue en 158 y sólo se pliega el texto, cae en **709**, y
   * CI mide 709. Reproducido además en esta máquina: con la columna intacta y
   * `letter-spacing: 0,3px` sobre el metadato, la pantalla mide 458/709 y la
   * tarjeta 239 — los números de CI, clavados.
   *
   * **Esto es un dato del producto y no ruido de medición**, y por eso se queda
   * medido: el teléfono dibuja sus tarjetas a un pelo de plegar el metadato, así
   * que un aparato con una fuente de sistema un poco más ancha ve cada tarjeta
   * 17 px más alta. Se afirma como **proporción y nunca en píxeles**, que es lo
   * único que las dos máquinas pueden firmar.
   */
  test("el metadato del teléfono va a un pelo de plegarse, y el del escritorio no", async ({
    page,
  }) => {
    /** El ancho de la línea SIN plegar, que es el número que cambia de máquina. */
    const holguraDelMetadato = async () =>
      page
        .getByTestId("lista-grid")
        .locator("ol > li")
        .first()
        .evaluate((celda) => {
          // **El metadato es el último `<p>` de la tarjeta**, apuntado por
          // estructura: el otro `<p>` es el precio y va antes por la regla
          // transversal 2. Nunca por clase — en producción son hashes.
          const parrafos = celda.querySelectorAll("p");
          const meta = parrafos[parrafos.length - 1] as HTMLElement;
          const cuerpo = meta.parentElement as HTMLElement;
          const cs = getComputedStyle(meta);
          const csCuerpo = getComputedStyle(cuerpo);

          // Medido sobre una copia con `nowrap` fuera de pantalla: si el texto
          // ya se plegó, su propia caja mide el ancho del contenedor y no el de
          // la frase, y la holgura saldría 0 justo en la máquina donde importa.
          const copia = document.createElement("span");
          copia.textContent = meta.textContent;
          copia.style.cssText = `position:absolute;left:-9999px;top:0;white-space:nowrap;font:${cs.font};letter-spacing:${cs.letterSpacing}`;
          document.body.append(copia);
          const anchoNatural = copia.getBoundingClientRect().width;
          copia.remove();

          const disponible =
            cuerpo.getBoundingClientRect().width -
            Number.parseFloat(csCuerpo.paddingLeft) -
            Number.parseFloat(csCuerpo.paddingRight);

          return {
            texto: meta.textContent ?? "",
            anchoNatural: Math.round(anchoNatural * 10) / 10,
            disponible: Math.round(disponible * 10) / 10,
            holgura: Math.round((disponible - anchoNatural) * 10) / 10,
            proporcion: (disponible - anchoNatural) / disponible,
          };
        });

    await page.setViewportSize(MOVIL);
    await page.goto("/measure/lista");
    const telefono = await holguraDelMetadato();

    await page.setViewportSize(ESCRITORIO);
    await page.goto("/measure/lista");
    const escritorio = await holguraDelMetadato();

    console.log(
      `[14.29] holgura del metadato «${telefono.texto}»: 360 → ${telefono.holgura}px de ${telefono.disponible} (${(telefono.proporcion * 100).toFixed(1)}%) · 1280 → ${escritorio.holgura}px de ${escritorio.disponible} (${(escritorio.proporcion * 100).toFixed(1)}%)`,
    );

    // **La frase es la misma en las dos**, así que lo que cambia es la caja y no
    // el contenido. Sin esta igualdad, las dos proporciones de abajo podrían
    // estar comparando dos textos distintos.
    expect(escritorio.texto).toBe(telefono.texto);
    expect(escritorio.anchoNatural).toBeCloseTo(telefono.anchoNatural, 0);

    // El teléfono, al filo: menos de un 10 % de holgura. Puede ser 3,5 % y puede
    // ser negativa, según a qué fuente resuelva `system-ui`; lo que no puede es
    // ser holgada, porque entonces esta explicación dejó de valer y hay que
    // volver a mirarla.
    expect(telefono.proporcion).toBeLessThan(0.1);
    // El escritorio, sobrado: es lo que hace que allá las dos máquinas midan lo
    // mismo al píxel.
    expect(escritorio.proporcion).toBeGreaterThan(0.25);
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
