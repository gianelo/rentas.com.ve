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
  // Los tres pasos de la lámina bajan la ansiedad antes del botón.
  await expect(page.getByRole("listitem")).toHaveCount(3);
  // Un `<button>` suelto no navega sin JavaScript: lo que envía es el
  // formulario, y el método tiene que ser el que el navegador solo entiende.
  await expect(page.locator("form")).toHaveAttribute("method", /post/i);
  await expect(page.getByRole("button", { name: "Continuar con Google" })).toBeVisible();
  // La salida visible (F20): mirar avisos nunca costó una cuenta.
  await expect(page.getByRole("link", { name: "← Volver a los avisos" })).toHaveAttribute(
    "href",
    "/",
  );
});
