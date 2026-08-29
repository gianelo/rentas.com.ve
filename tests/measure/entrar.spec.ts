import { expect, test } from "@playwright/test";

/**
 * **Las dos formas de la pantalla de entrar, medidas y no declaradas** (15.7,
 * láminas 8a/9a). Misma lección que `puerta.spec.ts`: una hoja puede declarar
 * `420px` y quedar apilada igual si la cuadrícula no llega a aplicarse. Se mide
 * sobre `/signin`, la ruta de verdad y no un arnés.
 */
const RUTA = "/signin?callbackUrl=%2Fpublicar";

async function caja(page: import("@playwright/test").Page, testId: string) {
  const box = await page.getByTestId(testId).boundingBox();
  if (!box) throw new Error(`${testId} no dibujó una caja medible`);
  return box;
}

test.describe("la pantalla de entrar (15.7)", () => {
  test("15.7: a 1280 la columna mide 420 y los pasos van al costado", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(RUTA);

    const columna = await caja(page, "entrar-columna");
    const pasos = await caja(page, "entrar-pasos");
    console.log(
      `[15.7] escritorio: columna=${columna.width}px x=${columna.x}px · pasos x=${pasos.x}px`,
    );

    expect(columna.width).toBe(420);
    // Dentro del contenedor de 1100 centrado en 1280: (1280 - 1100) / 2.
    expect(columna.x).toBe(90);
    // **Al costado, no debajo** — la nota de la 9a: «los tres pasos van al
    // costado, no debajo: el botón queda alto». Sin la cuadrícula aplicada una
    // columna de 420 pasaría la primera aserción igual.
    expect(pasos.x).toBe(590);
    expect(pasos.y).toBe(columna.y);
  });

  test("15.7: a 360 la columna ocupa el ancho y los pasos bajan", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto(RUTA);

    const columna = await caja(page, "entrar-columna");
    const pasos = await caja(page, "entrar-pasos");
    console.log(
      `[15.7] móvil: columna=${columna.width}px alto=${columna.height}px · pasos y=${pasos.y}px`,
    );

    // 360 menos los márgenes de 16 que SISTEMA.md fija para el móvil.
    expect(columna.width).toBe(328);
    expect(pasos.width).toBe(328);
    expect(pasos.y).toBeGreaterThan(columna.y + columna.height);
  });
});
