import { expect, test } from "@playwright/test";

/**
 * The site footer's two geometry claims (tasks.md 23.8, 23.10), read from a
 * real rendered page and not from a stylesheet declaration — the same
 * discipline `layout.spec.ts` already established: declared is not drawn.
 *
 * The arnés (`app/measure/page.tsx`) injects the ten real labels the design
 * names, with placeholder destinations. Production's own registry
 * (`app/layout.tsx`) resolves to zero groups today (tasks.md 23.2), which
 * would leave nothing to measure — the harness is what makes these two
 * design claims checkable before a single real destination exists.
 */
test.describe("site footer geometry (23.8, 23.10)", () => {
  test("23.8: at 1280 the footer stays close to the artboard's 210px and does not balloon past it", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 1400 });
    await page.goto("/measure");

    const box = await page.getByTestId("site-footer-harness").locator("footer").boundingBox();
    if (!box) throw new Error("the footer did not render a measurable box");

    console.log(`[23.8] measured desktop footer height: ${box.height}px (artboard: 210px)`);
    // A generous ceiling and not an exact match: the artboard is drawn with
    // the design tool's own font metrics, and this reads the real system
    // font stack (design.md D13 — no webfont). What the claim needs proven
    // is "does not compete with the content", not a pixel-identical number.
    expect(box.height).toBeGreaterThan(100);
    expect(box.height).toBeLessThanOrEqual(260);
  });

  /**
   * **`toBe(44)` and not a lower bound, for the same reason 16.24's own
   * comment in `layout.spec.ts` gives**: 44px is a decided value
   * (`--target-min`), and a lower bound would pass any answer that happened
   * to clear it — this fixes the number so moving the token puts this red
   * with the value it measured.
   */
  test("23.10: at 360 every footer link row measures exactly 44px, and all ten draw at once — no accordion", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 1600 });
    await page.goto("/measure");

    const footer = page.getByTestId("site-footer-harness").locator("footer");
    const rows = footer.locator("ul li a");
    const count = await rows.count();

    console.log(`[23.10] mobile footer link rows drawn: ${count} (bound: === 10)`);
    // "sin acordeón: diez enlaces se leen de una" — the ten links are in the
    // DOM and visible together, not behind a toggle that only reveals some.
    expect(count).toBe(10);

    for (let index = 0; index < count; index += 1) {
      const box = await rows.nth(index).boundingBox();
      if (!box) throw new Error(`footer link row ${index} did not render a measurable box`);
      console.log(`[23.10] mobile row ${index}: height ${box.height}px (bound: === 44px)`);
      expect(box.height).toBe(44);
    }

    // Structural, not visual: no accordion primitive anywhere in the footer.
    const accordions = await footer.locator("details").count();
    expect(accordions).toBe(0);
  });
});
