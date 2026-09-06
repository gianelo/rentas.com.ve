import { expect, test } from "@playwright/test";
import { ID, LISTING_ROWS, MARACAIBO, PUBLISHER } from "../../scripts/seed-e2e";
import { buildListingPath } from "../../src/modules/listing-discovery/domain/listing-url";

/**
 * **La puerta sobre el WhatsApp, con el script apagado** (tasks.md 15.8,
 * 22.23, láminas 8b/9b).
 *
 * `ficha-servida.test.tsx` mide con `renderToStaticMarkup` que la puerta sale
 * entera en el HTML — título, motivo y promesa de vuelta — pero **no puede
 * medir que sale sin un solo script**: fuera del compilador de Next un
 * Server Action es una función común, y React le inyecta a ese formulario su
 * propio `<script>` de reenvío. Afirmar la ausencia ahí habría sido rojo por
 * el arnés, no por la pantalla — el mismo defecto que esta tarea corrige en
 * `signin-return.test.ts` (22.17), movido acá al lugar que sí puede medirlo:
 * el proyecto `crawlability`, igual que `entrar-sin-javascript.spec.ts`.
 *
 * **Lo que se mide es que la puerta funciona sin JavaScript**, no un conteo
 * de `<script>` en el documento entero: la ficha ya sirve su propio
 * `<script type="application/ld+json">` de siempre (11.14), así que "cero
 * scripts en la página" sería una afirmación falsa incluso con la puerta
 * cerrada. Lo que sí es cierto — y lo que un navegador sin script necesita
 * para que "Continuar con Google" y "Enviarme el enlace" envíen algo — es que
 * cada formulario tenga un `action` de verdad y un `method="post"` nativo, en
 * vez de la reescritura `javascript:` que el arnés de unidad produce.
 */

/** Las direcciones son deterministas: las siembra `scripts/seed-e2e.ts`. */
function tituloDe(id: string): string {
  const row = LISTING_ROWS.find((listing) => listing.id === id);
  if (!row) throw new Error(`la semilla de e2e no tiene el aviso ${id}`);
  return row.title;
}

/** El camino canónico, armado con la MISMA función que la aplicación usa. */
function fichaDe(id: string): string {
  return buildListingPath({
    id,
    cityName: MARACAIBO.name,
    zoneName: "Tierra Negra",
    title: tituloDe(id),
  });
}

/**
 * El arnés local — sin dirección de vista previa y con `TEST_DATABASE_URL` —,
 * igual que `camino-de-lectura-sin-javascript.spec.ts` y por la misma razón:
 * sin él, `/alquiler/**` no tiene ningún aviso activo con teléfono tapado que
 * pedirle a la puerta.
 */
const conArnes = !process.env.PLAYWRIGHT_BASE_URL && Boolean(process.env.TEST_DATABASE_URL);

/* **El guardián va en el cuerpo del módulo y NO en un `test.beforeAll`.** Nació
   como hook y así no protegía nada: el `test.skip(!conArnes, …)` de abajo está
   en el cuerpo del `describe`, que Playwright trata como anotación estática de
   suite, y **para una prueba que saltea no ejecuta sus hooks**. O sea que en el
   único escenario para el que este guardián existe —CI puesto, arnés ausente—
   el `throw` nunca se disparaba y el job informaba una prueba saltada pero
   verde, que es exactamente lo que su propio mensaje dice que hay que impedir.
   Acá arriba se evalúa al recolectar el archivo, antes de que exista una suite
   que saltear. */
if (!conArnes && process.env.CI) {
  throw new Error(
    "El arnés de la 11.22 no está y esto corre en CI. Hace falta TEST_DATABASE_URL y NINGUNA " +
      "PLAYWRIGHT_BASE_URL. Saltarlo en silencio reportaría un portón verde que no midió nada.",
  );
}

test.describe("la puerta de WhatsApp funciona sin JavaScript (15.8, 22.23)", () => {
  test.skip(
    !conArnes,
    "Necesita el arnés de la 11.22: `pnpm db:test:up && pnpm db:test:migrate && pnpm db:test:seed:e2e`.",
  );

  test("sale entera en el HTML y sus dos envíos son formularios nativos, no un enlace que sólo un script entendería", async ({
    page,
  }) => {
    const response = await page.goto(`${fichaDe(ID.mcboTierraNegra1)}?entrar=si`);

    expect(response?.status()).toBe(200);

    const puerta = page.getByTestId("puerta-panel");
    await expect(puerta.getByRole("heading", { level: 2 })).toHaveText(
      `Entrá para ver el WhatsApp de ${PUBLISHER.name}`,
    );
    await expect(puerta.getByText("Pedimos la cuenta para frenar avisos falsos.")).toBeVisible();
    await expect(puerta.getByText("Volvés a este mismo aviso al terminar.")).toBeVisible();

    // Las dos entradas —Google y el correo— son POST nativos: es lo que un
    // navegador sin una sola línea de script sabe hacer solo. La reescritura
    // `javascript:throw …` que produce `renderToStaticMarkup` fuera de Next
    // sería precisamente lo que esta aserción rechaza.
    const forms = puerta.locator("form");
    await expect(forms).toHaveCount(2);
    for (const index of [0, 1]) {
      const action = await forms.nth(index).getAttribute("action");
      expect(action).not.toBeNull();
      expect(action).not.toMatch(/^javascript:/);
      await expect(forms.nth(index)).toHaveAttribute("method", /post/i);
    }

    // Y las dos salidas visibles (F20) siguen siendo anclas de verdad, no
    // manejadores que dependen de un script para navegar.
    await expect(page.getByRole("link", { name: "Seguir mirando sin entrar" })).toHaveAttribute(
      "href",
      fichaDe(ID.mcboTierraNegra1),
    );
  });
});
