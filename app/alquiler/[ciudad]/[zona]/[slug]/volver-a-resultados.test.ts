import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * **La 16.9 atada entre el que escribe el enlace y el que lo lee**, que es la
 * clase de defecto que no rompe nada visible: si los dos lados no usan el mismo
 * nombre de parámetro, la ficha se dibuja igual, el «← Resultados» cae en el
 * respaldo y nadie ve un error. Es el mismo motivo por el que existe
 * `signin-return.test.ts` al lado, y se comprueba igual — leyendo los archivos
 * en vez de renderizando —, porque lo que puede fallar es una relación entre
 * ellos y no el comportamiento de uno.
 *
 * Lo que estas aserciones sostienen es una sola cosa: **a dónde vuelve una
 * persona lo decide el dominio, no esta página.** La regla del fundador —
 * nunca una regla de negocio en el frente — con su razón práctica al lado: el
 * suelo de cobertura del 90 % llega a `domain/` y no llega a `app/`.
 */
const FICHA = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const DOMAIN = "@/modules/listing-discovery/domain/return-to-results";

describe("«← Resultados» vuelve a donde el visitante estaba (16.9)", () => {
  it("la ficha resuelve la vuelta con el dominio y no con una plantilla propia", () => {
    expect(FICHA).toMatch(
      new RegExp(`import \\{[^}]*\\bresultsLink\\b[^}]*\\} from "${DOMAIN}"`, "s"),
    );
  });

  /**
   * El destino **y** el texto salen los dos del dominio. Dibujar «← Resultados»
   * fijo sobre un `href` variable es el defecto original escrito al revés:
   * quien llega desde el inicio leería una promesa de volver a una pantalla
   * donde nunca estuvo.
   */
  it("la barra dibuja el destino y el texto que el dominio decidió", () => {
    expect(FICHA).toContain("back.href");
    expect(FICHA).toContain("back.label");
  });

  it("el nombre del parámetro nunca se escribe a mano", () => {
    // Escrito dos veces, un renombre en un solo lado se ignora EN SILENCIO.
    expect(FICHA).toContain("RETURN_PARAM");
    expect(FICHA).not.toMatch(/["'`]volver["'`]/);
  });

  /**
   * La ficha se redirige a su ruta canónica (11.1). Sin pasarle el origen, esa
   * redirección lo tira — y deja sin vuelta justo a quien llegó con el título
   * viejo desde una búsqueda, que es el enlace que circula por WhatsApp.
   */
  it("la redirección canónica recibe el origen en vez de perderlo", () => {
    const call = /resolveListingRoute\(([\s\S]*?)\n {2}\);/.exec(FICHA)?.[1];

    expect(call).toBeDefined();
    expect(call).toContain("returnTo");
  });

  /**
   * F19: después de entrar se vuelve a ESTA ficha. Si el enlace de vuelta no
   * lleva el origen, quien entra reaparece en el aviso con el «← Resultados»
   * ya degradado al respaldo, y la búsqueda que venía armando se perdió en la
   * pantalla de entrar.
   */
  it("volver de la pantalla de entrar no pierde el origen", () => {
    expect(FICHA).toContain("withResultsOrigin");
    expect(FICHA).toMatch(/callbackUrl=\$\{encodeURIComponent\(listingHref\)\}/);
  });

  /** Sin JavaScript de cliente en el camino base (D13): es un enlace. */
  it("no agrega JavaScript de cliente", () => {
    expect(FICHA).not.toContain('"use client"');
    expect(FICHA).not.toContain("history.back");
    expect(FICHA).not.toContain("referrer");
  });
});
