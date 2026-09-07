import { expect, test } from "@playwright/test";

/**
 * **El slug malformado, servido entero — tasks.md 22.16, 22.31.**
 *
 * Medido al cerrar la 11b.3: un `notFound()` lanzado dentro de una ruta
 * dinámica (la ficha, el visor de fotos) lo dibuja Next del lado del
 * CLIENTE — con el script apagado el cuerpo servido eran 234 bytes, un
 * límite de suspenso vacío y la pantalla entera sólo dentro de la carga de
 * Flight. **DECIDIDO POR EL FUNDADOR el 2026-09-07: se arregla en
 * `middleware.ts`, y NO en la ficha.** El caso decidible sin consultar la
 * base de datos —el slug que `listingIdFromSlug` no puede leer, porque no
 * termina en un id— se reescribe ahí hacia una dirección que Next nunca
 * declara como página, así que corre por el mismo camino ya probado del 404
 * genérico: prerenderizado en el build, sin límite de Suspense.
 *
 * **Esta es la prueba que registra la convención de la 22.31**: toda regla
 * nueva llega con su prueba sobre el HTML SERVIDO, y no sobre el código
 * fuente ni sobre una llamada espiada. `return-to-results.ts` (8.7, 22.31) y
 * el cuarto argumento de `buildListingGrid` (22.30) son los dos casos donde
 * una garantía sin llamador o un argumento sin pasar quedaron indistinguibles
 * de un producto que funciona hasta que alguien midió el cuerpo servido — es
 * exactamente lo que este archivo mide para el rewrite de arriba.
 *
 * **No necesita el arnés de la 11.22.** El slug malformado se rechaza ANTES
 * de cualquier consulta —es el punto entero de resolverlo en el Edge—, así
 * que corre igual sin `TEST_DATABASE_URL`: ciudad y zona en la dirección de
 * abajo no necesitan existir en ningún catálogo sembrado.
 */
test.describe("un slug de aviso malformado responde 404 servido entero (22.16)", () => {
  const DIRECCION_MALFORMADA = "/alquiler/maracaibo/tierra-negra/apartamento-que-nunca-existio";

  test("la ficha con un slug sin id responde 404 y sirve la pantalla completa", async ({
    page,
  }) => {
    const response = await page.goto(DIRECCION_MALFORMADA);

    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "No encontramos esa página" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Ir al inicio" })).toHaveAttribute("href", "/");
  });

  test("el visor de fotos con el mismo slug también responde 404 servido entero", async ({
    page,
  }) => {
    const response = await page.goto(`${DIRECCION_MALFORMADA}/foto/1`);

    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "No encontramos esa página" })).toBeVisible();
  });
});
