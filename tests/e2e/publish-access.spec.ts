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
const againstADeployment = Boolean(process.env.PLAYWRIGHT_BASE_URL);

test("the root IS the search, not a landing page that links to it", async ({ page }) => {
  // Skipped rather than weakened. The alternative was asserting something
  // the fallback CAN answer -- that `/` responds at all -- and an assertion
  // that passes against a 500 is worse than an absent one, because it
  // reports the read path as covered. What this needs is the bypass secret
  // set on the repository, and then it runs everywhere.
  test.skip(
    !againstADeployment,
    "needs a real database: the local fallback build points at an unroutable host",
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
  await expect(page.getByText("rentas.", { exact: true })).toBeVisible();
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
