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
