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
      // Un destino que no existe, a propósito.
      //
      // El arnés monta `PublishStep`, que arrastra la Server Action del paso,
      // que importa `src/shared/db/client.ts` — y ese módulo lanza al cargarse
      // si `DATABASE_URL` no está. El arnés dibuja y no consulta nada, así que
      // basta con que la cadena tenga la forma que `assertPooledConnectionString`
      // exige. Declarada acá y no leída de `.env`, el arnés queda además
      // incapaz de tocar una base real: gana la del entorno del webServer,
      // porque Next no pisa una variable que ya está puesta.
      DATABASE_URL:
        "postgresql://harness:harness@ep-measure-harness-pooler.us-east-2.aws.neon.tech/rentas?sslmode=require",
      // Misma razón que la de arriba, y llegó por el mismo camino (26.12).
      //
      // `app/layout.tsx` declara `metadataBase: new URL(readSiteBaseUrl())`, y
      // desde la 26.10 esa función falla cerrado en vez de inventar un dominio.
      // El arnés monta el layout para dibujar, así que sin esto la página
      // revienta al renderizar y Playwright se queda esperando el servidor —
      // que es exactamente cómo se cayó este job la primera vez.
      //
      // El valor es irrutable a propósito: lo que el arnés mide es la
      // MAQUETACIÓN, y ninguna de sus afirmaciones mira una dirección. Un
      // dominio real acá sólo serviría para que una medición dependiera del
      // anfitrión del día.
      SITE_URL: "https://measure-harness-no-es-el-dominio-real.invalid",
    },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
