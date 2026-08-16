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
// for this iteration; the project's actual component styling approach is
// decided in PR1b, and this script is extended then if needed.
//
// `src/styles/tokens.css` is exempt on purpose — it is where the token
// values are legitimately declared. `design/reference/**` is exempt too:
// it is a versioned prototype, explicitly never ported into production
// component code (design.md, Phase 1b).
//
// This script passes trivially today: `components/` and `app/` do not
// exist yet (PR0a). It ships now, ahead of the first component (PR1b), so
// no component is ever written without this guard already active.

import { readdirSync, readFileSync } from "node:fs";
import { extname, join, relative } from "node:path";

const SCAN_ROOTS = ["components", "app"];
const SCAN_EXTENSIONS = new Set([".css", ".tsx", ".ts"]);

const COLOUR_PROPERTIES = new Set([
  "color",
  "background",
  "background-color",
  "border-color",
  "fill",
  "stroke",
]);

const COLOUR_LITERAL_PATTERN = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\([^)]*\)/;
const FIXED_PX_PATTERN = /^\d[\d.]*px$/;

// Matches one CSS declaration and captures its property name and raw value.
const DECLARATION_PATTERN =
  /\b(color|background-color|background|border-color|fill|stroke|border-radius|font-size|width|height)\s*:\s*([^;]+);/g;

/**
 * Decide whether a declaration's value is a forbidden literal.
 * A value that resolves through `var(...)` — with or without a literal
 * fallback — is always allowed; only a bare literal fails.
 */
function classifyViolation(property, rawValue) {
  const value = rawValue.trim();
  if (value.startsWith("var(")) return null;

  if (COLOUR_PROPERTIES.has(property) && COLOUR_LITERAL_PATTERN.test(value)) {
    return "colour literal (hex or rgb/rgba/hsl/hsla function)";
  }
  if (property === "border-radius") {
    return "corner radius literal";
  }
  if (property === "font-size") {
    return "type size literal";
  }
  if ((property === "width" || property === "height") && FIXED_PX_PATTERN.test(value)) {
    return "thumbnail/dimension literal (fixed px width or height)";
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

function findViolations(filePath) {
  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n");
  /** @type {{ file: string, line: number, rule: string, snippet: string }[]} */
  const violations = [];

  lines.forEach((lineText, index) => {
    DECLARATION_PATTERN.lastIndex = 0;
    let match = DECLARATION_PATTERN.exec(lineText);
    while (match) {
      const [, property, rawValue] = match;
      const rule = classifyViolation(property, rawValue);
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

function main() {
  const files = SCAN_ROOTS.flatMap((root) => collectFiles(root));

  if (files.length === 0) {
    console.log(
      "lint:tokens: 0 component style files scanned under components/, app/ " +
        "(directories do not exist yet) — passing trivially.",
    );
    process.exit(0);
  }

  const allViolations = files.flatMap((file) => findViolations(file));

  if (allViolations.length === 0) {
    console.log(`lint:tokens: ${files.length} file(s) scanned, no literal values found.`);
    process.exit(0);
  }

  console.error("lint:tokens: literal design values found — use a CSS custom property (D16).\n");
  for (const violation of allViolations) {
    console.error(`  ${violation.file}:${violation.line}  [${violation.rule}]`);
    console.error(`    ${violation.snippet}`);
  }
  console.error(`\n${allViolations.length} violation(s) in ${files.length} file(s) scanned.`);
  process.exit(1);
}

main();
