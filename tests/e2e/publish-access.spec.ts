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

test("the root IS the search, not a landing page that links to it", async ({ page }) => {
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
  // The filters are the page. A root that showed a value proposition and a
  // button would be spending the domain's best URL on a click.
  await expect(page.getByTestId("search-filters")).toBeVisible();
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
