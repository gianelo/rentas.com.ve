import { expect, test } from "@playwright/test";

/**
 * **Las dos formas de la puerta, medidas y no declaradas** (tasks.md 15.8,
 * láminas 8b y 9b). La lección del precio de la tarjeta: `lint:tokens` salió 0
 * mientras la pantalla más visitada pintaba el número equivocado, porque una
 * hoja puede declarar `var(--door-w)` y apuntar al token de al lado. Lo único
 * que distingue 460 de 420 es el ancho dibujado.
 */
async function panel(page: import("@playwright/test").Page) {
  const box = await page.getByTestId("puerta-panel").boundingBox();
  if (!box) throw new Error("la puerta no dibujó una caja medible");
  return box;
}

test.describe("la puerta de entrar (15.8)", () => {
  test("15.8: a 1280 es un diálogo de 460 px centrado, no una hoja", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/measure?entrar=si");

    const box = await panel(page);
    console.log(`[15.8] escritorio: ancho=${box.width}px x=${box.x}px`);

    expect(box.width).toBe(460);
    // Centrado: (1280 - 460) / 2. Sin esto, un panel de 460 pegado al borde
    // pasaría la primera aserción sin ser el diálogo de la lámina.
    expect(box.x).toBe(410);
    // Y no llega al piso: la hoja de abajo es la forma del móvil.
    expect(box.y + box.height).toBeLessThan(900);
  });

  test("15.8: a 360 sube desde abajo y deja el aviso a la vista", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto("/measure?entrar=si");

    const box = await panel(page);
    console.log(`[15.8] móvil: ancho=${box.width}px alto=${box.height}px y=${box.y}px`);

    expect(box.width).toBe(360);
    expect(Math.round(box.y + box.height)).toBe(800);
    // **Lo que la 15.8 pide, en píxeles**: queda pantalla arriba de la hoja, así
    // que el aviso que se estaba leyendo sigue detrás. Una hoja de alto completo
    // sería la pantalla propia que esta tarea existe para no ser.
    expect(box.y).toBeGreaterThan(0);
  });
});
