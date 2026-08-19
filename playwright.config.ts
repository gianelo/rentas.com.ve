import { defineConfig, devices } from "@playwright/test";

// E2E and crawlability layer (design.md, "Testing Strategy"). Runs against
// a Next.js preview deployment, not a local dev server — the crawlability
// suite specifically requires scripting disabled, which this config's
// per-project `javaScriptEnabled` override supports once test files exist.
// `||`, not `??`: CI sets this to an EMPTY STRING when there is no bypass
// secret, and an empty string is not nullish — the first run produced
// `baseURL: ""` and three "Cannot navigate to invalid URL" failures. Absent
// and empty must mean the same thing here.
const previewUrl = process.env.PLAYWRIGHT_BASE_URL || undefined;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: "html",
  use: {
    baseURL: previewUrl ?? "http://localhost:3000",
    trace: "on-first-retry",
    // Vercel deployment protection puts an SSO wall in front of every
    // preview: without this header the suite tests vercel.com/login and
    // reports the app as broken. The bypass secret is enabled per project
    // under Deployment Protection → Protection Bypass for Automation.
    ...(process.env.VERCEL_AUTOMATION_BYPASS_SECRET
      ? {
          extraHTTPHeaders: {
            "x-vercel-protection-bypass": process.env.VERCEL_AUTOMATION_BYPASS_SECRET,
            "x-vercel-set-bypass-cookie": "true",
          },
        }
      : {}),
  },

  // With no base URL — no preview, or no bypass secret to get past its SSO
  // wall — the suite runs against a real production build served locally.
  // That covers less than a deployment does, and it is stated rather than
  // hidden: it proves the built app, not Vercel's routing or its environment.
  ...(previewUrl
    ? {}
    : {
        webServer: {
          // CI builds once before running both projects and sets this to
          // `pnpm start`; locally the default builds too, so a bare
          // `playwright test` still works from a clean checkout.
          command: process.env.PLAYWRIGHT_WEB_COMMAND ?? "pnpm build && pnpm start",
          // `port`, not `url`, and the difference is what a readiness probe
          // is allowed to mean. With `url` Playwright polls that address and
          // only calls the server ready on a non-5xx response -- so readiness
          // silently depended on the ROOT PAGE RENDERING. That held while `/`
          // was a static heading; the moment the root became the search it
          // began querying the database, which on this fallback path points
          // at a deliberately unroutable host, and every poll for three
          // minutes got a 500. The server was up the whole time and the job
          // died with "Timed out waiting 180000ms from config.webServer".
          //
          // `port` waits for the socket to accept connections, which is the
          // actual question: is the server listening. Whether a given page
          // renders is a test's job, and a test says which page and why.
          port: 3000,
          reuseExistingServer: !process.env.CI,
          timeout: 180_000,
        },
      }),
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    // Crawlability layer (design.md, "Testing Strategy" + D11): the same
    // spec files run with scripting disabled, proving the read path renders
    // without JavaScript rather than merely asserting it by inspection.
    {
      name: "crawlability",
      use: { ...devices["Desktop Chrome"], javaScriptEnabled: false },
    },
  ],
});
