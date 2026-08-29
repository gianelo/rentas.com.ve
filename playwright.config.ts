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

// **El arnés que le devuelve los dientes al proyecto `crawlability`**
// (tasks.md 11.22). Hasta acá el respaldo local compilaba contra una
// `DATABASE_URL` deliberadamente inalcanzable, así que `/alquiler/**` sólo
// podía contestar 500 y las especificaciones que leen el catálogo se saltaban
// solas: la suite con el script apagado no medía nada, que es justo lo que
// `AGENTS.md` §2 dice que mide.
//
// Con `TEST_DATABASE_URL` puesta, `scripts/neon-http-proxy.mjs` traduce el HTTP
// de Neon a `pg` contra ese Postgres y la aplicación corre entera contra datos
// reales, sin una línea distinta. Sin la variable, todo se comporta como antes.
const testDatabaseUrl = process.env.TEST_DATABASE_URL || undefined;
const proxyPort = Number(process.env.NEON_PROXY_PORT || 5544);

/**
 * La misma cadena de conexión con `-pooler.` metido en el nombre de host.
 *
 * **`assertPooledConnectionString` no se debilita**: la guarda de D2 sigue
 * exigiendo un endpoint agrupado y lo sigue encontrando. El ruteo real no viaja
 * por acá sino por `NEON_FETCH_ENDPOINT`, que sólo se acepta hacia el bucle
 * local. Y el nombre resultante no resuelve a ninguna parte, que es
 * exactamente lo que se quiere: nada puede conectarse ahí por accidente.
 */
function pooledLookalike(url: string): string {
  const parsed = new URL(url);
  parsed.hostname = `${parsed.hostname}-pooler.rentas.invalid`;
  return parsed.toString();
}

const harnessEnv: Record<string, string> = testDatabaseUrl
  ? {
      DATABASE_URL: pooledLookalike(testDatabaseUrl),
      NEON_FETCH_ENDPOINT: `http://127.0.0.1:${proxyPort}/sql`,
    }
  : {};

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
        webServer: [
          // El traductor de Neon a Postgres, primero. Playwright espera a que
          // TODOS los servidores estén listos antes de correr una prueba, así
          // que el orden del arreglo no es una carrera.
          ...(testDatabaseUrl
            ? [
                {
                  command: "node scripts/neon-http-proxy.mjs",
                  port: proxyPort,
                  reuseExistingServer: !process.env.CI,
                  timeout: 30_000,
                  env: { TEST_DATABASE_URL: testDatabaseUrl, NEON_PROXY_PORT: String(proxyPort) },
                },
              ]
            : []),
          {
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
            // Vacío sin arnés: la aplicación conserva la `DATABASE_URL`
            // inalcanzable que el entorno ya le da, y nada cambia.
            env: harnessEnv,
          },
        ],
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
