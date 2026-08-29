import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Coverage policy (design.md, "Coverage policy"): no repository-wide
// percentage target. Only src/modules/*/domain/ and src/modules/*/application/
// carry a 90% floor — those are the pure, dependency-free layers that hold
// every invariant. infrastructure/ and app/ carry no coverage target; they
// are exercised by the integration and E2E layers instead.
export default defineConfig({
  // tsconfig.json sets "jsx": "preserve" for Next.js's own bundler. Vite 8's
  // default oxc transform needs an actual JSX transform to run component
  // tests (app/layout.test.tsx onward, PR1b-a) — this overrides it for the
  // test run only, independent of the Next.js build's own JSX handling.
  oxc: {
    jsx: { runtime: "automatic" },
  },
  // Mirrors tsconfig.json's "@/*" -> "./src/*" path alias (Next.js resolves
  // it through the bundler; Vite needs it declared separately).
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    // `next-auth` importa `next/server` por su mapa de `exports`, y la resolución
    // de Node que Vite usa para las dependencias externalizadas no lo sigue.
    // Inlinearlo hace que resuelva Vite: lo necesita el arnés de la 15.10.
    server: { deps: { inline: ["next-auth"] } },
    // Widened in PR1b-a: components/ and app/ now carry their own tests
    // (layout primitives, root-shell landmarks). They stay outside the
    // coverage floor below (design.md, "Coverage policy" — app/ and
    // infrastructure/ carry no percentage target).
    include: [
      "src/**/*.{test,spec}.{ts,tsx}",
      "components/**/*.{test,spec}.{ts,tsx}",
      "app/**/*.{test,spec}.{ts,tsx}",
      // `instrumentation.ts` tiene que vivir en la raíz —Next sólo lo busca
      // ahí o en `src/` cuando `app/` está dentro de `src/`, y acá no lo
      // está—, así que su prueba se nombra una por una en vez de abrir la
      // raíz entera a este glob.
      "instrumentation.{test,spec}.ts",
    ],
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
