import { expect, test } from "@playwright/test";

/**
 * **El buscador del inicio, con JavaScript apagado** (F14/14.20, tasks.md 14g).
 *
 * Existe por una regresión concreta y no por completitud: la 14g cambió la
 * pieza que dibuja el buscador de `/` — era `SearchBar`, ahora es la pastilla
 * dentro del `Nav` —, y las dos son un `<form method="get">`. El mecanismo
 * sobrevive **sólo si la pastilla se alimenta del mismo `homeSearchForm`**. Un
 * `action` o un `name` escritos a mano en la página dibujan una caja idéntica
 * que no busca nada, y ninguna prueba de dominio se pone roja por eso.
 *
 * El proyecto `crawlability` corre este archivo con `javaScriptEnabled: false`,
 * que es lo que convierte "anda sin JavaScript" en una medición y no en una
 * afirmación. Escribir y enviar acá es el navegador solo.
 *
 * **Por qué se salta sin despliegue, y no se debilita.** `/` consulta el
 * vocabulario y el catálogo antes de dibujar nada, así que el respaldo local
 * —una compilación de producción contra una `DATABASE_URL` deliberadamente
 * inalcanzable— sólo puede contestar 500. Afirmar contra eso reportaría el
 * camino de lectura como cubierto sin haberlo tocado, que es peor que no
 * afirmar nada; es la misma decisión que `publish-access.spec.ts` ya dejó
 * escrita para la raíz. Lo que esta prueba necesita es el secreto de bypass en
 * el repositorio, y entonces corre en todas partes.
 *
 * Mientras tanto la mitad determinista está cubierta y corre en cada `push`:
 * `components/molecules/SearchPill.test.tsx` renderiza la pastilla con el
 * `homeSearchForm` real y comprueba el `method`, el `action`, el nombre del
 * campo y el `submit`; `app/inicio-contract.test.ts` comprueba que la página
 * la arme con ese formulario y no con literales propios.
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

test("buscar desde el inicio es un GET del navegador, sin JavaScript", async ({ page }) => {
  await page.goto("/");

  // **Antes de escribir no hay panel ninguno** (14.52). La mejora no ocupa la
  // pantalla de nadie, y en `crawlability` no puede existir en absoluto — el
  // vocabulario viaja en el marcado, pero quien lo dibuja es una isla.
  await expect(page.getByRole("list", { name: "Sugerencias" })).toHaveCount(0);

  // La caja es un campo real con etiqueta asociada, no un disparador de panel.
  const box = page.getByRole("searchbox");
  await expect(box).toBeVisible();

  await box.fill("Chacao");
  // Enviar el formulario, no tocar un manejador de clic: con el script apagado
  // el botón de la lupa es lo único que puede enviarlo.
  await page.getByRole("button", { name: "Buscar" }).click();

  // El servidor tradujo y redirigió a la ruta del lugar (14.24: no hay
  // `/buscar`; el lugar va en la ruta). Que el destino exista lo prueba el 200.
  await expect(page).toHaveURL(/\/alquiler\/[^/]+\/chacao/);
});

test("lo que no se reconoce contesta «no entendí», nunca «no hay avisos»", async ({ page }) => {
  const response = await page.goto("/?q=zzzz-no-existe-zzzz");

  expect(response?.status()).toBe(200);
  // El texto lo compone el dominio (`noMatchMessage`). Acá se comprueba que la
  // rama siga dibujándose, que es lo que el cambio de encabezado podía romper.
  await expect(page.getByText(/No reconocimos/)).toBeVisible();
});

/**
 * **La mejora que la 14.52 trae a la portada, medida contra datos de verdad.**
 *
 * Con el script cargado, escribir en la pastilla de `/` ofrece las zonas que
 * tienen avisos, con su conteo — el vocabulario acotado que hasta la 14.51 sólo
 * vivía en las dos rutas de búsqueda, porque en `/` no hay ciudad elegida ni
 * facetas de dónde sacarlo.
 *
 * **El número es la aserción entera, y por eso son 2 y no 3.** La siembra de
 * `scripts/seed-e2e.ts` pone tres avisos en Tierra Negra y uno de ellos está
 * **vencido**: un puerto que contara sin mirar el estado diría «3» y esta prueba
 * lo vería. La regla transversal 3 es esa — si una etiqueta dice 2, hay 2 en la
 * pantalla a la que lleva.
 *
 * Sólo en `chromium`: la isla es la mejora, y con el script apagado la ausencia
 * del panel es lo que se afirma arriba.
 */
test("con el script cargado, el inicio ofrece las zonas con avisos y su conteo", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "crawlability", "la lista es la mejora, no el piso");

  await page.goto("/");
  await page.getByRole("searchbox").fill("tierra");

  const opcion = page.getByRole("list", { name: "Sugerencias" }).getByRole("listitem").first();
  await expect(opcion).toContainText("Tierra Negra");
  // El vencido de la misma zona no cuenta: son 2 y no 3.
  await expect(opcion).toContainText("2");

  // Y la sugerencia lleva a la búsqueda de ese lugar, no a un texto libre.
  await opcion.getByRole("link").click();
  await expect(page).toHaveURL(/\/alquiler\/[^/]+\/tierra-negra/);
});
