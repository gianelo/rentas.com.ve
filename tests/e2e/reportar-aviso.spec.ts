import { expect, test } from "@playwright/test";

/**
 * La pantalla de reportar un aviso en un navegador de verdad (tasks.md 8.7).
 *
 * **Corre en todas partes, sin base de datos y sin `test.skip`.** El `GET` de
 * esta pantalla no consulta nada: el id sale del propio segmento de la URL y
 * quién existe y quién no lo resuelve el `POST`. Así que el camino entero se
 * recorre contra el build local que apunta a una base irrutable — que es
 * justamente el modo en que corre CI cuando no hay secreto de bypass.
 *
 * **Y corre dos veces**: el proyecto `crawlability` la repite con el script
 * apagado. Eso es lo que convierte "anda sin JavaScript" en una medición y no
 * en una afirmación (AGENTS.md §2), y es lo único que puede decirlo de una
 * pantalla nueva del camino de lectura.
 */
const AVISO = "/alquiler/caracas/chacao/apartamento-de-prueba-11111111-2222-4333-8444-555555555555";
const REPORTAR = `${AVISO}/reportar`;

/** El acuse se dibuja al volver del POST. Nunca al abrir. */
function acknowledges(html: string): boolean {
  return html.includes("Recibimos tu reporte");
}

test("ofrece un POST de verdad, no un enlace", async ({ page }) => {
  const response = await page.goto(REPORTAR);
  const html = await page.content();

  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Reportar este aviso");
  // Sin JavaScript, un `<button>` no navega y un enlace no ejecuta nada. Lo
  // único que reporta tiene que ser un formulario nativo — y el proyecto
  // `crawlability` corre esta misma línea con el script apagado.
  expect(html).toMatch(/<form[^>]*method=["']?post/i);
  await expect(page.getByRole("button", { name: "Enviar el reporte" })).toBeVisible();
});

/**
 * **Abrir no es reportar.** Un enlace lo abre el antivirus del proveedor, el
 * previsualizador de WhatsApp y el prefetch del navegador, todos con `GET` y
 * sin que nadie haya hecho clic. Un reporte que se ejecutara al abrir gastaría
 * uno de los tres asientos que hacen falta para ocultar un aviso.
 *
 * Se comprueba con pedidos crudos, sin navegador, porque así es exactamente
 * como llegan esos tres. Dos aperturas seguidas dan lo mismo: si la primera
 * hubiera hecho algo, la segunda contestaría distinto.
 */
test("un GET no reporta ni acusa recibo", async ({ request }) => {
  const first = await request.get(REPORTAR);
  const second = await request.get(REPORTAR);

  expect(second.status()).toBe(first.status());
  expect(acknowledges(await first.text())).toBe(false);
  expect(acknowledges(await second.text())).toBe(false);
});

/**
 * No es contenido: es un formulario sobre un aviso. Indexada, competiría con la
 * ficha —la página que este producto necesita que Google lea— por el mismo
 * aviso, y con una copia que no dice nada del inmueble.
 */
test("no se indexa", async ({ page }) => {
  await page.goto(REPORTAR);

  const robots = page.locator('meta[name="robots"]');
  await expect(robots).toHaveAttribute("content", /noindex/);
  await expect(robots).toHaveAttribute("content", /nofollow/);
});

/**
 * La guarda de la página, en un navegador: un segmento que no nombra ningún
 * aviso no dibuja un formulario que reportaría algo que no existe.
 */
test("un slug sin aviso adentro no ofrece reportar", async ({ page }) => {
  const response = await page.goto("/alquiler/caracas/chacao/no-hay-id-aca/reportar");

  expect(response?.status()).toBe(404);
  expect(await page.content()).not.toMatch(/<form[^>]*method=["']?post/i);
});
