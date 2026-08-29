import { expect, test } from "@playwright/test";
import { ID, LISTING_ROWS, MARACAIBO } from "../../scripts/seed-e2e";
import { buildListingPath } from "../../src/modules/listing-discovery/domain/listing-url";

/**
 * **La 11.16, en un navegador de verdad y con el script apagado.**
 *
 * La mitad determinista ya la cubren la 11.3 y la 11.5 sobre el cuerpo servido
 * (`renderToStaticMarkup`), y corren en cada `push`. Lo que falta y falta acá es
 * el navegador: el proyecto `crawlability` corre estos mismos archivos con
 * `javaScriptEnabled: false`, que es —dice `AGENTS.md` §2— «lo que convierte
 * "anda sin JavaScript" de afirmación en medición».
 *
 * **Hasta ahora no medía nada, y la causa era estructural.** `/alquiler/**`
 * consulta el catálogo antes de dibujar, y el respaldo local compilaba contra
 * una `DATABASE_URL` deliberadamente inalcanzable: sólo podía contestar 500. La
 * 11.22 es lo que faltaba — `scripts/neon-http-proxy.mjs` traduce el HTTP de
 * Neon a `pg` contra el Postgres de `docker-compose.yml`, y
 * `scripts/seed-e2e.ts` le pone dos ciudades con fotos.
 *
 * **Corre por PR y no por push, a propósito** (decisión del fundador,
 * 2026-08-27). El job `e2e` de `.github/workflows/ci.yml` está condicionado a
 * `pull_request`, y eso alcanza: lo que tiene que morder es la fusión, que es
 * cuando la afirmación cuenta. Moverlo a cada push gasta minutos medidos y no
 * compra nada — la mitad determinista ya corre ahí.
 *
 * **No se salta en CI, y eso es una guarda y no una formalidad.** Este
 * repositorio ya tuvo un `test.skip` que se pudrió en silencio:
 * `publish-access.spec.ts` afirmaba un `testid` que se había mudado de ruta
 * varias PRs antes y reportó verde todo el tiempo. Sin arnés y en CI, esto
 * FALLA en vez de saltarse — si algún día alguien enciende el camino de la
 * vista previa, este archivo se rompe ruidosamente y quien lo encienda decide
 * qué hacer, que es el momento correcto para decidirlo.
 */

/** Las direcciones son deterministas: las siembra `scripts/seed-e2e.ts`. */
const ZONA_MARACAIBO = "/alquiler/maracaibo/tierra-negra";
const CIUDAD_MARACAIBO = "/alquiler/maracaibo";

/** El título que la semilla le puso a cada id, sin copiarlo a mano. */
function tituloDe(id: string): string {
  const row = LISTING_ROWS.find((listing) => listing.id === id);
  if (!row) throw new Error(`la semilla de e2e no tiene el aviso ${id}`);
  return row.title;
}

/**
 * El camino canónico, armado con la MISMA función que la aplicación usa. Una
 * copia escrita a mano acá pasaría a ser una segunda regla de direcciones que
 * discrepa con la primera en la próxima corrección de `slugify`.
 */
function fichaDe(id: string): string {
  return buildListingPath({
    id,
    cityName: MARACAIBO.name,
    zoneName: "Tierra Negra",
    title: tituloDe(id),
  });
}

/**
 * El arnés local, y las dos mitades importan: **sin dirección de vista previa**
 * —porque entonces Playwright no levanta nada y el catálogo es el de aquel
 * despliegue, que no tiene fotos— **y con `TEST_DATABASE_URL`**, que es lo que
 * hace que `playwright.config.ts` levante el proxy y sirva la compilación local
 * contra el Postgres sembrado.
 */
const conArnes = !process.env.PLAYWRIGHT_BASE_URL && Boolean(process.env.TEST_DATABASE_URL);

test.beforeAll(() => {
  if (!conArnes && process.env.CI) {
    throw new Error(
      "El arnés de la 11.22 no está y esto corre en CI. Hace falta TEST_DATABASE_URL y NINGUNA " +
        "PLAYWRIGHT_BASE_URL: con vista previa, el catálogo es el de ese despliegue y su siembra " +
        "no tiene fotos, así que la regla F9 deja la cuadrícula vacía y esto mediría cero. " +
        "Si se encendió el secreto de bypass, la decisión que falta es sembrar fotos en la base " +
        "de la vista previa o correr este archivo aparte con el arnés. Saltarlo en silencio sería " +
        "reportar un portón verde que no midió nada — que es exactamente lo que la 11.22 vino a " +
        "arreglar.",
    );
  }
});

