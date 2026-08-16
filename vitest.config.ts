import { defineConfig } from "vitest/config";

// Coverage policy (design.md, "Coverage policy"): no repository-wide
// percentage target. Only src/modules/*/domain/ and src/modules/*/application/
// carry a 90% floor — those are the pure, dependency-free layers that hold
// every invariant. infrastructure/ and app/ carry no coverage target; they
// are exercised by the integration and E2E layers instead.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      // `coverage.include` alone is enough: this Vitest version measures
      // every file it matches, not only files a test happens to import
      // (the old opt-in `coverage.all` flag no longer exists because that
      // became the unconditional default). An untested domain/application
      // file therefore surfaces as 0% instead of silently disappearing
      // from the report.
      include: ["src/modules/**/*.{ts,tsx}"],
      exclude: ["src/modules/**/*.{test,spec}.{ts,tsx}"],
      thresholds: {
        "src/modules/*/domain/**": {
          statements: 90,
          branches: 90,
          functions: 90,
          lines: 90,
        },
        "src/modules/*/application/**": {
          statements: 90,
          branches: 90,
          functions: 90,
          lines: 90,
        },
      },
    },
  },
});
