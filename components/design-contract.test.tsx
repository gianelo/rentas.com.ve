import { readdirSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { describe, expect, it } from "vitest";
import * as buttons from "./atoms/buttons";
import { contrastRatio, relativeLuminance, themeColor } from "./contrast";

const buttonCss = readFileSync("components/atoms/Button.module.css", "utf-8");
const badgeCss = readFileSync("components/atoms/PublisherBadge.module.css", "utf-8");
const priceCss = readFileSync("components/atoms/Price.module.css", "utf-8");
const buttonsSource = readFileSync("components/atoms/buttons.tsx", "utf-8");
const tokensCss = readFileSync("src/styles/tokens.css", "utf-8");

function block(css: string, selector: string): string {
  const match = css.match(new RegExp(`\\.${selector}\\s*\\{([^}]*)\\}`));
  if (!match) throw new Error(`missing .${selector} block`);
  return match[1] ?? "";
}

// 1b.6 — three distinct button components, not one component with a
// free-form variant prop.
describe("button hierarchy (1b.6)", () => {
  it("exports three distinct components, no shared variant prop", () => {
    expect(typeof buttons.ActionButton).toBe("function");
    expect(typeof buttons.SelectionButton).toBe("function");
    expect(typeof buttons.NeutralButton).toBe("function");
    // Props is exactly ButtonHTMLAttributes — no added `variant` field a
    // caller could pass to blend two hierarchy levels.
    expect(buttonsSource).toContain("type Props = ButtonHTMLAttributes<HTMLButtonElement>;");
    expect(buttonsSource).not.toMatch(/variant\s*[:?]/);
  });

  it("action is filled --accent; selection is --tint fill + --accent border; neutral is --strong border, no fill", () => {
    expect(block(buttonCss, "action")).toContain("background: var(--accent)");
    expect(block(buttonCss, "selection")).toContain("background: var(--tint)");
    expect(block(buttonCss, "selection")).toContain("border: 1px solid var(--accent)");
    expect(block(buttonCss, "neutral")).toContain("background: none");
    expect(block(buttonCss, "neutral")).toContain("border: 1px solid var(--strong)");
  });
});

// 1b.16 — keyboard focus visibly indicated on every interactive atom.
describe("focus visibility (1b.16)", () => {
  it.each(["action", "selection", "neutral"])(
    "%s has a non-none :focus-visible outline",
    (level) => {
      const rule = buttonCss.match(new RegExp(`\\.${level}:focus-visible\\s*\\{([^}]*)\\}`));
      expect(rule).not.toBeNull();
      const outline = rule?.[1]?.match(/outline:\s*([^;]+);/)?.[1]?.trim();
      expect(outline).toBeDefined();
      expect(outline).not.toBe("none");
      expect(outline).not.toMatch(/^0(px)?( |$)/);
    },
  );
});

// 1b.7 — publisher_type badge distinguishable with colour removed.
describe("publisher badge greyscale legibility (1b.7)", () => {
  it("owner is filled (background) and broker is outlined (border, no fill) — structural, survives greyscale by construction", () => {
    expect(block(badgeCss, "owner")).toContain("background: var(--ink)");
    expect(block(badgeCss, "broker")).toContain("background: none");
    expect(block(badgeCss, "broker")).toContain("border: 1px solid var(--strong)");
  });

  it.each(["menta", "oscuro"] as const)(
    "%s: owner fill is legible against --surface (luminance apart, contrast >= 4.5)",
    (theme) => {
      const ink = themeColor(theme, "--ink");
      const surface = themeColor(theme, "--surface");
      expect(Math.abs(relativeLuminance(ink) - relativeLuminance(surface))).toBeGreaterThan(0.3);
      expect(contrastRatio(ink, surface)).toBeGreaterThanOrEqual(4.5);
    },
  );
});

// 1b.9 — price uses the monospace stack with tabular-nums.
describe("price typography (1b.9)", () => {
  it("declares --disp font-family and tabular-nums", () => {
    expect(priceCss).toContain("font-family: var(--disp)");
    expect(priceCss).toContain("font-variant-numeric: tabular-nums");
  });
});

// 1b.15 — WCAG AA text contrast for every token pair actually in use, both
// shipped themes. All pairs here are normal-size text (11-15px), so the
// 4.5:1 threshold applies uniformly — none qualifies for the 3:1 large-text
// exception.
describe("WCAG AA contrast (1b.15)", () => {
  const pairs: [string, string, string][] = [
    ["--ink", "--surface", "title/price text on row background"],
    ["--soft", "--surface", "metadata text / broker badge text"],
    ["--accent-ink", "--accent", "action button label"],
    ["--accent", "--tint", "selection button label"],
  ];

  for (const theme of ["menta", "oscuro"] as const) {
    describe(theme, () => {
      it.each(pairs)("%s on %s (%s) >= 4.5:1", (fg, bg) => {
        const ratio = contrastRatio(themeColor(theme, fg), themeColor(theme, bg));
        expect(ratio).toBeGreaterThanOrEqual(4.5);
      });
    });
  }
});

// 1b.18 — shipped read-path CSS carries no webfont request, and this
// slice's components carry no runtime JavaScript.
describe("no webfont, no read-path JS (1b.18)", () => {
  it("tokens.css has no @font-face / font url()", () => {
    expect(tokensCss).not.toMatch(/@font-face/);
    expect(tokensCss).not.toMatch(/url\(/);
  });

  it('no shipped atom/molecule declares "use client"', () => {
    const roots = ["components/atoms", "components/molecules"];
    const files = roots.flatMap((root) =>
      readdirSync(root)
        .filter((f) => extname(f) === ".tsx" && !f.includes(".test."))
        .map((f) => join(root, f)),
    );
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      expect(readFileSync(file, "utf-8")).not.toContain('"use client"');
    }
  });
});
