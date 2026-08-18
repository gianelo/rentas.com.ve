import { expect, test } from "@playwright/test";

/**
 * Real-layout proof for tasks.md 1b.10–1b.12, 1b.14 — the four claims a
 * stylesheet-content assertion cannot honestly prove. Reads genuine
 * rendered geometry (`getBoundingClientRect`, `scrollWidth` vs
 * `clientWidth`) from app/measure, served by playwright.measure.config.ts's
 * own local Next.js dev server. Every assertion logs the measured number so
 * a failure reads as a real value against a real bound, not a bare
 * pass/fail.
 */
test.describe("layout measurement", () => {
  test("1b.10: result row height stays within 96px at 360px, including a wrapped two-line title", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto("/measure");

    const box = await page
      .getByTestId("row-slot-long")
      .locator('[data-testid="result-row"]')
      .boundingBox();
    if (!box) throw new Error("result row did not render a measurable box");

    console.log(`[1b.10] measured row height at 360px: ${box.height}px (bound: <= 96px)`);
    expect(box.height).toBeLessThanOrEqual(96);
  });

  test("1b.11: no horizontal overflow at a 360px viewport", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto("/measure");

    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));

    console.log(
      `[1b.11] scrollWidth=${scrollWidth}px clientWidth=${clientWidth}px (bound: scrollWidth <= clientWidth)`,
    );
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });

  test("1b.12: at 1280px, result rows stay within the 1100px container and body copy is capped at 520px", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/measure");

    const rowBox = await page
      .getByTestId("row-slot-normal")
      .locator('[data-testid="result-row"]')
      .boundingBox();
    if (!rowBox) throw new Error("result row did not render a measurable box");
    console.log(`[1b.12] measured row width at 1280px: ${rowBox.width}px (bound: <= 1100px)`);
    expect(rowBox.width).toBeLessThanOrEqual(1100);

    const bodyBox = await page.getByTestId("body-copy").boundingBox();
    if (!bodyBox) throw new Error("body copy did not render a measurable box");
    console.log(`[1b.12] measured body-copy width at 1280px: ${bodyBox.width}px (bound: <= 520px)`);
    expect(bodyBox.width).toBeLessThanOrEqual(520);
  });

  test("1b.14: interactive targets are >= 44px on mobile and >= 36px on desktop", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto("/measure");

    for (const testid of ["btn-action", "btn-selection", "btn-neutral"]) {
      const box = await page.getByTestId(testid).locator("button").boundingBox();
      if (!box) throw new Error(`${testid} did not render a measurable box`);
      const smallest = Math.min(box.width, box.height);
      console.log(`[1b.14] mobile ${testid}: smallest dimension ${smallest}px (bound: >= 44px)`);
      expect(smallest).toBeGreaterThanOrEqual(44);
    }

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/measure");

    for (const testid of ["btn-action", "btn-selection", "btn-neutral"]) {
      const box = await page.getByTestId(testid).locator("button").boundingBox();
      if (!box) throw new Error(`${testid} did not render a measurable box`);
      const smallest = Math.min(box.width, box.height);
      console.log(`[1b.14] desktop ${testid}: smallest dimension ${smallest}px (bound: >= 36px)`);
      expect(smallest).toBeGreaterThanOrEqual(36);
    }
  });
});

/**
 * Screen 3 (artboard 2c). These exist because the publish form shipped with
 * eleven green tests and nine layout differences from the design: every one
 * of those tests read markup, and none could see geometry. Markup assertions
 * prove a field exists; only a browser proves where it is.
 */
test.describe("publish form measurement (3.9)", () => {
  test("3.9: city and zone sit on one row at 360px, not stacked", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 900 });
    await page.goto("/measure");

    const city = await page.locator("#cityId").boundingBox();
    const zone = await page.locator("#zoneId").boundingBox();
    if (!city || !zone) throw new Error("city/zone selects did not render a measurable box");

    console.log(`[3.9] 360px city.y=${city.y} zone.y=${zone.y} (bound: same row)`);
    // Same row means the same top edge, within a pixel of rounding. The
    // mobile artboard pairs them exactly as the desktop one does, so a
    // stacked pair at 360 is a defect on the viewport designed for first.
    expect(Math.abs(city.y - zone.y)).toBeLessThanOrEqual(1);
    expect(zone.x).toBeGreaterThan(city.x);
  });

  test("3.9: the form column stays within 600px at 1280px", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.goto("/measure");

    const box = await page.getByTestId("publish-form").locator("form").boundingBox();
    if (!box) throw new Error("publish form did not render a measurable box");

    console.log(`[3.9] measured form width at 1280px: ${box.width}px (bound: <= 600px)`);
    // "Una columna de 600" — a wide form loses the relationship between label
    // and field (D14), which is why this is a bound and not a preference.
    expect(box.width).toBeLessThanOrEqual(600);
  });

  test("3.9: no horizontal overflow at 360px, selects included", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 900 });
    await page.goto("/measure");

    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));

    console.log(
      `[3.9] 360px scrollWidth=${overflow.scrollWidth} clientWidth=${overflow.clientWidth}`,
    );
    // Two selects side by side is the likeliest way this breaks: a select
    // sizes to its widest option unless something stops it.
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
  });

  test("3.9: every form control is a real 44px target at 360px", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 900 });
    await page.goto("/measure");

    for (const selector of ["#title", "#priceUsd", "#cityId", "#rooms"]) {
      const box = await page.locator(selector).boundingBox();
      if (!box) throw new Error(`${selector} did not render a measurable box`);
      console.log(`[3.9] mobile ${selector}: height ${box.height}px (bound: >= 44px)`);
      // Declared in CSS is not the same as rendered: a flex parent, a
      // conflicting reset, or a shorthand later in the cascade all silently
      // shrink this, and nobody notices until a thumb misses.
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
  });
});

/**
 * The zone cascade (3.9). This is the spec that should have existed before
 * the form shipped: every other test on this screen hands `cityId` in as a
 * prop, so none of them ever walked the path a person walks — open the page,
 * choose a city, choose a zone. In production the city `<select>` sat inside
 * the POST form with nothing to reload the page, so the zone list stayed
 * empty for every city and the form could never be submitted at all.
 */
test.describe("zone selection (3.9)", () => {
  test("3.9: choosing a city offers that city's zones, with no JavaScript", async ({ browser }) => {
    // Scripting off, because step 1 must work before any bundle arrives —
    // and because a cascade that only works with JS is exactly the defect
    // this test exists to catch.
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto("/measure");

    await page.selectOption("#cityId", { label: "Maracaibo" });

    const zoneOptions = await page.locator("#zoneId option").allTextContents();
    console.log(`[3.9] zone options after choosing Maracaibo: ${JSON.stringify(zoneOptions)}`);

    expect(zoneOptions).toContain("La Lago");
    await context.close();
  });

  test("3.9: every curated zone is reachable, grouped by its city", async ({ page }) => {
    await page.goto("/measure");

    const groups = await page
      .locator("#zoneId optgroup")
      .evaluateAll((nodes) => nodes.map((node) => (node as HTMLOptGroupElement).label));
    console.log(`[3.9] zone groups: ${JSON.stringify(groups)}`);

    // Grouping is what lets one static select serve both cities without
    // JavaScript: the label says which city a zone belongs to, so a
    // mismatched pair is visible before the validator has to explain it.
    expect(groups).toEqual(["Distrito Capital", "Maracaibo"]);
  });
});
