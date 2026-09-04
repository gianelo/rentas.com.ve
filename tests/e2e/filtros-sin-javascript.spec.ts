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
/**
 * **Un catálogo de verdad, venga de donde venga** (tasks.md 11.22).
 *
 * Antes esto era `Boolean(PLAYWRIGHT_BASE_URL)` y el comentario de arriba
 * explicaba por qué: el respaldo local compilaba contra una `DATABASE_URL`
 * deliberadamente inalcanzable, así que todo lo que lee el catálogo sólo podía
 * contestar 500. Ya no — `scripts/neon-http-proxy.mjs` más `scripts/seed-e2e.ts`
 * le dan a la compilación local un Postgres real con dos ciudades sembradas, y
 * esta prueba deja de saltarse en cada corrida.
 */
const conCatalogo = Boolean(process.env.PLAYWRIGHT_BASE_URL || process.env.TEST_DATABASE_URL);

test.beforeEach(() => {
  test.skip(
    !conCatalogo,
    "needs a real catalogue: no preview deployment and no local e2e harness (tasks.md 11.22)",
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
  //
  // **Se apunta al ENCABEZADO del grupo y no a un texto suelto**, y es una
  // corrección: `getByText("Precio")` también alcanzaba el botón «Usar este
  // precio» del grupo abierto, así que la prueba caía por ambigüedad. Nadie lo
  // vio porque este archivo se saltaba solo desde que se escribió — es la
  // segunda prueba de este repositorio que se pudre detrás de un `test.skip`,
  // y la razón por la que la 11.22 existe.
  await expect(panel.getByRole("heading", { name: "Precio" })).toBeVisible();
  await expect(panel.getByRole("heading", { name: "Quién publica" })).toBeVisible();
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

/**
 * **El filtro de baños, sin una línea de JavaScript** (14.45).
 *
 * Lo que se mide acá es lo que el conteo hace posible: cada escalón es un
 * enlace `GET` con su número al lado, así que el servidor vuelve a contar con
 * la dirección que llega y el número no puede quedar desfasado — no hay estado
 * en el cliente que pueda desfasarse. Con el script apagado, un control que se
 * dibujara sólo al hidratar dejaría el grupo del tamaño a la mitad.
 */
test("los baños se eligen desde la dirección, con su conteo al lado", async ({ page }) => {
  await page.goto("/alquiler/distrito-capital?filtros=habitaciones");

  const grupo = page.locator("#filtros-habitaciones");
  await expect(grupo.getByRole("heading", { name: "Baños" })).toBeVisible();

  // La segunda tira del grupo es la de baños: la primera son las habitaciones,
  // y las dos comparten grupo porque la lámina 7b las dibuja en una columna.
  const banos = grupo.locator("ul").nth(1);
  await expect(banos.getByRole("listitem")).toHaveCount(3);
  // El «3+» no lleva a ninguna parte: la siembra no tiene ningún aviso de tres
  // baños, y ninguna opción lleva a un vacío (regla transversal 4).
  await expect(banos.locator('[aria-disabled="true"]')).toHaveCount(1);

  await banos.getByRole("link").last().click();

  await expect(page).toHaveURL(/banos=2/);
  // Y el renglón del grupo lo dice: el resumen nombra los baños, no sólo las
  // habitaciones.
  await expect(grupo.getByRole("heading").first()).toContainText("2 baños");
});

/**
 * **El puesto de estacionamiento, sin una línea de JavaScript** (14.45
 * rebanada C).
 *
 * Es la sexta opción del grupo y **la única derivada**: su número sale de
 * `parking_spots > 0` y no de una columna booleana. Lo que se mide acá es que
 * eso no se note desde afuera — mismo enlace `GET`, mismo «n de m» al lado,
 * misma dirección compartible. Y que el número **no sea el total**: la siembra
 * de Distrito Capital tiene dos avisos y uno sin puesto, así que un conteo que
 * dijera «2 de 2» sería la derivación sin aplicar el umbral. Ese cero está en
 * `scripts/seed-e2e.ts` a propósito y con la razón escrita al lado.
 */
test("el puesto es la sexta opción, con su conteo derivado del número", async ({ page }) => {
  await page.goto("/alquiler/distrito-capital?filtros=atributos");

  const grupo = page.locator("#filtros-atributos");
  const opciones = grupo.locator("ul").first();
  await expect(opciones.getByRole("listitem")).toHaveCount(6);

  const puesto = opciones.getByRole("listitem").filter({ hasText: "Puesto de estacionamiento" });
  await expect(puesto).toHaveCount(1);
  // El «n de m» con n < m: el aviso sin puesto queda afuera del conteo.
  await expect(puesto).toContainText("1 de 2");

  await puesto.getByRole("link").click();

  await expect(page).toHaveURL(/puesto=1/);
  // El renglón cerrado del grupo lo nombra: en el teléfono el acordeón lo
  // esconde, y un resumen que lo omitiera dejaría el filtro puesto e invisible.
  await expect(grupo.getByRole("heading").first()).toContainText("puesto");
});
