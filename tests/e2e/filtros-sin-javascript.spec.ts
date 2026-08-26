import { expect, test } from "@playwright/test";

/**
 * **El panel de filtros, con JavaScript apagado** (14.32, 14.33).
 *
 * Existe por una regresión concreta y no por completitud: la 14.33 le sacó a la
 * pantalla de resultados la barra lateral, así que **los filtros pasaron a
 * llegar por un solo camino** — el control de filtro de la pastilla. Ese camino
 * es `filtersHref`, *"la misma URL con el panel abierto desde el servidor"*
 * (14i), y si alguna vez se convirtiera en un manejador de clic, el panel
 * dejaría de existir para quien se quedó sin bundle. Antes eso costaba una
 * molestia; ahora cuesta la única forma de filtrar que hay.
 *
 * El proyecto `crawlability` corre este archivo con `javaScriptEnabled: false`,
 * que es lo que convierte "anda sin JavaScript" en una medición y no en una
 * afirmación.
 *
 * **Por qué se salta sin despliegue, y no se debilita.** `/alquiler/<ciudad>`
 * consulta el catálogo y las facetas antes de dibujar nada, así que el respaldo
 * local —una compilación de producción contra una `DATABASE_URL`
 * deliberadamente inalcanzable— sólo puede contestar 500. Afirmar contra eso
 * reportaría el camino de lectura como cubierto sin haberlo tocado. Es la misma
 * decisión que `busqueda-inicio.spec.ts` ya dejó escrita.
 *
 * Mientras tanto la mitad determinista corre en cada `push`, y no es poca:
 * `tests/measure/layout.spec.ts` mide en un navegador real cuántos grupos se
 * dibujan a 360 y a 1280, `components/organisms/SearchPanel.test.tsx` prueba
 * que cerrado no dibuje nada y que abierto sea un diálogo con salida, y
 * `app/alquiler/[ciudad]/filtros-contract.test.ts` ata las dos páginas al
 * dominio.
 */
const againstADeployment = Boolean(process.env.PLAYWRIGHT_BASE_URL);

test.beforeEach(() => {
  test.skip(
    !againstADeployment,
    "needs a real database: the local fallback build points at an unroutable host",
  );
});

test("el filtro de la pastilla abre el panel sin una línea de JavaScript", async ({ page }) => {
  await page.goto("/alquiler/distrito-capital");

  // Cerrado no dibuja nada: no hay filtros escondidos esperando un script.
  await expect(page.getByTestId("search-panel")).toHaveCount(0);

  // El control de filtro es un enlace real, y con el script apagado es lo
  // único que puede navegar.
  await page.getByRole("link", { name: /filtros/i }).click();

  const panel = page.getByTestId("search-panel");
  await expect(panel).toBeVisible();
  // Los cuatro grupos que quedaron después de la 14.36. La ubicación no está:
  // eso lo resuelve el texto de la pastilla.
  await expect(panel.getByText("Precio")).toBeVisible();
  await expect(panel.getByText("Quién publica")).toBeVisible();
  await expect(panel).not.toContainText("¿En qué ciudad?");

  // Y la salida también es una dirección: cerrar devuelve a la misma búsqueda.
  await page.getByRole("link", { name: "Cerrar los filtros" }).click();
  await expect(page.getByTestId("search-panel")).toHaveCount(0);
  await expect(page).toHaveURL(/\/alquiler\/distrito-capital$/);
});

test("una dirección vieja con un grupo que ya no existe abre el panel y lo explica", async ({
  page,
}) => {
  // `?filtros=zona` es el enlace pegado en un chat antes de que la 14.36 sacara
  // la ubicación del panel. Se ignora con un aviso, nunca con un 404 (14.23b).
  const response = await page.goto("/alquiler/distrito-capital?filtros=zona");

  expect(response?.status()).toBe(200);
  await expect(page.getByTestId("search-panel")).toBeVisible();
  await expect(page.getByText(/ya no existe/)).toBeVisible();
});
