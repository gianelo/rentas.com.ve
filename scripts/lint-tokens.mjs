#!/usr/bin/env node
// Enforces design decision D16 (design.md): no component style may write a
// colour literal, a corner radius, a thumbnail dimension, or a type size as
// a value instead of a CSS custom property. "guarantees live in the
// narrowest API" — this script is the guarantee; a review habit is not.
//
// Scope: component-facing style sources under `components/` and `app/`,
// using CSS declaration syntax (`property: value;` — plain CSS, CSS
// Modules, or a CSS-in-JS template literal). Declarations written as
// JavaScript objects (e.g. `{ borderRadius: "12px" }`) are out of scope
// for this iteration; PR1b-a's styling approach is CSS Modules (plain CSS
// declaration syntax), which this script already reads natively.
//
// `src/styles/tokens.css` is exempt on purpose — it is where the token
// values are legitimately declared. `design/reference/**` is exempt too:
// it is a versioned prototype, explicitly never ported into production
// component code (design.md, Phase 1b). This script also reads
// `src/styles/tokens.css` itself (not to lint it, but as the single
// source of truth for two checks below).
//
// The four rules are NOT equally strong, and it matters that a reader knows
// which is which rather than trusting the gate uniformly:
//
//   - colour, border-radius, font-size are BLANKET rules. Any literal is
//     rejected. These are the strong ones.
//   - width/height is a TARGETED rule. It rejects only values that exactly
//     match the shipped layout's thumbnail tokens (--tw/--th/--twd/--thd).
//     A different literal — `width: 45px` on a thumbnail — passes.
//
// That asymmetry is deliberate, not an oversight: only dimensions that vary
// with `data-layout` have to be tokenized for a structure swap to repaint.
// The structural values SISTEMA.md fixes (the 1100px container, the 240px
// sidebar, the 640px/420px detail split) are identical across all four
// structures, are not tokenized anywhere, and a blanket rule would reject
// the layout primitives themselves. But the consequence is real: this rule
// catches a copied token value, not every hard-coded dimension. If the
// thumbnail geometry is ever inlined at a near-miss value, no gate catches
// it — review does.
//
// Two checks run:
//   1. Literal-value scan (tasks.md 1b.3) — no component style file may
//      write a colour literal, a corner radius, a thumbnail dimension, or
//      a type size as a value instead of a custom property.
//   2. Theme contract (tasks.md 1b.4) — swapping data-theme on the root
//      element must repaint every themed value, with none left behind.
//      Verified statically: every custom property declared in the shipped
//      light theme ([data-theme="menta"]) must also be declared in the
//      shipped dark theme ([data-theme="oscuro"]), and vice versa, with a
//      different value on each side. A property missing from one side, or
//      identical on both, is exactly the kind of literal leak the
//      inspector-flip criterion (SISTEMA.md) is meant to catch — an
//      element carrying it would not repaint, and would retain its
//      previous colour.

import { readdirSync, readFileSync } from "node:fs";
import { extname, join, relative } from "node:path";

const SCAN_ROOTS = ["components", "app"];
const SCAN_EXTENSIONS = new Set([".css", ".tsx", ".ts"]);
const TOKENS_CSS_PATH = "src/styles/tokens.css";
const LAYOUT_SELECTOR = '[data-layout="compacto"]';
const LIGHT_THEME_SELECTOR = '[data-theme="menta"]';
const DARK_THEME_SELECTOR = '[data-theme="oscuro"]';

/** Geometry, not colour. Kept deliberately identical in both themes. */
const SHARED_ACROSS_THEMES = new Set(["--r", "--rs"]);
// Thumbnail-geometry custom properties (design/reference/sistema/tokens.css):
// mobile width/height and desktop width/height for the result-row thumbnail.
const THUMBNAIL_TOKEN_NAMES = ["--tw", "--th", "--twd", "--thd"];

const COLOUR_PROPERTIES = new Set([
  "color",
  "background",
  "background-color",
  "border-color",
  "fill",
  "stroke",
]);

// Shorthand properties that commonly embed a colour literal alongside other
// values (e.g. `border: 1px solid #fff`), where the "value starts with
// var(" check used for simple properties does not apply.
const SHORTHAND_COLOUR_PROPERTIES = new Set([
  "border",
  "border-top",
  "border-bottom",
  "border-left",
  "border-right",
  "outline",
  "box-shadow",
]);

const COLOUR_LITERAL_PATTERN = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\([^)]*\)/;
const ZERO_PATTERN = /^0(\.0+)?(px|%|em|rem)?$/;

// Matches one CSS declaration and captures its property name and raw value.
const DECLARATION_PATTERN = new RegExp(
  `\\b(${[...COLOUR_PROPERTIES, ...SHORTHAND_COLOUR_PROPERTIES, "border-radius", "font-size", "width", "height"].join("|")})\\s*:\\s*([^;]+);`,
  "g",
);

