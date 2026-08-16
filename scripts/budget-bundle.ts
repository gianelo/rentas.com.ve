#!/usr/bin/env tsx
// Enforces the read-path JavaScript budget from design.md's Performance
// Budget table: "JavaScript on the read path (first load) <= 130 KB". This
// is the fast half of the budget pair (design.md, "Continuous Integration")
// — it reads .next's already-built output, needs no deployment, and it is
// the gate most likely to catch the regression design.md names explicitly:
// someone converts a read-path server component into a client component,
// which silently adds that component's own code to the client JS bundle
// for whichever route renders it.
//
// This script does NOT build the app. `pnpm build` must already have run
// (the CI `budget` job does this before calling `budget:bundle`; run it
// yourself first for a local check).
//
// "Read path" == every app-router PAGE (a manifest key ending in "/page" —
// this excludes route handlers, keyed "/route", and the bare "/layout"
// entry, neither of which is ever navigated to directly in a browser)
// except the ones that are not part of the anonymous discovery surface
// this budget protects:
//   - the authentication flow (`(auth)/**`) — signing in is interaction,
//     not browsing, and D13's "no JS on the read path" promise was never
//     made about it;
//   - `/measure` — the layout-measurement test harness. It already carries
//     its own comment (app/measure/page.tsx) claiming it "adds nothing to
//     the read-path JS/webfont budget"; excluding it here is what makes
//     that claim a checked fact instead of an assertion repeated in two
//     places that could quietly drift apart;
//   - `/_not-found` — Next's built-in 404, not a discovery surface.
//
// Sizes are measured as gzip, not raw file bytes: design.md calls the
// page-level budgets "total transfer", and gzip is the closest cheap proxy
// to what a visitor's browser actually downloads (Vercel serves brotli in
// production, which compresses at least as well as gzip — so this gate can
// only be stricter than reality, never looser).
//
// "30 KB" is read as 30 * 1024 bytes, matching webpack's own
// `performance.maxAssetSize` convention. The exact byte math is printed on
// every run, pass or fail, so the number is never a mystery.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const NEXT_DIR = ".next";
const MANIFEST_PATH = join(NEXT_DIR, "app-build-manifest.json");
// 130 KB, revised 2026-08-16. The original number was 30 KB, and it was
// unreachable: Next.js 15 App Router plus React 19 ship ~102 KB gzip of
// shared framework runtime on every route before a single line of this
// application's code exists. Measured, not estimated — Next's own build
// output reports the same figure. The 30 KB had been set by analogy and
// never checked against the framework floor, the same way the review
// forecast was set without the cost of proof.
//
// 130 = the measured ~102 KB floor plus ~28 KB of headroom, so the original
// intent survives: roughly 30 KB is what THIS codebase may add on top.
//
// The known weakness, recorded rather than hidden: because 102 of these 130
// KB are a constant nobody controls, this gate has far less signal than the
// number suggests. Adding 15 KB of genuinely bad client JavaScript still
// passes. A stricter design was considered and set aside — budget the delta
// above the framework baseline, and separately assert the baseline itself
// has not grown — which would catch application regressions the absolute
// check cannot. If this gate ever fires and the cause turns out to be a
// framework version bump rather than application code, that is the signal
// to switch to measuring the delta.
const BUDGET_BYTES = 130 * 1024;

// Matched against the manifest's route keys (e.g. "/measure/page",
// "/(auth)/signin/page"). `includes` rather than a full-path regex on
// purpose: the exact key shape (leading slash, trailing "/page") is a
// Next.js internal that has changed across versions before, and this gate
// must not silently stop excluding a route just because that shape moved.
const EXCLUDED_ROUTE_SUBSTRINGS = ["(auth)", "/measure", "_not-found"];

type BuildManifest = { pages?: Record<string, string[]> };

