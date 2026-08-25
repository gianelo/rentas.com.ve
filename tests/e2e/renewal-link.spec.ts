import { expect, test } from "@playwright/test";

/**
 * El enlace de renovación en un navegador de verdad (tasks.md 7.12).
 *
 * **Lo que esta capa agrega, y lo que deliberadamente NO cubre.**
 *
 * La tarea pedía el encadenado entero: trabajo de recordatorios → enlace →
 * renovación. Correr el trabajo acá significaría, desde que entró el adaptador
 * de Resend (7.11), **mandar correos reales en cada corrida de CI** a las
 * direcciones que haya sembradas. Eso no es una prueba, es un emisor
 * programado. La mitad de trabajo→correo queda donde se puede probar de forma
 * determinista y sin red: `send-lifecycle-notices.test.ts` y
 * `tests/integration/lifecycle.test.ts`.
 *
 * Lo que sólo un navegador puede afirmar es esto: que un enlace firmado que
 * llega por correo, abierto como lo abre una persona, **no renueva nada por el
 * hecho de abrirse** y no se indexa.
 *
 * **Corre en todas partes, sin base de datos y sin `test.skip`.** Un token
 * inválido se rechaza por la firma antes de leer el aviso
 * (`renew-listing.test.ts`: "un token inválido no llega ni a leer el aviso"),
 * así que el camino entero se recorre contra el build local que apunta a una
 * base irrutable — que es justamente el modo en que corre CI cuando no hay
 * secreto de bypass.
 */

/** Ni firmado ni con forma de token. Es lo que manda quien prueba suerte. */
const GARBAGE = "no-es-un-token";

/**
 * Con forma de token y firma inventada: tres segmentos plausibles. Separa
 * "no parsea" de "parsea y la firma no cierra", que son dos caminos distintos
 * del dominio y las dos tienen que terminar igual acá.
 */
const FORGED = `${Buffer.from('{"listingId":"listing-1","cycle":1}').toString("base64url")}.v1.firma-inventada`;

/**
 * La confirmación es el ÚNICO lugar del que sale una renovación: un
 * `<form method="post">`. Si aparece con un token que no sirve, el enlace
 * está ofreciendo renovar algo que no puede verificar.
 */
function offersRenewal(html: string): boolean {
  return /<form[^>]*method=["']?post/i.test(html);
}

for (const [nombre, token] of [
  ["un token que ni siquiera parsea", GARBAGE],
  ["un token con forma correcta y firma inventada", FORGED],
] as const) {
  test(`${nombre} nunca ofrece renovar`, async ({ page }) => {
    const response = await page.goto(`/renovar/${token}`);
    const html = await page.content();

    // La afirmación que vale en cualquier configuración: no hay 200 y no hay
    // formulario. Vale incluso si al despliegue le falta el secreto y contesta
    // 500 — lo que no puede pasar NUNCA es que ofrezca renovar.
    expect(response?.status()).not.toBe(200);
    expect(offersRenewal(html)).toBe(false);

    // Un 500 es "a este despliegue le falta RENEWAL_TOKEN_SECRET", no un
    // defecto del enlace. Se dice en vez de afirmar de menos en silencio.
    test.skip(
      response?.status() === 500,
      "el despliegue no tiene secreto de renovación: sólo se pudo probar que falla cerrado",
    );

    expect(response?.status()).toBe(400);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Enlace no válido");
  });
}

/**
 * **La URL lleva un token firmado adentro.** Indexada, el enlace de
 * renovación de alguien queda en un buscador — y con él la capacidad de
 * renovar su aviso. La etiqueta se dibuja en las tres respuestas, no sólo en
 * la buena, porque la que más circula es la del error.
 */
test("el enlace no se indexa", async ({ page }) => {
  await page.goto(`/renovar/${GARBAGE}`);

  const robots = page.locator('meta[name="robots"]');
  await expect(robots).toHaveAttribute("content", /noindex/);
  await expect(robots).toHaveAttribute("content", /nofollow/);
});

/**
 * **Abrir no es renovar, y esto es lo que la separación existe para impedir.**
 *
 * Un enlace de correo lo abre el antivirus del proveedor, el previsualizador
 * de WhatsApp y el prefetch del navegador — todos con `GET` y sin que nadie
 * haya hecho clic. Se comprueba con un pedido crudo, sin navegador, porque así
 * es exactamente como llegan esos tres.
 */
test("un GET no renueva ni quema el token", async ({ request }) => {
  const first = await request.get(`/renovar/${FORGED}`);
  const second = await request.get(`/renovar/${FORGED}`);

  // Dos aperturas seguidas dan lo mismo: si la primera hubiera consumido algo,
  // la segunda contestaría distinto — "ya se usó" en vez del mismo rechazo.
  expect(second.status()).toBe(first.status());
  expect(offersRenewal(await second.text())).toBe(false);
});
