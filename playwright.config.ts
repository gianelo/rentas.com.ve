import { defineConfig, devices } from "@playwright/test";

// E2E and crawlability layer (design.md, "Testing Strategy"). Runs against
// a Next.js preview deployment, not a local dev server — the crawlability
// suite specifically requires scripting disabled, which this config's
// per-project `javaScriptEnabled` override supports once test files exist.
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: "html",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
