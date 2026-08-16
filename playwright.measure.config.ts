import { defineConfig, devices } from "@playwright/test";

// Layout-measurement harness (tasks.md 1b.10–1b.12, 1b.14). Deliberately
// separate from playwright.config.ts: that config targets a deployed
// preview via PLAYWRIGHT_BASE_URL (E2E/crawlability, design.md "Testing
// Strategy"). This config depends on no deployment and no PREVIEW_BASE_URL —
// it starts its own local Next.js dev server on a dedicated port and reads
// real rendered geometry from app/measure (gated off the production
// surface — see that route's own comment) through the real CSS Modules
// build pipeline.
const PORT = 3100;

export default defineConfig({
  testDir: "./tests/measure",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
  },
  webServer: {
    command: `pnpm exec next dev -p ${PORT}`,
    url: `http://127.0.0.1:${PORT}/measure`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: {
      // Only this webServer sets it — see app/measure/page.tsx. A real
      // deploy never sets this, so the route 404s outside this harness.
      MEASURE_HARNESS_ENABLED: "true",
    },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
