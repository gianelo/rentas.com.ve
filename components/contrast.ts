import { readFileSync } from "node:fs";

// WCAG contrast helper for tasks.md 1b.7 (badge legible in greyscale) and
// 1b.15 (WCAG AA text contrast). Parses the shipped tokens.css directly —
// never a copy of its hex values — so an edit to a token cannot silently
// desync what the test proves. Kept self-contained (not imported from
// scripts/lint-tokens.mjs) because tsconfig's allowJs:false makes a plain
// .mjs import untypeable under strict mode.
const TOKENS_PATH = "src/styles/tokens.css";

function extractBlock(cssText: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = cssText.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
  if (!match) throw new Error(`tokens.css: missing ${selector} block`);
  return match[1] ?? "";
}

function declarationsIn(block: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    if (m[1] && m[2]) out.set(m[1], m[2].trim());
  }
  return out;
}

function resolve(value: string, dictionary: Map<string, string>, depth = 0): string {
  if (depth > 8) return value;
  const next = value.replace(/var\(\s*(--[\w-]+)\s*(?:,[^)]*)?\)/g, (whole, name) => {
    const target = dictionary.get(name);
    return target === undefined ? whole : resolve(target, dictionary, depth + 1);
  });
  return next === value ? value : resolve(next, dictionary, depth + 1);
}

/** Resolves a custom property to its real hex value for one shipped theme. */
export function themeColor(theme: "menta" | "oscuro", name: string): string {
  const cssText = readFileSync(TOKENS_PATH, "utf-8");
  const dictionary = declarationsIn(cssText);
  const declared = declarationsIn(extractBlock(cssText, `[data-theme="${theme}"]`)).get(name);
  if (!declared) throw new Error(`tokens.css: "${name}" not declared for ${theme}`);
  return resolve(declared, dictionary);
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;
  const n = Number.parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function srgbToLinear(c: number): number {
  const cs = c / 255;
  return cs <= 0.03928 ? cs / 12.92 : ((cs + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

/** WCAG relative luminance, exported for the greyscale-legibility check
 * (1b.7): two colours remain distinguishable in greyscale only if their
 * luminances are meaningfully apart. */
export { relativeLuminance };

/** WCAG 2.x contrast ratio between two hex colours (1:1 to 21:1). */
export function contrastRatio(hexA: string, hexB: string): number {
  const la = relativeLuminance(hexA);
  const lb = relativeLuminance(hexB);
  const [lighter, darker] = la > lb ? [la, lb] : [lb, la];
  return (lighter + 0.05) / (darker + 0.05);
}
