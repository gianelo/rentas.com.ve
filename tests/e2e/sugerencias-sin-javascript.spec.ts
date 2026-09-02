import { expect, test } from "@playwright/test";

/**
 * **La pastilla de la pantalla de resultados sigue buscando con el script
 * apagado** (tasks.md 14.51; AGENTS.md §2; SISTEMA.md §14i: *"la pastilla es un
 * `<form method="get">` de verdad — sin script sigue buscando, y las
 * sugerencias al escribir son una mejora encima, nunca el mecanismo"*).
 *
 * **Existe por una regresión concreta y no por completitud.** La 14.51 le
 * cuelga al campo un componente de cliente que lee lo que se escribe. Una
 * mejora de esa forma se vuelve el mecanismo de dos maneras que no dan síntoma
 * en un navegador con JavaScript: volviendo controlado el `<input>` —y entonces
 * sin script no queda ni el texto que el servidor devolvió— o metiendo el envío
 * detrás de un manejador de clic. Las dos dibujan una pastilla idéntica.
 *
 * El proyecto `crawlability` corre este archivo con `javaScriptEnabled: false`,
 * que es lo que convierte «anda sin JavaScript» en una medición. Escribir y
 * enviar acá es el navegador solo.
 *
 * **La misma prueba corre además con el script encendido**, y ahí mide lo
 * contrario: que la mejora NO se haya comido el envío.
 */
const conCatalogo = Boolean(process.env.PLAYWRIGHT_BASE_URL || process.env.TEST_DATABASE_URL);

test.beforeEach(() => {
  test.skip(
    !conCatalogo,
    "needs a real catalogue: no preview deployment and no local e2e harness (tasks.md 11.22)",
  );
});

test("la pastilla de resultados busca con un GET del navegador", async ({ page }) => {
  await page.goto("/alquiler/distrito-capital");

  // Antes de escribir no hay panel ninguno: la mejora no ocupa la pantalla de
  // nadie, y en `crawlability` no puede existir en absoluto.
  await expect(page.getByRole("list", { name: "Sugerencias" })).toHaveCount(0);

  const campo = page.getByRole("searchbox");
  await campo.fill("Altamira");
  // El botón de la lupa envía el formulario. Con el script apagado es lo único
  // que puede hacerlo, y con el script encendido tiene que seguir haciéndolo.
  await page.getByRole("button", { name: "Buscar" }).click();

  // El servidor tradujo y redirigió a la ruta del lugar (14.24). Que el destino
  // exista lo prueba el 200 de la navegación.
  await expect(page).toHaveURL(/\/alquiler\/distrito-capital\/altamira/);
});

/**
 * **El texto que el servidor devolvió sigue en el campo.** Es lo que se pierde
 * si alguien vuelve controlado el `<input>` para leerlo desde el cliente, y es
 * la razón que `homeSearchForm` ya deja escrita: sin JavaScript el navegador no
 * puede recordarlo solo, y perder lo escrito en cada intento es lo que hace que
 * alguien abandone.
 */
test("el campo conserva dónde se está buscando, sin ejecutar una línea de script", async ({
  page,
}) => {
  await page.goto("/alquiler/distrito-capital/altamira");

  await expect(page.getByRole("searchbox")).toHaveValue("Altamira");
});
