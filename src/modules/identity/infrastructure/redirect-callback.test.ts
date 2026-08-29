import { beforeAll, describe, expect, it, vi } from "vitest";
import { SIGN_IN_WAIT_PATH } from "../domain/safe-return-destination";
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
  interface ConfiguracionDeAuth {
    readonly callbacks?: { redirect?: unknown };
    readonly pages?: { verifyRequest?: unknown };
  }

  const capturada: { valor: unknown } = { valor: undefined };

  /**
   * **Se importa una sola vez**, y eso no es una optimización: el registro de
   * módulos cachea `./auth`, así que un segundo `await import` no vuelve a
   * llamar a `NextAuth` y la segunda prueba leería `undefined` — medido.
   */
  beforeAll(async () => {
    vi.doMock("next-auth", () => ({
      default: (config: unknown) => {
        capturada.valor = config;
        return { handlers: {}, auth: () => null, signIn: () => {}, signOut: () => {} };
      },
    }));
    vi.doMock("@/shared/db/client", () => ({ db: {} }));
    vi.doMock("@auth/drizzle-adapter", () => ({ DrizzleAdapter: () => ({}) }));

    await import("./auth");
  });

  function configuracionDeAuth(): ConfiguracionDeAuth {
    return capturada.valor as ConfiguracionDeAuth;
  }

  it("le pasa `signInRedirect` a NextAuth como `callbacks.redirect`", () => {
    expect(configuracionDeAuth().callbacks?.redirect).toBe(signInRedirect);
  });

  /**
   * **La pantalla en inglés de la librería deja de ser alcanzable** (15.9,
   * 22.22). Sin esta línea, quien pide el enlace por correo aterriza en la
   * página que trae Auth.js: en inglés, sin la dirección tecleada y sin salida.
   * Se afirma acá porque es una configuración que ninguna otra prueba toca —
   * el arnés de la ida y vuelta arma su propio `NextAuth`.
   */
  it("apunta `pages.verifyRequest` a la pantalla de espera y no a la de Auth.js", () => {
    expect(configuracionDeAuth().pages?.verifyRequest).toBe(SIGN_IN_WAIT_PATH);
  });
});
