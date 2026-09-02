import { describe, expect, it } from "vitest";
import {
  decideProviderEmailVerification,
  type ProviderSignIn,
  providerClaimsVerifiedEmail,
} from "./provider-email-verification";

/**
 * tasks.md 19.14 — «Google verifica el correo MEJOR que el enlace mágico y es
 * el único camino que queda sin fecha».
 *
 * La 19.10 da por verificado el correo propio con el instante que Auth.js
 * dejó al entrar. Por el enlace mágico ese instante existe; por Google no
 * —`@auth/core` 0.41.3 crea la cuenta de OAuth con `emailVerified: null`
 * escrito a mano—, así que la regla cierra en falso justo en el camino más
 * común. Lo que se decide acá es cuándo esa afirmación del proveedor puede
 * escribirse como evidencia, y el instante es el de AHORA porque es ahora
 * cuando el proveedor la hizo: la misma forma que el enlace mágico usa al
 * canjearse, no una fecha inventada hacia atrás.
 *
 * El reloj entra como parámetro, igual que en `contact-verification.ts`, y
 * las fechas son literales para que la prueba no cambie de significado con el
 * calendario.
 */

const NOW = new Date("2026-09-02T15:00:00.000Z");
const CORREO = "maria.f@gmail.com";

function entrada(overrides: Partial<ProviderSignIn> = {}): ProviderSignIn {
  return {
    userId: "usuario-1",
    providerId: "google",
    profile: { email: CORREO, email_verified: true },
    accountEmail: CORREO,
    ...overrides,
  };
}

describe("providerClaimsVerifiedEmail", () => {
  it("lee la afirmación del proveedor, y la ausencia no es un sí", () => {
    expect(providerClaimsVerifiedEmail({ email_verified: true })).toBe(true);
    expect(providerClaimsVerifiedEmail({ email_verified: false })).toBe(false);
    expect(providerClaimsVerifiedEmail({})).toBe(false);
    expect(providerClaimsVerifiedEmail(null)).toBe(false);
  });
});

describe("decideProviderEmailVerification (19.14)", () => {
  it("escribe el instante de AHORA cuando Google afirma que el correo está verificado", () => {
    expect(decideProviderEmailVerification(entrada(), NOW)).toEqual({
      userId: "usuario-1",
      verifiedAt: NOW,
    });
  });

  /**
   * **La negativa que sostiene el encuadre entero de la 19.14.** El `null` de
   * `handle-login.js:260` lo escribe la rama genérica de CUALQUIER proveedor
   * OAuth, así que la tentación es taparlo mirando sólo que `emailVerified`
   * venga vacío. Eso escribiría una fecha para un proveedor que no verificó
   * nada el día que se agregue el segundo — inventar un instante, que es
   * justo lo que el plan prohíbe. La evidencia tiene que venir del proveedor.
   */
  it("no escribe nada para un proveedor del que no se sabe que verifique", () => {
    expect(decideProviderEmailVerification(entrada({ providerId: "facebook" }), NOW)).toBeNull();
  });

  it("no escribe nada cuando el proveedor no afirma que el correo esté verificado", () => {
    const sinAfirmacion = entrada({ profile: { email: CORREO, email_verified: false } });

    expect(decideProviderEmailVerification(sinAfirmacion, NOW)).toBeNull();
  });

  /**
   * El enlace mágico no manda perfil (`events.signIn` de `@auth/core` sólo lo
   * lleva en la rama de OAuth), y su fecha ya la escribió Auth.js.
   */
  it("no escribe nada cuando no llegó perfil del proveedor", () => {
    expect(decideProviderEmailVerification(entrada({ profile: undefined }), NOW)).toBeNull();
  });

  /**
   * **La cuenta que vuelve trae su correo GUARDADO, no el del perfil**
   * (`handle-login.js` devuelve `userByAccount` tal cual). Quien cambió su
   * correo en Google tiene una fila con la dirección vieja, y Google acaba de
   * verificar la nueva: escribir la fecha ahí afirmaría de una dirección algo
   * que nadie dijo de ella.
   */
  it("no escribe nada cuando el correo verificado no es el de la fila", () => {
    const otroCorreo = entrada({ accountEmail: "maria.vieja@gmail.com" });

    expect(decideProviderEmailVerification(otroCorreo, NOW)).toBeNull();
  });

  it("no escribe nada cuando la fila no tiene correo", () => {
    expect(decideProviderEmailVerification(entrada({ accountEmail: null }), NOW)).toBeNull();
  });

  /** La misma dirección escrita con otras mayúsculas o con un espacio pegado. */
  it("sí escribe cuando la dirección es la misma con otras mayúsculas", () => {
    const mismaOtroCase = entrada({
      profile: { email: " Maria.F@Gmail.com ", email_verified: true },
    });

    expect(decideProviderEmailVerification(mismaOtroCase, NOW)).toEqual({
      userId: "usuario-1",
      verifiedAt: NOW,
    });
  });
});