/**
 * Colour literals may appear inside a shorthand value alongside other
 * tokens (e.g. `1px solid #fff`), and `var(...)` calls may legitimately
 * carry a literal colour fallback (`var(--x, #fff)`), which is explicitly
 * allowed. Stripping every well-formed `var(...)` call first means both
 * simple and shorthand values can be tested the same way: whatever is left
 * over must contain no colour literal.
 */
function containsLiteralColour(rawValue) {
  const withoutVarCalls = rawValue.replace(/var\([^)]*\)/g, "");
  return COLOUR_LITERAL_PATTERN.test(withoutVarCalls);
}

function isZero(value) {
  return ZERO_PATTERN.test(value.trim());
}

/**
 * Decide whether a declaration's value is a forbidden literal.
 *
 * @param {string} property
 * @param {string} rawValue
 * @param {Set<string>} thumbnailDimensions px values (e.g. "44px") pulled
 *   from the shipped layout's --tw/--th/--twd/--thd tokens. Only a width or
 *   height literal matching one of these is a "thumbnail dimension" under
 *   D16 — every other fixed width/height is a structural layout dimension
 *   (the 1100px container, the 240px sidebar, the 640px/420px detail
 *   split...) that SISTEMA.md specifies as a literal on purpose and that
 *   tokens.css does not tokenize.
 */
function classifyViolation(property, rawValue, thumbnailDimensions) {
  const value = rawValue.trim();

  if (COLOUR_PROPERTIES.has(property) || SHORTHAND_COLOUR_PROPERTIES.has(property)) {
    return containsLiteralColour(value)
      ? "colour literal (hex or rgb/rgba/hsl/hsla function)"
      : null;
  }
  if (property === "border-radius") {
    if (isZero(value)) return null;
    return value.startsWith("var(") ? null : "corner radius literal";
  }
  if (property === "font-size") {
    return value.startsWith("var(") ? null : "type size literal";
  }
  if (property === "width" || property === "height") {
    if (isZero(value)) return null;
    return thumbnailDimensions.has(value)
      ? "thumbnail dimension literal (matches src/styles/tokens.css's --tw/--th/--twd/--thd — use the custom property, not the value)"
      : null;
  }
  return null;
}

function collectFiles(root) {
  /** @type {string[]} */
  const files = [];
  let entries;
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return files;
    throw error;
  }

  for (const entry of entries) {
    const fullPath = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(fullPath));
    } else if (SCAN_EXTENSIONS.has(extname(entry.name))) {
      files.push(fullPath);
    }
  }
  return files;
}

function findViolations(filePath, thumbnailDimensions) {
  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n");
  /** @type {{ file: string, line: number, rule: string, snippet: string }[]} */
  const violations = [];

  lines.forEach((lineText, index) => {
    DECLARATION_PATTERN.lastIndex = 0;
    let match = DECLARATION_PATTERN.exec(lineText);
    while (match) {
      const [, property, rawValue] = match;
      const rule = classifyViolation(property, rawValue, thumbnailDimensions);
      if (rule) {
        violations.push({
          file: relative(process.cwd(), filePath),
          line: index + 1,
          rule,
          snippet: lineText.trim(),
        });
      }
      match = DECLARATION_PATTERN.exec(lineText);
    }
  });

  return violations;
}

/** Extracts the raw declaration body of a `selector { ... }` block (first match only). */
export function extractBlock(cssText, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`);
  const match = cssText.match(pattern);
  return match ? match[1] : null;
}

export function parseCustomProperties(blockBody) {
  const declarations = new Map();
  const pattern = /(--[\w-]+)\s*:\s*([^;]+);/g;
  let match = pattern.exec(blockBody);
  while (match) {
    declarations.set(match[1], match[2].trim());
    match = pattern.exec(blockBody);
  }
  return declarations;
}

function readTokensCss() {
  try {
    return readFileSync(TOKENS_CSS_PATH, "utf-8");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

/**
 * Resolves `var(--x)` indirection to the value it ultimately names.
 *
 * The theme contract compares light against dark, and the dark block reaches
 * its palette through indirection (`--ink: var(--dark-ink)`) so the same
 * values can serve both the explicit `[data-theme="oscuro"]` block and the
 * `prefers-color-scheme` path without being written twice. Comparing the raw
 * declaration strings would therefore compare `#1e2022` against
 * `var(--dark-ink)` — always different, always passing, even when
 * `--dark-ink` resolves to that exact same colour. The gate would report a
 * contract it never checked, which is worse than having no gate: it is a
 * green light nobody earned.
 *
 * The depth bound both terminates a circular reference and keeps a
 * pathological chain from hanging the build.
 */
export function resolveValue(value, dictionary, depth = 0) {
  if (depth > 8) return value;

  const resolved = value.replace(/var\(\s*(--[\w-]+)\s*(?:,[^)]*)?\)/g, (whole, name) => {
    const target = dictionary.get(name);
    return target === undefined ? whole : resolveValue(target, dictionary, depth + 1);
  });

  return resolved === value ? value : resolveValue(resolved, dictionary, depth + 1);
}

