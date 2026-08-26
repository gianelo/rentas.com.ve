import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * **La barra del producto, en la ficha** (tasks.md 14g; 14.38: "la marca cede
 * su lugar al ← en la ficha, porque en una ficha volver vale más que ir al
 * inicio").
 *
 * Se comprueba leyendo el archivo y no renderizando, igual que
 * `volver-a-resultados.test.ts` al lado: lo que puede fallar es una relación
 * entre esta página y el dominio que decide por ella, no el comportamiento de
 * un componente — eso ya lo prueban `Nav.test.tsx` y `SearchPill.test.tsx`.
 */
const FICHA = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

describe("la ficha cede la marca al enlace de vuelta (14.38)", () => {
  it("la guarda: el archivo que se está midiendo es la ficha", () => {
    // Sin esto, un `page.tsx` movido de lugar dejaría a toda la suite midiendo
    // una cadena vacía y pasando por eso — la peor forma de verde.
    expect(FICHA).toContain("export default async function FichaPage");
  });

  it("dibuja el Nav del producto en vez de un encabezado propio", () => {
    expect(FICHA).toContain("<Nav");
    // El encabezado ad hoc que la ficha tenía. Dos encabezados arrancan
    // idénticos y se separan en el primer arreglo apurado.
    expect(FICHA).not.toContain("styles.bar");
  });

  /**
   * **El `←` no se dibuja acá: llega dentro de la etiqueta que compone el
   * dominio.** `resultsLink` devuelve «← Resultados» cuando hay una búsqueda a
   * la que volver y «Ver avisos en Chacao» cuando no la hay, y esa diferencia
   * es la regla entera (16.9). Una flecha clavada en esta página dibujaría las
   * dos iguales y le prometería una vuelta a quien llegó desde Google.
   */
  it("le pasa al Nav el destino y el texto que decidió el dominio", () => {
    expect(FICHA).toMatch(/back=\{\{[\s\S]*?href:\s*back\.href[\s\S]*?\}\}/);
    expect(FICHA).toMatch(/back=\{\{[\s\S]*?label:\s*back\.label[\s\S]*?\}\}/);
    // Ninguna flecha escrita en la página: la trae la etiqueta del dominio.
    expect(FICHA).not.toContain('"←"');
    expect(FICHA).not.toContain(">←<");
  });

  /**
   * **RESUELTO por el fundador: «seguí el diseño, que fue lo que se decidió
   * acá».** Ninguna de las dos láminas de la ficha dibuja la pastilla — la 11
   * (escritorio) gasta el slot central en la marca y la 10 (móvil) dibuja sólo
   * dos hijos. Eso acota la 14i, que decía «la pastilla aparece en todas las
   * páginas», a «en todas menos la ficha»: una ficha no es una búsqueda.
   *
   * Se comprueba que la página no la ARME, no sólo que no la pase: dejar el
   * `homeSearchForm` colgando sería trabajo muerto que el próximo arreglo
   * apurado vuelve a enchufar.
   */
  it("no arma ninguna pastilla: la ficha no la lleva (láminas 10 y 11)", () => {
    expect(FICHA).not.toContain("homeSearchForm");
    expect(FICHA).not.toContain("SearchPillProps");
  });

  it("resuelve el estado de la barra en el dominio y no en la página", () => {
    expect(FICHA).toContain("resolveNavAccount(");
    expect(FICHA).toContain("resolveNavPublish(");
  });

  /**
   * **Una sola lectura de sesión por petición.** La ficha ya la necesitaba para
   * el bloque de contacto; la barra la necesita para el control de cuenta. Con
   * estrategia `database`, dos lecturas son dos viajes HTTP a Neon en la
   * pantalla más visitada del sitio. `app/_lib/session.ts` las deduplica con el
   * mismo `cache` de React que esta página ya usa para `findDetail`.
   */
  it("lee la sesión una sola vez, por el puerto memoizado", () => {
    expect(FICHA).toContain("requestSessionPort");
    // El puerto sin memoizar no se importa acá: importarlo es cómo vuelve la
    // segunda consulta sin que nadie lo note.
    expect(FICHA).not.toContain("nextAuthSessionPort");
  });

  /**
   * El adaptador de cartera que `/mis-avisos` consulta para `canImportListings`
   * no se llama en el camino de lectura: la barra no lo mira, y sería una
   * consulta por ficha abierta a cambio de nada.
   */
  it("no consulta la cartera del importador", () => {
    expect(FICHA).not.toContain("BulkImportAccounts");
  });
});
