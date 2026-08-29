import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * **La pantalla de entrar, en los bytes que salen de la ruta** (15.7). Trampa 4
 * del plan: probar una regla y probar que una pantalla la INSTALA son dos
 * afirmaciones distintas, y sólo un render de los bytes prueba la segunda.
 *
 * **El «sin un solo script» NO se afirma acá**: fuera del compilador de Next
 * una Server Action es una función común y React inyecta su propio `<script>`
 * de reenvío, así que sería una afirmación sobre el arnés. La medición está en
 * `tests/e2e/entrar-sin-javascript.spec.ts`, con el script apagado.
 */
vi.mock("@/modules/identity/infrastructure/auth", () => ({
  signIn: vi.fn(async () => undefined),
}));

const { default: SignInPage } = await import("./page");

async function servida(callbackUrl?: string) {
  return renderToStaticMarkup(
    await SignInPage({ searchParams: Promise.resolve(callbackUrl ? { callbackUrl } : {}) }),
  );
}

/** El texto del `<h1>`, comparado entero: `toContain` pasa con un prefijo. */
function titulo(html: string): string {
  return html.match(/<h1[^>]*>([^<]*)<\/h1>/)?.[1] ?? "";
}

const FICHA = "/alquiler/distrito-capital/chacao/apartamento-2h";

describe("la pantalla de entrar sale entera en el HTML (15.7)", () => {
  it("por la puerta de publicar dibuja el título, los tres pasos y un formulario de verdad", async () => {
    const html = await servida("/publicar");

    expect(titulo(html)).toBe("Entrá para publicar tu propiedad");
    expect(html).toContain("Verificás tu teléfono por WhatsApp y el aviso queda activo 30 días.");
    expect(html).toContain("Si ya tenés cuenta, el mismo botón te lleva a tus publicaciones.");
    // Sin JavaScript un `<button>` suelto no envía nada, y ésta es justo la
    // pantalla que no puede fallar.
    expect(html).toMatch(/<form[^>]*>[\s\S]*<button[^>]*type="submit"/);
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html.match(/<main/g)).toHaveLength(1);
  });

  it("por la puerta de un aviso cambia la copia y la salida vuelve a ese aviso", async () => {
    const html = await servida(FICHA);

    expect(titulo(html)).toBe("Entrá y volvés a este aviso");
    expect(html).toContain("Volvés a este mismo aviso al terminar.");
    expect(html).toContain(`href="${FICHA}"`);
    // Y no promete el camino de publicar, que es de otra puerta.
    expect(html).not.toContain("Verificás tu teléfono por WhatsApp");
  });

  /**
   * **Falla cerrado**: sin la regla instalada, la ruta hostil vuelve a salir
   * dentro de un enlace que se ve nuestro, que es lo que un phishing necesita.
   */
  it("un destino que la regla no admite no aparece en los bytes servidos", async () => {
    const html = await servida("https://evil.test/publicar");

    expect(html).not.toContain("evil.test");
    expect(titulo(html)).toBe("Entrá a tu cuenta");
    // Y sin destino la pantalla existe igual: es una ruta que alguien escribe.
    expect(titulo(await servida())).toBe("Entrá a tu cuenta");
  });
});