/** Every custom property declared anywhere in the file, for resolution only. */
export function collectAllCustomProperties(cssText) {
  const declarations = new Map();
  const pattern = /(--[\w-]+)\s*:\s*([^;]+);/g;
  let match = pattern.exec(cssText);
  while (match) {
    if (!declarations.has(match[1])) declarations.set(match[1], match[2].trim());
    match = pattern.exec(cssText);
  }
  return declarations;
}

/** tasks.md 1b.4 — the theme-contract check. */
function checkThemeContract(cssText) {
  if (cssText === null) {
    return [`${TOKENS_CSS_PATH} not found — cannot verify the theme contract (1b.4).`];
  }

  const lightBlock = extractBlock(cssText, LIGHT_THEME_SELECTOR);
  const darkBlock = extractBlock(cssText, DARK_THEME_SELECTOR);
  const issues = [];

  if (!lightBlock) issues.push(`${TOKENS_CSS_PATH}: missing ${LIGHT_THEME_SELECTOR} block.`);
  if (!darkBlock) issues.push(`${TOKENS_CSS_PATH}: missing ${DARK_THEME_SELECTOR} block.`);
  if (issues.length > 0) return issues;

  const dictionary = collectAllCustomProperties(cssText);
  const light = parseCustomProperties(lightBlock);
  const dark = parseCustomProperties(darkBlock);
  const allKeys = new Set([...light.keys(), ...dark.keys()]);

  for (const key of allKeys) {
    if (!light.has(key)) {
      issues.push(
        `${TOKENS_CSS_PATH}: "${key}" is declared in ${DARK_THEME_SELECTOR} but not ${LIGHT_THEME_SELECTOR} — an element using it would keep the dark value when swapped to menta.`,
      );
      continue;
    }
    if (!dark.has(key)) {
      issues.push(
        `${TOKENS_CSS_PATH}: "${key}" is declared in ${LIGHT_THEME_SELECTOR} but not ${DARK_THEME_SELECTOR} — an element using it would keep its previous colour when swapped to oscuro.`,
      );
      continue;
    }
    const lightValue = resolveValue(light.get(key), dictionary);
    const darkValue = resolveValue(dark.get(key), dictionary);

    // Geometry may legitimately be identical across themes, and since the
    // 2026-08-18 design update it is: the founder's dark palette keeps
    // menta's 12px radius and its pill. A shared radius is not an unthemed
    // value leaking through — it is the same product at night. Colour is
    // what must repaint, and everything outside this pair still must.
    if (SHARED_ACROSS_THEMES.has(key)) continue;

    if (lightValue === darkValue) {
      const via =
        light.get(key) === lightValue ? "" : ` (declared as ${light.get(key)} / ${dark.get(key)})`;
      issues.push(
        `${TOKENS_CSS_PATH}: "${key}" resolves to the same value in ${LIGHT_THEME_SELECTOR} and ${DARK_THEME_SELECTOR} — ${lightValue}${via} — so swapping data-theme would not repaint it.`,
      );
    }
  }

  return issues;
}

function getThumbnailDimensionValues(cssText) {
  if (cssText === null) return new Set();
  const layoutBlock = extractBlock(cssText, LAYOUT_SELECTOR);
  if (!layoutBlock) return new Set();
  const declarations = parseCustomProperties(layoutBlock);
  const values = new Set();
  for (const name of THUMBNAIL_TOKEN_NAMES) {
    const value = declarations.get(name);
    if (value) values.add(value);
  }
  return values;
}

function main() {
  const tokensCss = readTokensCss();
  const thumbnailDimensions = getThumbnailDimensionValues(tokensCss);
  const themeContractIssues = checkThemeContract(tokensCss);

  const files = SCAN_ROOTS.flatMap((root) => collectFiles(root));

  if (files.length === 0) {
    console.log(
      "lint:tokens: 0 component style files scanned under components/, app/ " +
        "(directories do not exist yet) — passing trivially.",
    );
  } else {
    console.log(`lint:tokens: ${files.length} component style file(s) scanned.`);
  }

  const styleViolations = files.flatMap((file) => findViolations(file, thumbnailDimensions));

  if (styleViolations.length === 0 && themeContractIssues.length === 0) {
    console.log(
      "lint:tokens: no literal values found; the theme contract holds across " +
        `${LIGHT_THEME_SELECTOR} and ${DARK_THEME_SELECTOR} (1b.3, 1b.4).`,
    );
    process.exit(0);
  }

  if (styleViolations.length > 0) {
    console.error(
      "\nlint:tokens: literal design values found — use a CSS custom property (D16).\n",
    );
    for (const violation of styleViolations) {
      console.error(`  ${violation.file}:${violation.line}  [${violation.rule}]`);
      console.error(`    ${violation.snippet}`);
    }
  }

  if (themeContractIssues.length > 0) {
    console.error(
      "\nlint:tokens: theme contract violations — swapping data-theme would not repaint every value (D16/1b.4).\n",
    );
    for (const issue of themeContractIssues) {
      console.error(`  ${issue}`);
    }
  }

  const total = styleViolations.length + themeContractIssues.length;
  console.error(`\n${total} violation(s) found.`);
  process.exit(1);
}

main();