test.describe("el camino de lectura con el script apagado (11.16)", () => {
  test.skip(
    !conArnes,
    "Necesita el arnés de la 11.22: `pnpm db:test:up && pnpm db:test:migrate && pnpm db:test:seed:e2e`.",
  );

  /**
   * **Los avisos, en la página de la zona.** Se afirma el enlace y no sólo el
   * texto: un rastreador sigue desde acá, y un título sin `href` es una hoja
   * suelta del sitio.
   */
  test("la página de zona trae sus avisos y sus enlaces", async ({ page }) => {
    const response = await page.goto(ZONA_MARACAIBO);

    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Tierra Negra");

    const fichas = page.locator(`a[href^="${ZONA_MARACAIBO}/"]`);
    await expect(fichas.first()).toBeVisible();
    expect(await fichas.count()).toBeGreaterThan(0);
    await expect(page.getByText(tituloDe(ID.mcboTierraNegra1))).toBeVisible();
  });

  /**
   * **Los resultados de la búsqueda de la ciudad**, que es la otra mitad que la
   * tarea nombra. La ruta de la ciudad ES la búsqueda de esa ciudad (14.24).
   */
  test("los resultados de la ciudad traen avisos", async ({ page }) => {
    const response = await page.goto(CIUDAD_MARACAIBO);

    expect(response?.status()).toBe(200);

    const fichas = page.locator(`a[href^="${CIUDAD_MARACAIBO}/"]`);
    expect(await fichas.count()).toBeGreaterThan(0);
    await expect(page.getByTestId("result-count")).toContainText("propiedades activas");
  });

  /**
   * **El aislamiento entre ciudades, medido en un navegador.** La 11.6 lo mide
   * sobre el cuerpo servido y la integración sobre Postgres real; acá se mide
   * en la pantalla que una persona ve. Se afirma primero que los nuestros
   * están, porque dos listas vacías también coinciden.
   */
  test("una zona de Maracaibo no dibuja un aviso de Distrito Capital", async ({ page }) => {
    await page.goto(ZONA_MARACAIBO);

    await expect(page.getByText(tituloDe(ID.mcboTierraNegra1))).toBeVisible();
    await expect(page.getByText(tituloDe(ID.dcChacao))).toHaveCount(0);
    await expect(page.locator('a[href^="/alquiler/distrito-capital/"]')).toHaveCount(0);
  });

  /**
   * **La ficha vencida se sirve, y con salidas** (11.8). Va acá porque es el
   * mismo camino de lectura y el mismo arnés: la pantalla existe para quien
   * llega desde un enlace viejo, y ese enlace se toca casi siempre desde el
   * navegador de WhatsApp, que es donde el script no llega.
   */
  test("un aviso vencido responde 200, dice que venció y ofrece los activos de su zona", async ({
    page,
  }) => {
    const response = await page.goto(fichaDe(ID.mcboVencido));

    expect(response?.status()).toBe(200);
    await expect(page.getByTestId("expired-notice")).toContainText("Aviso vencido");
    await expect(page.getByText("Otros avisos activos en Tierra Negra")).toBeVisible();
    await expect(page.getByText(tituloDe(ID.mcboTierraNegra1))).toBeVisible();
  });

  /**
   * **La redirección canónica, con el código que un rastreador necesita**
   * (11.21). Sólo el id identifica un aviso, así que un camino con el título
   * viejo resuelve — y no puede quedarse vivo, o el aviso publica dos
   * direcciones y Google reparte su autoridad entre las dos.
   */
  test("un camino no canónico redirige permanentemente al canónico", async ({ page }) => {
    const response = await page.goto(`${ZONA_MARACAIBO}/titulo-viejo-${ID.mcboTierraNegra1}`);

    expect(response?.status()).toBe(200);
    expect(new URL(page.url()).pathname).toBe(fichaDe(ID.mcboTierraNegra1));

    const saltos = response?.request().redirectedFrom();
    expect(saltos).not.toBeNull();
  });

  /**
   * **El 404 aterrizando en una pantalla y no en un vacío** (11b.3), servido
   * en el HTML y caminado con el script apagado. Es el cableado que una
   * prueba de render no puede probar: que Next llame a `app/not-found.tsx`.
   */
  test("una dirección que no coincide con ninguna ruta responde 404 con pantalla y salida", async ({
    page,
  }) => {
    const response = await page.goto("/una-direccion-que-nadie-publico");

    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "No encontramos esa página" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Ir al inicio" })).toHaveAttribute("href", "/");
  });

  /**
   * **El `notFound()` de la ficha, y acá sólo se afirma el código.**
   *
   * El cuerpo no se afirma porque **hoy no viaja en el HTML**: Next 15.5.23
   * dibuja del lado del cliente el `not-found` que se lanza desde una ruta
   * dinámica —el cuerpo servido son 234 bytes con un límite de suspenso vacío
   * y el contenido sólo en la carga de Flight—, así que con el script apagado
   * esta dirección sigue quedando en blanco. **No lo causó `not-found.tsx`**:
   * antes era la pantalla por defecto de Next por el mismo camino. Está
   * medido y anotado como tarea 22.16; afirmar acá el encabezado sería pedirle
   * a esta prueba que falle por un defecto que no es suyo.
   */
  test("un aviso que no existe responde 404", async ({ page }) => {
    const response = await page.goto(`${ZONA_MARACAIBO}/apartamento-que-nunca-existio`);

    expect(response?.status()).toBe(404);
  });

  /**
   * **La 16.9, caminada entera y con el script apagado.**
   *
   * Es la historia del producto y no una afirmación sobre una función: alguien
   * estrecha la lista con un filtro, abre uno de los avisos que quedaron, y
   * aprieta la vuelta. Tiene que aterrizar en ESOS avisos. Perder el filtro
   * ahí significa rehacer el trabajo o irse.
   *
   * **Las tres afirmaciones son una sola cadena y ninguna sobra.** El conteo de
   * antes fija que el filtro hizo algo —sin él, «vuelve a lo mismo» sería
   * cierto por no haber recortado nada—; el TEXTO del enlace es la mitad de la
   * regla, porque `resultsLink` devuelve dos acciones distintas y el respaldo
   * («Ver avisos en Tierra Negra») es exactamente lo que se dibujaba antes de
   * esta corrección; y la dirección más el conteo de después son el aterrizaje.
   *
   * **Con `javaScriptEnabled: false` en el proyecto `crawlability`** (F14): el
   * estado viaja por la dirección, así que es un enlace y no historia del
   * navegador. `history.back()` no sabe si hay algo atrás y `document.referrer`
   * no llega siempre — las dos están descartadas por escrito en el dominio.
   */
  test("volver de un aviso devuelve a la búsqueda filtrada, no a la zona pelada (16.9)", async ({
    page,
  }) => {
    // 480 y 250 pasan; la casa de 900 no, y el vencido tampoco por su estado.
    const busqueda = `${CIUDAD_MARACAIBO}?max=500`;
    await page.goto(busqueda);
    await expect(page.getByTestId("result-count")).toHaveText("2 propiedades activas");

    await page.getByText(tituloDe(ID.mcboTierraNegra1)).click();
    // **`toHaveURL` y no `page.url()`, y es una corrección medida.** Con el
    // script encendido el enrutador de Next navega en el cliente, así que la
    // lectura inmediata devolvía todavía la dirección de la búsqueda: el
    // proyecto `crawlability` pasaba y `chromium` fallaba por la carrera, no
    // por el producto. Ésta reintenta hasta que el navegador llegó.
    await expect(page).toHaveURL((url) => url.pathname === fichaDe(ID.mcboTierraNegra1));

    // El texto es la mitad de la regla: sin origen la ficha dibuja «Ver avisos
    // en Tierra Negra», que es una salida honesta y NO una vuelta.
    const vuelta = page.getByRole("link", { name: "← Resultados" });
    await expect(vuelta).toBeVisible();
    await vuelta.click();

    // La búsqueda entera, no la ruta sola: el `?max=500` es lo que la 16.9 pide.
    await expect(page).toHaveURL((url) => `${url.pathname}${url.search}` === busqueda);
    await expect(page.getByTestId("result-count")).toHaveText("2 propiedades activas");
  });
});
