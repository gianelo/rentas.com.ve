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

    const box = await page.getByTestId("publish-column").locator("form").boundingBox();
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

/**
 * The column, not just the form (3.9). The first version of these
 * measurements bounded the `<form>` — which `FormShell` already capped — and
 * nothing bounded the column around it. On a 1280 screen the heading sat
 * against the left edge while the fields floated centred, and every test
 * passed. The bound was on the wrong element.
 */
test.describe("publish column measurement (3.9)", () => {
  test("3.9: the whole column is 600px and centred at 1280px, heading included", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.goto("/measure");

    // The SHELL, not the <main> around it. The page is fluid on purpose --
    // it carries vertical rhythm and a safety margin -- and FormShell is the
    // thing that owns the 600px column. Pointing this at the page was the
    // same mis-aimed bound as before, in the other direction.
    const column = await page.getByTestId("publish-column").locator("> div").boundingBox();
    const title = await page.getByTestId("publish-title").boundingBox();
    if (!column || !title) throw new Error("shell/title did not render a measurable box");

    console.log(`[3.9] shell x=${column.x} width=${column.width} (bound: <= 600, centred)`);
    expect(column.width).toBeLessThanOrEqual(600);
    // Centred: equal space either side of a 1280 viewport.
    expect(Math.abs(column.x - (1280 - column.x - column.width))).toBeLessThanOrEqual(2);

    // The heading starts where the column starts. If the column were fluid
    // this would be near zero while the form sat in the middle — which is
    // exactly what shipped.
    expect(Math.abs(title.x - column.x)).toBeLessThanOrEqual(20);
  });

  test("3.9: the heading and the fields share a left edge", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.goto("/measure");

    const title = await page.getByTestId("publish-title").boundingBox();
    const field = await page.locator("#title").boundingBox();
    if (!title || !field) throw new Error("title/field did not render a measurable box");

    console.log(`[3.9] title.x=${title.x} field.x=${field.x} (bound: same edge)`);
    // A page whose heading and inputs do not line up reads as two screens
    // stacked, and that is what a fluid container around a capped form looks
    // like from the outside.
    expect(Math.abs(title.x - field.x)).toBeLessThanOrEqual(20);
  });
});

/**
 * Artboard 2a's two metadata sentences (5.7). The city and the age are in the
 * DOM at every width — a crawler with no viewport should read the fuller one
 * — and only 1280 shows them. Markup tests cannot tell those apart; this can.
 */
test.describe("result row metadata (5.7)", () => {
  test("5.7: the phone row hides city and age", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 900 });
    await page.goto("/measure");

    const meta = page.getByTestId("result-row").first().locator("p");
    const visible = await meta.innerText();
    const inDom = await meta.innerHTML();

    console.log(`[5.7] 360px visible: ${JSON.stringify(visible)}`);
    // Present, and not shown. Removing it from the DOM instead would cost the
    // indexable sentence D11 wants.
    expect(inDom).toContain("Distrito Capital");
    expect(visible).not.toContain("Distrito Capital");
    expect(visible).not.toContain("hace 2 días");
  });

  test("5.7: at 1280 the same row reads the fuller sentence", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/measure");

    const visible = await page.getByTestId("result-row").first().locator("p").innerText();

    console.log(`[5.7] 1280px visible: ${JSON.stringify(visible)}`);
    expect(visible).toContain("Distrito Capital");
    expect(visible).toContain("hace 2 días");
  });
});
