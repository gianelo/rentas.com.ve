import { expect, test } from "@playwright/test";

/**
 * The first specs in this directory, and the reason they exist is worth
 * stating: **`tests/e2e/` was empty**, so the `e2e` job installed a browser,
 * ran for three minutes, and asserted nothing. CI printed the warning on
 * every push — "this step currently cannot fail" — and it was reported as a
 * passing gate anyway. A gate that cannot fail is worse than no gate: it
 * spends time and buys confidence it has not earned.
 *
 * These run against a real preview deployment, and the `crawlability`
 * project runs the same file with **scripting disabled**, which is how D13's
 * "the read path ships no JavaScript" stops being a claim and becomes a
 * measurement.
 */

/**
 * True only when the suite is pointed at a real deployment. Without a
 * `VERCEL_AUTOMATION_BYPASS_SECRET` to get past Vercel's SSO wall, the suite
 * falls back to a production build served locally against a DELIBERATELY
 * unroutable database -- the same fake `DATABASE_URL` the build job carries,
 * so a change that breaks the pooled-endpoint guard fails in CI instead of at
 * deploy time.
 *
 * That fallback can prove the auth read paths, which never reach the
 * database when no session cookie is present. It cannot prove anything that
 * reads the catalogue.
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

test("the root IS the search, not a landing page that links to it", async ({ page }) => {
  // Skipped rather than weakened. The alternative was asserting something
  // the fallback CAN answer -- that `/` responds at all -- and an assertion
  // that passes against a 500 is worse than an absent one, because it
  // reports the read path as covered. What this needs is the bypass secret
  // set on the repository, and then it runs everywhere.
  test.skip(
    !conCatalogo,
    "needs a real catalogue: no preview deployment and no local e2e harness (tasks.md 11.22)",
  );

  const response = await page.goto("/");

  expect(response?.status()).toBe(200);
  // One heading, and it describes the site rather than the result count.
  // Artboard 2a gives this screen no heading at all, which is fine for a
  // results page reached from elsewhere and wrong for the strongest URL on
  // the domain — so it exists and is visually hidden.
  await expect(page.locator("h1")).toHaveCount(1);
  // The wordmark is lowercase with a period — it IS the mark, and a
  // capitalised "Rentas" means somebody retyped it from memory.
  //
  // **Acotada al encabezado desde la 23.1, y no por gusto**: el pie del sitio
  // dibuja el MISMO cuartel en `contentinfo`, así que sin acotar hay dos
  // coincidencias y el modo estricto de Playwright la rechaza. Lo que esta
  // prueba siempre quiso afirmar es la marca del encabezado — que el pie
  // repita el cuartel es correcto y lo cubren sus propias pruebas.
  await expect(page.getByRole("banner").getByText("rentas.", { exact: true })).toBeVisible();
  // **Esta aserción estaba podrida antes de este trabajo, y nadie lo vio.**
  // Miraba `search-filters`, que es `SearchFilters` — la caja de filtros que
  // vivía en `/` cuando la raíz ERA los resultados. La 14.24 mudó los
  // resultados a `/alquiler/<ciudad>` y la raíz pasó a ser el inicio (14.21),
  // así que ese testid dejó de existir acá hace varios PRs. Como la prueba se
  // salta sin despliegue, siguió reportándose verde sin poder pasar nunca.
  //
  // Lo que la raíz sí tiene que tener, y es lo que la frase de al lado quería
  // decir, es la búsqueda: no un argumento de venta con un botón.
  await expect(page.getByRole("searchbox")).toBeVisible();
});

test("publishing is refused without a session, and remembers where you were going", async ({
  page,
}) => {
  await page.goto("/publicar");

  // The redirect is the account-identity spec's protected action working end
  // to end: an anonymous visitor never reaches the form, and signing in
  // returns them to it rather than dropping them on the home page having
  // lost what they came to do.
  await expect(page).toHaveURL(/\/signin\?callbackUrl=%2Fpublicar$/);
});

test("the sign-in page offers Google and nothing else", async ({ page }) => {
  const response = await page.goto("/signin");

  expect(response?.status()).toBe(200);
  // No password field, no email field, no SMS. The spec says one provider,
  // and a second entry point appearing here is a real regression rather than
  // a cosmetic one.
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
});
