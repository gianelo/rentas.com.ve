import { expect, test } from "@playwright/test";

/**
 * **tasks.md 9.27 — la mitad de navegador.** La cadena entera (importar →
 * fotos → activar → aparecer en la búsqueda por ciudad) se prueba de forma
 * DETERMINISTA contra Postgres real en
 * `tests/integration/bulk-import-to-search.test.ts`, que corre en cada `push`
 * y no depende de ningún despliegue. Lo que esta capa agrega es lo que
 * aquélla no puede ver: que la puerta EXISTA como ruta y que refuse.
 *
 * **Lo que corre en todas partes, sin `test.skip`.** Sin cookie de sesión,
 * `auth()` nunca toca la base — la misma razón por la que
 * `publish-access.spec.ts` prueba `/publicar` sin vista previa, y por la que
 * `nav-account-control.spec.ts` prueba `/mis-avisos`. Los dos casos de acá
 * son ésos: rutas protegidas que responden antes de leer nada.
 *
 * **Lo que NO se prueba acá, y por qué no se finge.** El caso "una cuenta
 * habilitada ve la pantalla" necesita una fila de sesión REAL en Postgres
 * (`strategy: "database"`), y este runner no tiene credenciales de escritura
 * contra la base de una vista previa. Se prueba entonces donde sí se puede:
 * `app/importar/importar-contract.test.tsx` mide los bytes exactos que sale
 * del servidor con `renderToStaticMarkup`, y
 * `app/mis-avisos/puerta-de-importar.test.tsx` prueba que el enlace aparece
 * sólo para la cuenta habilitada. Una aserción que se salta sin despliegue ya
 * se pudrió en silencio una vez en este repositorio
 * (`publish-access.spec.ts` afirmaba un testid que había cambiado de ruta
 * varios PRs antes y reportó verde todo ese tiempo): preferimos probar menos
 * acá y probarlo de verdad en otro lado.
 */

test("importar cartera es refusada sin sesión, y recuerda a dónde ibas", async ({ page }) => {
  await page.goto("/importar");

  await expect(page).toHaveURL(/\/signin\?callbackUrl=%2Fimportar$/);
});

/**
 * **La plantilla es el contrato del formato, así que también está detrás de
 * la puerta.** `generateImportTemplate` lee el catálogo entero para armar sus
 * filas de ejemplo; un anónimo no debe poder disparar esa consulta.
 *
 * Es una ruta de manejador (`route.ts`), no una página: no redirige, responde
 * 401. Eso es deliberado — un `fetch` que sigue un redirect a `/signin`
 * recibiría un HTML con estado 200 y lo guardaría como si fuera el CSV.
 */
test("la plantilla no se baja sin sesión: responde 401, no un HTML disfrazado de CSV", async ({
  request,
}) => {
  const response = await request.get("/importar/plantilla");

  expect(response.status()).toBe(401);
  expect(response.headers()["content-type"]).not.toContain("text/csv");
});