function readManifest(): Record<string, string[]> {
  if (!existsSync(MANIFEST_PATH)) {
    console.error(
      `budget:bundle: ${MANIFEST_PATH} not found. Run "pnpm build" first — ` +
        "this gate reads build output, it does not produce it.",
    );
    process.exit(1);
  }

  const parsed: BuildManifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf-8"));
  if (!parsed.pages || typeof parsed.pages !== "object") {
    console.error(
      `budget:bundle: ${MANIFEST_PATH} has no "pages" map — unexpected Next.js build output shape.`,
    );
    process.exit(1);
  }
  return parsed.pages;
}

function isPageRoute(routeKey: string): boolean {
  return routeKey.endsWith("/page");
}

function isReadPathRoute(routeKey: string): boolean {
  return (
    isPageRoute(routeKey) && !EXCLUDED_ROUTE_SUBSTRINGS.some((needle) => routeKey.includes(needle))
  );
}

function jsFilesFor(files: string[]): string[] {
  return files.filter((file) => file.endsWith(".js"));
}

function gzipSizeOf(assetPath: string): number {
  return gzipSync(readFileSync(join(NEXT_DIR, assetPath))).length;
}

function totalGzipBytes(files: string[]): number {
  return files.reduce((sum, file) => sum + gzipSizeOf(file), 0);
}

function kb(bytes: number): string {
  return (bytes / 1024).toFixed(2);
}

function reportAndCheck(label: string, bytes: number, extraNote?: string): void {
  const line = `budget:bundle: ${label} — ${kb(bytes)} KB gzip (budget <= ${kb(BUDGET_BYTES)} KB)`;
  console.log(extraNote ? `${line}\n  ${extraNote}` : line);

  if (bytes > BUDGET_BYTES) {
    console.error(
      `\nbudget:bundle: FAIL — ${label} measured ${bytes} bytes gzip, ` +
        `budget is ${BUDGET_BYTES} bytes (130 KB). Over by ${bytes - BUDGET_BYTES} bytes.`,
    );
    process.exit(1);
  }
}

function main(): void {
  const pages = readManifest();
  const allRouteKeys = Object.keys(pages);
  const readPathRoutes = allRouteKeys.filter(isReadPathRoute);

  if (readPathRoutes.length === 0) {
    // Honest disclosure, matching scripts/lint-tokens.mjs's own "0 files —
    // passing trivially" convention. No public read-path page exists yet
    // (search lands in Phase 5, the discovery surfaces in Phase 11) — this
    // slice ships the gate ahead of the pages on purpose (see tasks.md
    // Phase 11 note), so there is nothing route-specific to measure today.
    // Every future read-path route still inherits Next's shared
    // framework/runtime chunks, so those are measured instead of measuring
    // nothing at all — this is the real floor the first real page starts
    // from, not zero.
    const sharedFiles = allRouteKeys
      .flatMap((route) => jsFilesFor(pages[route] ?? []))
      .filter((file, index, all) => all.indexOf(file) === index)
      .filter((file) =>
        allRouteKeys.every((route) => jsFilesFor(pages[route] ?? []).includes(file)),
      );

    reportAndCheck(
      "shared framework/runtime baseline",
      totalGzipBytes(sharedFiles),
      "No read-path route exists yet (all current app-router pages are excluded: " +
        `${allRouteKeys.join(", ") || "none"}). This number is the floor every future ` +
        "read-path page inherits before it ships a single byte of its own code — " +
        "passing here proves the baseline fits, not that any real page does.",
    );
    return;
  }

  let worstRoute = readPathRoutes[0] as string;
  let worstBytes = -1;
  for (const route of readPathRoutes) {
    const bytes = totalGzipBytes(jsFilesFor(pages[route] ?? []));
    console.log(`budget:bundle: ${route} — ${kb(bytes)} KB gzip`);
    if (bytes > worstBytes) {
      worstBytes = bytes;
      worstRoute = route;
    }
  }

  reportAndCheck(`worst read-path route (${worstRoute})`, worstBytes);
  console.log(`budget:bundle: PASS — ${readPathRoutes.length} read-path route(s) checked.`);
}

main();
