import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NOT_FOUND_SCREEN, resolveErrorScreen } from "@/modules/operability/domain/failure-report";
import ErrorBoundary from "./error";
import GlobalErrorBoundary from "./global-error";
import NotFound from "./not-found";

/**
 * **Lo que un visitante recibe cuando el servidor falla** (tareas 11b.2 y
 * 11b.3), en los bytes que salen de la ruta.
 *
 * `renderToStaticMarkup` devuelve exactamente el marcado del servidor sin
 * ejecutar una línea de cliente, que es el punto entero: estas tres pantallas
 * son el camino de lectura y **no hay exención que las cubra**. Es la misma
 * disciplina de `ficha-vencida.test.tsx`, y por la misma razón — este
 * repositorio ya tuvo una prueba que afirmaba una cadena del fuente mientras
 * la pantalla se dibujaba mal.
 *
 * Lo que reemplazan: hoy quien encuentra un fallo lee *«Application error: a
 * server-side exception has occurred»* más un hash, en inglés, sin una salida.
 */

const error = Object.assign(new Error("connect ECONNREFUSED 10.0.0.4:5432"), {
  digest: "3f5d1a9c2b",
});

/** Un ancla de verdad hacia el destino, no un `<button>` que sin script no navega. */
function anchorTo(markup: string, href: string): boolean {
  return new RegExp(`<a [^>]*href="${href.replace("/", "\\/")}"[^>]*>`).test(markup);
}

describe("app/error.tsx", () => {
  const markup = renderToStaticMarkup(<ErrorBoundary error={error} reset={() => {}} />);

  it("dice en castellano qué pasó, y no la frase por defecto de Next", () => {
    expect(markup).toContain(resolveErrorScreen("3f5d1a9c2b").heading);
    expect(markup).not.toContain("Application error");
  });

  it("muestra el código que el visitante puede citarnos", () => {
    expect(markup).toContain("3f5d1a9c2b");
  });

  /**
   * **Un digest sirve para buscar; una traza filtra.** El mensaje de este
   * error lleva la dirección interna de la base de datos, y el visitante no
   * tiene por qué verla.
   */
  it("no filtra el mensaje ni la pila del error", () => {
    expect(markup).not.toContain("ECONNREFUSED");
    expect(markup).not.toContain("10.0.0.4");
  });

  it("ofrece una salida que funciona con el script apagado", () => {
    expect(anchorTo(markup, "/")).toBe(true);
    expect(markup).toContain("Ir al inicio");
  });
});

describe("app/global-error.tsx", () => {
  const markup = renderToStaticMarkup(<GlobalErrorBoundary error={error} reset={() => {}} />);

  /**
   * **Reemplaza el documento entero, incluidos `<html>` y `<body>`**, así que
   * no puede apoyarse en nada que la aplicación normalmente provea. Sin estos
   * dos atributos ninguna propiedad personalizada de `tokens.css` queda
   * declarada y la pantalla se dibuja sin una sola regla del sistema — el
   * fallo del fallo.
   */
  it("vuelve a poner los atributos de la raíz que el layout ya no está para poner", () => {
    expect(markup).toContain('lang="es"');
    expect(markup).toContain('data-theme="menta"');
    expect(markup).toContain('data-layout="compacto"');
    expect(markup).toContain("<body>");
  });

  it("dice lo mismo y ofrece la misma salida que la frontera de ruta", () => {
    expect(markup).toContain(resolveErrorScreen("3f5d1a9c2b").heading);
    expect(anchorTo(markup, "/")).toBe(true);
  });
});

describe("app/not-found.tsx", () => {
  const markup = renderToStaticMarkup(<NotFound />);

  it("dice que no encontramos la página, sin decir por qué", () => {
    expect(markup).toContain(NOT_FOUND_SCREEN.heading);
    expect(markup.toLowerCase()).not.toContain("vencid");
    expect(markup.toLowerCase()).not.toContain("eliminad");
  });

  it("ofrece una salida que funciona con el script apagado", () => {
    expect(anchorTo(markup, "/")).toBe(true);
  });

  /**
   * Una dirección que no existe no es contenido. Sin esto Google indexa
   * cada enlace mal copiado que circula por WhatsApp.
   */
  it("sale del índice", () => {
    expect(markup).toMatch(/<meta name="robots" content="noindex[^"]*"\/?>/);
  });
});
