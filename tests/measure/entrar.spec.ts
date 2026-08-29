import { expect, test } from "@playwright/test";
import { serialiseMagicLinkTicket } from "../../src/modules/identity/domain/magic-link-request";

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

/**
 * **La pantalla de espera, medida y no declarada** (15.9, láminas 8c/9c).
 *
 * El comprobante se pone como cookie porque es exactamente lo que tendría el
 * navegador que acaba de pedir el enlace: la dirección no viaja en la barra, así
 * que sin cookie la ruta manda a `/signin` — y eso también se mide.
 */
const ESPERA = "/signin/revisa-tu-correo";

async function conComprobante(page: import("@playwright/test").Page) {
  await page.context().addCookies([
    {
      name: "rentas_enlace",
      value: encodeURIComponent(
        serialiseMagicLinkTicket({
          address: "maria.f@gmail.com",
          sentAtMs: Date.now(),
          returnTo: null,
        }),
      ),
      url: "http://127.0.0.1:3100/signin",
      httpOnly: true,
    },
  ]);
}

test.describe("la pantalla de espera del enlace (15.9)", () => {
  test("15.9: a 1280 la columna mide 520 centrada y las dos salidas van lado a lado", async ({
    page,
  }) => {
    await conComprobante(page);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(ESPERA);

    const columna = await caja(page, "espera-columna");
    const acciones = await caja(page, "espera-acciones");
    const [reenvio, google] = await page.getByTestId("espera-acciones").locator("> *").all();
    const cajaReenvio = await reenvio?.boundingBox();
    const cajaGoogle = await google?.boundingBox();
    console.log(
      `[15.9] escritorio: columna=${columna.width}px x=${columna.x}px · acciones=${acciones.width}px`,
    );

    // 520 dentro del contenedor de 1100 centrado en 1280: 90 + (1100-520)/2.
    expect(columna.width).toBe(520);
    expect(columna.x).toBe(380);
    // **Lado a lado, no una debajo de la otra** — la nota de la 9c. Sin la
    // cuadrícula de dos columnas aplicada, el ancho de arriba pasaría igual.
    expect(cajaGoogle?.x).toBeGreaterThan(cajaReenvio?.x ?? 0);
    expect(cajaGoogle?.y).toBe(cajaReenvio?.y);
  });

  test("15.9: a 360 la columna ocupa el ancho y las salidas se apilan", async ({ page }) => {
    await conComprobante(page);
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto(ESPERA);

    const columna = await caja(page, "espera-columna");
    const [reenvio, google] = await page.getByTestId("espera-acciones").locator("> *").all();
    const cajaReenvio = await reenvio?.boundingBox();
    const cajaGoogle = await google?.boundingBox();
    console.log(
      `[15.9] móvil: columna=${columna.width}px alto=${columna.height}px · reenvío=${cajaReenvio?.width}px`,
    );

    // 360 menos los márgenes de 16 que SISTEMA.md fija para el móvil.
    expect(columna.width).toBe(328);
    expect(cajaReenvio?.width).toBe(328);
    expect(cajaGoogle?.y).toBeGreaterThan((cajaReenvio?.y ?? 0) + (cajaReenvio?.height ?? 0));
  });

  /** Falla cerrado: sin comprobante no hay dirección que mostrar (§7). */
  test("15.9: sin comprobante la espera no se dibuja, devuelve a la puerta", async ({ page }) => {
    await page.goto(ESPERA);

    await expect(page).toHaveURL(/\/signin$/);
  });
});
