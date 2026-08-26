import { expect, test } from "@playwright/test";

/**
 * El control de cuenta del nav (diseño 14a/14b) y la ruta que protege.
 *
 * **Lo que esta capa puede probar hoy, y lo que no.** `/mis-avisos` está
 * protegida por sesión (`strategy: "database"`, `identity/infrastructure/
 * auth.ts`) — no hay forma de fabricar una cookie de sesión válida sin
 * escribir la fila real en Postgres, y este runner no tiene credenciales de
 * escritura contra la base de una vista previa desplegada. Por eso el
 * caso "con sesión, el control lleva a `/mis-avisos` con JavaScript
 * apagado" está probado de forma DETERMINISTA en
 * `components/organisms/AccountMenu.test.tsx` y
 * `components/organisms/Nav.test.tsx` (`renderToStaticMarkup`, sin
 * hidratar nunca, exactamente los bytes que un rastreador recibe) — corre
 * en cada `push`, sin depender de una vista previa desplegada ni de un
 * secreto de bypass, que es una garantía más fuerte que la que este
 * archivo podría dar.
 *
 * **Lo que SÍ corre acá, en todas partes y sin `test.skip`.** Sin cookie de
 * sesión, `auth()` nunca toca la base — la misma razón por la que
 * `publish-access.spec.ts` prueba `/publicar` sin vista previa. Un
 * visitante anónimo que pide `/mis-avisos` tiene que caer en `/signin` con
 * el `callbackUrl` correcto, la misma garantía de "protected action" que
 * ya prueba `/publicar`, aplicada a la ruta que el nav de este trabajo
 * enlaza.
 */
test("`/mis-avisos` sin sesión cae en /signin con el callbackUrl correcto", async ({ page }) => {
  const response = await page.goto("/mis-avisos");

  expect(response?.status()).toBe(200);
  await expect(page).toHaveURL(/\/signin\?callbackUrl=%2Fmis-avisos$/);
});
