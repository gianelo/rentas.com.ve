import { expect, test } from "@playwright/test";

/**
 * **El panel de sugerencias al escribir, en un navegador de verdad**
 * (tasks.md 14.51 — la 14.35 con la forma que sí entra).
 *
 * **Vive acá y no en `tests/e2e/` por la misma razón que la 14.34.** Aquella
 * suite corre los MISMOS archivos en el proyecto `crawlability`, con el script
 * apagado, donde una mejora de cliente no puede existir: ponerla ahí obligaba a
 * un `test.skip`, y un `skip` es un gate en verde que no mide nada. Este arnés
 * tiene un solo proyecto, con JavaScript, y monta el componente de producción
 * sobre un vocabulario determinista.
 *
 * El piso —que la pastilla siga buscando con el script apagado— se mide en
 * `tests/e2e/sugerencias-sin-javascript.spec.ts`, contra la aplicación real
 * servida, y además al final de este archivo sobre el mismo arnés.
 */
const PASTILLA = "nav-harness-busqueda";

test.describe("14.51 — las sugerencias mientras se escribe", () => {
  test("14.51: escribir «alta» ofrece Altamira con su ámbito y su conteo", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/measure");

    const pastilla = page.getByTestId(PASTILLA);
    // Nada dibujado antes de escribir: la mejora no ocupa la pantalla de nadie.
    await expect(pastilla.getByRole("list", { name: "Sugerencias" })).toHaveCount(0);

    await pastilla.getByRole("searchbox").fill("alta");

    const opcion = pastilla.getByRole("link", { name: /Altamira/ });
    await expect(opcion).toHaveAttribute("href", "/alquiler/distrito-capital/altamira");
    // **El par (filtro, valor) con su ámbito** (14.18) y el conteo de la 14.51,
    // los dos leídos de lo dibujado y no del código.
    await expect(opcion).toContainText("Chacao · Distrito Capital");
    await expect(opcion).toContainText("9");
    console.log("[14.51] «alta» → Altamira · Chacao · Distrito Capital · 9");
  });

  /**
   * **La regla de la 14.18, viva del lado del cliente.** `Centro` existe en
   * Maracaibo y en Distrito Capital: ofrecer la palabra sola aplicaría el filtro
   * de la ciudad equivocada y devolvería cero avisos sin que nadie entienda por
   * qué, porque el aislamiento de ciudad es una garantía dura de la base.
   */
  test("14.51: un nombre repetido se ofrece dos veces, cada uno con su ciudad", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/measure");

    const pastilla = page.getByTestId(PASTILLA);
    await pastilla.getByRole("searchbox").fill("centro");

    const opciones = pastilla.getByRole("link", { name: /Centro/ });
    await expect(opciones).toHaveCount(2);
    expect(
      await opciones.evaluateAll((nodes) => nodes.map((node) => node.getAttribute("href"))),
    ).toEqual(["/alquiler/distrito-capital/centro", "/alquiler/maracaibo/centro"]);
    console.log("[14.51] «centro» → dos opciones, una por ciudad");
  });

  /**
   * **La zona vacía no se ofrece, y es el corazón de la 14.51.** Sugerir una
   * zona sin avisos manda a una pantalla sin salida (regla transversal 4);
   * recortar el vocabulario por ahí no es una degradación, es la respuesta
   * correcta. El arnés le pone conteo cero a Chacao a propósito.
   */
  test("14.51: una zona sin avisos activos no se ofrece", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/measure");

    const pastilla = page.getByTestId(PASTILLA);
    await pastilla.getByRole("searchbox").fill("chacao");

    // Cero opciones que lleven a Chacao...
    await expect(pastilla.getByRole("link", { name: /^Chacao/ })).toHaveCount(0);
    // ...y la pareja de esa negativa: escribir algo que SÍ tiene avisos sigue
    // ofreciendo. Sin esto, un panel roto pasa esta prueba igual de verde.
    await pastilla.getByRole("searchbox").fill("altamira");
    await expect(pastilla.getByRole("link", { name: /Altamira/ })).toHaveCount(1);
    console.log("[14.51] Chacao (0 avisos) no se ofrece; Altamira (9) sí");
  });

  test("14.51: Escape cierra la lista sin borrar lo escrito", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/measure");

    const pastilla = page.getByTestId(PASTILLA);
    const campo = pastilla.getByRole("searchbox");
    await campo.fill("alta");
    await expect(pastilla.getByRole("list", { name: "Sugerencias" })).toHaveCount(1);

    await campo.press("Escape");
    await expect(pastilla.getByRole("list", { name: "Sugerencias" })).toHaveCount(0);
    // Lo escrito se queda: perderlo es lo que hace que alguien abandone.
    await expect(campo).toHaveValue("alta");
    console.log("[14.51] Escape cierra y el texto sobrevive");
  });

  /**
   * **El piso, medido y no afirmado.** Con el script apagado el panel no puede
   * existir — y la pastilla tiene que seguir buscando igual. Esta prueba es la
   * que impide que una mejora se vuelva el mecanismo.
   */
  test("14.51: con el script apagado no hay panel, y la pastilla sigue siendo un GET", async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const sinScript = await context.newPage();
    await sinScript.setViewportSize({ width: 1280, height: 900 });
    await sinScript.goto("/measure");

    const pastilla = sinScript.getByTestId(PASTILLA);
    await pastilla.getByRole("searchbox").fill("alta");

    await expect(pastilla.getByRole("list", { name: "Sugerencias" })).toHaveCount(0);
    // Y el mecanismo entero sigue en pie: un formulario `GET` de verdad con su
    // botón de envío. Sin esto la negativa de arriba pasaría igual con la
    // pastilla rota.
    await expect(pastilla.locator("form")).toHaveAttribute("method", "get");
    await expect(pastilla.locator("form")).toHaveAttribute("action", "/");
    await expect(pastilla.getByRole("button", { name: "Buscar" })).toHaveCount(1);
    console.log("[14.51] piso intacto: sin script no hay panel y el GET sigue ahí");
    await context.close();
  });
});
