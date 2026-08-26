import { expect, test } from "@playwright/test";

/**
 * **El buscador del inicio, con JavaScript apagado** (F14/14.20, tasks.md 14g).
 *
 * Existe por una regresión concreta y no por completitud: la 14g cambió la
 * pieza que dibuja el buscador de `/` — era `SearchBar`, ahora es la pastilla
 * dentro del `Nav` —, y las dos son un `<form method="get">`. El mecanismo
 * sobrevive **sólo si la pastilla se alimenta del mismo `homeSearchForm`**. Un
 * `action` o un `name` escritos a mano en la página dibujan una caja idéntica
 * que no busca nada, y ninguna prueba de dominio se pone roja por eso.
 *
 * El proyecto `crawlability` corre este archivo con `javaScriptEnabled: false`,
 * que es lo que convierte "anda sin JavaScript" en una medición y no en una
 * afirmación. Escribir y enviar acá es el navegador solo.
 *
 * **Por qué se salta sin despliegue, y no se debilita.** `/` consulta el
 * vocabulario y el catálogo antes de dibujar nada, así que el respaldo local
 * —una compilación de producción contra una `DATABASE_URL` deliberadamente
 * inalcanzable— sólo puede contestar 500. Afirmar contra eso reportaría el
 * camino de lectura como cubierto sin haberlo tocado, que es peor que no
 * afirmar nada; es la misma decisión que `publish-access.spec.ts` ya dejó
 * escrita para la raíz. Lo que esta prueba necesita es el secreto de bypass en
 * el repositorio, y entonces corre en todas partes.
 *
 * Mientras tanto la mitad determinista está cubierta y corre en cada `push`:
 * `components/molecules/SearchPill.test.tsx` renderiza la pastilla con el
 * `homeSearchForm` real y comprueba el `method`, el `action`, el nombre del
 * campo y el `submit`; `app/inicio-contract.test.ts` comprueba que la página
 * la arme con ese formulario y no con literales propios.
 */
const againstADeployment = Boolean(process.env.PLAYWRIGHT_BASE_URL);

test.beforeEach(() => {
  test.skip(
    !againstADeployment,
    "needs a real database: the local fallback build points at an unroutable host",
  );
});

test("buscar desde el inicio es un GET del navegador, sin JavaScript", async ({ page }) => {
  await page.goto("/");

  // La caja es un campo real con etiqueta asociada, no un disparador de panel.
  const box = page.getByRole("searchbox");
  await expect(box).toBeVisible();

  await box.fill("Chacao");
  // Enviar el formulario, no tocar un manejador de clic: con el script apagado
  // el botón de la lupa es lo único que puede enviarlo.
  await page.getByRole("button", { name: "Buscar" }).click();

  // El servidor tradujo y redirigió a la ruta del lugar (14.24: no hay
  // `/buscar`; el lugar va en la ruta). Que el destino exista lo prueba el 200.
  await expect(page).toHaveURL(/\/alquiler\/[^/]+\/chacao/);
});

test("lo que no se reconoce contesta «no entendí», nunca «no hay avisos»", async ({ page }) => {
  const response = await page.goto("/?q=zzzz-no-existe-zzzz");

  expect(response?.status()).toBe(200);
  // El texto lo compone el dominio (`noMatchMessage`). Acá se comprueba que la
  // rama siga dibujándose, que es lo que el cambio de encabezado podía romper.
  await expect(page.getByText(/No reconocimos/)).toBeVisible();
});
