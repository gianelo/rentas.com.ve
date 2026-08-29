import { describe, expect, it, vi } from "vitest";
import { signInRedirect } from "./redirect-callback";

/**
 * El adaptador entre el contrato de Auth.js y la regla del producto (tasks.md
 * 15.10, F19). No decide nada: traduce la dirección que la librería entrega a
 * la ruta que `safeSignInReturn` sabe juzgar, y la vuelve a armar.
 */
const BASE = "https://rentas.com.ve";
const FICHA = "/alquiler/distrito-capital/chacao/apto-abc123";

describe("signInRedirect", () => {
  it.each([
    ["la ruta pelada de una puerta", "/publicar", "/publicar"],
    ["la dirección absoluta de una ficha", `${BASE}${FICHA}`, FICHA],
    ["la búsqueda de origen que la ficha lleva", `${FICHA}?desde=%2Fx`, `${FICHA}?desde=%2Fx`],
  ])("conserva %s", (_caso, url, esperado) => {
    expect(signInRedirect({ url, baseUrl: BASE })).toBe(`${BASE}${esperado}`);
  });

  // La lista de puertas la afirma el dominio; acá van los casos que el adaptador
  // agrega —traducir de absoluto a ruta— más el inicio, que es el que la F19
  // nombra y el único que Auth.js sola dejaría pasar.
  it.each([
    ["el inicio, que la F19 prohíbe por su nombre", `${BASE}/`],
    ["otro origen escrito completo", "https://evil.test/publicar"],
    ["un dominio que empieza igual que el nuestro", "https://rentas.com.ve.evil.test/publicar"],
    ["basura que ni siquiera parsea", "://"],
  ])("cae al inicio ante %s", (_caso, url) => {
    expect(signInRedirect({ url, baseUrl: BASE })).toBe(BASE);
  });
});

/**
 * **Que la regla exista no la instala.** Las pruebas de arriba y las del arnés
 * arman su propio `NextAuth`, así que ninguna se rompe si `auth.ts` deja de
 * pasarla: dos lados verdes y el medio vacío, el hueco que este repositorio ya
 * encontró antes. Se afirma sobre la configuración que `auth.ts` entrega y no
 * sobre el texto del archivo — un `toContain("signInRedirect")` quedaría verde
 * con la línea adentro de un comentario.
 */
describe("auth.ts instala la regla", () => {
  it("le pasa `signInRedirect` a NextAuth como `callbacks.redirect`", async () => {
    const configuracion: { valor: unknown } = { valor: undefined };

    vi.doMock("next-auth", () => ({
      default: (config: unknown) => {
        configuracion.valor = config;
        return { handlers: {}, auth: () => null, signIn: () => {}, signOut: () => {} };
      },
    }));
    vi.doMock("@/shared/db/client", () => ({ db: {} }));
    vi.doMock("@auth/drizzle-adapter", () => ({ DrizzleAdapter: () => ({}) }));

    await import("./auth");

    expect(
      (configuracion.valor as { callbacks?: { redirect?: unknown } }).callbacks?.redirect,
    ).toBe(signInRedirect);
  });
});
