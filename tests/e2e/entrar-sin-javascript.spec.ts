import { expect, test } from "@playwright/test";

/**
 * **La puerta de entrar, con el script apagado** (tasks.md 15.7, láminas 8a/9a).
 * El proyecto `crawlability` corre este archivo con `javaScriptEnabled: false`,
 * que es lo que convierte «anda sin JavaScript» en una medición (`AGENTS.md`
 * §2). Acá pesa más que en otras pantallas: es el destino de vuelta desde
 * Google y desde un correo, y el navegador donde el paquete no llega es el de
 * WhatsApp, de donde vienen estos enlaces. **No se salta nunca**: `/signin` no
 * consulta el catálogo, así que no depende del arnés ni de un despliegue.
 */
test("la puerta de entrar llega entera, con su envío real y su salida", async ({ page }) => {
  await page.goto("/signin?callbackUrl=%2Fpublicar");

  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Entrá para publicar tu propiedad",
  );
  // Los tres pasos de la lámina bajan la ansiedad antes del botón. Se cuentan
  // dentro del `<main>`: el pie del sitio dibuja su propia lista en todas las
  // páginas, y un conteo de documento entero mediría el pie, no la pantalla.
  await expect(page.getByRole("main").getByRole("listitem")).toHaveCount(3);
  // Un `<button>` suelto no navega sin JavaScript: lo que envía es el
  // formulario, y el método tiene que ser el que el navegador solo entiende.
  await expect(page.locator("form").first()).toHaveAttribute("method", /post/i);
  await expect(page.getByRole("button", { name: "Continuar con Google" })).toBeVisible();
  // La salida visible (F20): mirar avisos nunca costó una cuenta.
  await expect(page.getByRole("link", { name: "← Volver a los avisos" })).toHaveAttribute(
    "href",
    "/",
  );
});

test("la puerta pide el enlace por correo con un campo y una etiqueta de verdad", async ({
  page,
}) => {
  await page.goto("/signin?callbackUrl=%2Fpublicar");

  await expect(page.getByText("o con tu correo")).toBeVisible();
  // Etiqueta real asociada al control: `getByLabel` sólo lo encuentra si el
  // `for`/`id` existe de verdad, que es lo que la lectura asistida necesita.
  const campo = page.getByLabel("Correo");
  await expect(campo).toHaveAttribute("type", "email");
  // Sin una línea de script, esto es lo único que impide mandar un campo vacío.
  await expect(campo).toHaveAttribute("required", "");
  await expect(page.getByRole("button", { name: "Enviarme el enlace" })).toBeVisible();
  // Dos formularios —Google y el correo— y los dos POST nativos.
  await expect(page.locator("form")).toHaveCount(2);
  await expect(page.locator("form").nth(1)).toHaveAttribute("method", /post/i);
});

/**
 * **La pantalla de espera, con el script apagado** (15.9, láminas 8c/9c).
 *
 * El comprobante se pone como cookie porque es lo que tendría el navegador que
 * acaba de pedir el enlace: la dirección tecleada no viaja en la barra. Lo que
 * se mide acá es justamente lo que la 15.12 promete que sobrevive sin
 * JavaScript — la cuenta regresiva del reenvío y la salida a Google.
 */
test("la espera del enlace se lee entera y sus dos salidas funcionan sin JavaScript", async ({
  page,
  baseURL,
}) => {
  const comprobante = (sentAtMs: number) => ({
    name: "rentas_enlace",
    value: encodeURIComponent(
      JSON.stringify({ a: "maria.f@gmail.com", t: sentAtMs, r: "/publicar" }),
    ),
    url: `${baseURL ?? "http://localhost:3000"}/signin`,
    httpOnly: true,
  });

  await page.context().addCookies([comprobante(Date.now())]);
  await page.goto("/signin/revisa-tu-correo");

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Revisá tu correo");
  // La dirección tecleada, de vuelta: es como se caza el tipeo sin volver.
  await expect(page.getByText("maria.f@gmail.com", { exact: true })).toBeVisible();
  // Acotada al `<main>` por la misma razón que la de `/signin`: el pie tiene su
  // propia lista de enlaces y no es lo que esta pantalla vino a medir.
  await expect(page.getByRole("main").getByRole("listitem")).toHaveCount(3);
  await expect(page.getByText("El enlace sirve una sola vez y vence en 15 minutos.")).toBeVisible();
  // **La cuenta, servida por el servidor.** No tictaquea sin script, y no hace
  // falta que lo haga: dice cuándo se puede, que es lo que se vino a saber.
  await expect(page.getByText(/^Volver a enviar en \d:\d\d$/)).toBeVisible();
  await expect(page.getByRole("button", { name: /Volver a enviar/ })).toHaveCount(0);
  // Las dos salidas: nadie queda atrapado esperando (F20).
  await expect(page.getByRole("button", { name: "Mejor entro con Google" })).toBeVisible();
  await expect(page.getByRole("link", { name: "← Cambiar de correo" })).toHaveAttribute(
    "href",
    "/signin?callbackUrl=%2Fpublicar",
  );

  // Pasada la ventana, el reenvío es un formulario de verdad y no un texto.
  await page.context().clearCookies();
  await page.context().addCookies([comprobante(Date.now() - 120_000)]);
  await page.reload();

  await expect(page.getByRole("button", { name: "Volver a enviar el enlace" })).toBeVisible();
  await expect(page.locator("form")).toHaveCount(2);
  await expect(page.locator("form").first()).toHaveAttribute("method", /post/i);
});
