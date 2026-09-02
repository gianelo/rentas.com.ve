import { describe, expect, it } from "vitest";
import type { AccountEmailVerified } from "../domain/provider-email-verification";
import { recordProviderEmailVerification } from "./record-provider-email-verification";

/**
 * tasks.md 19.14 — la costura entre la regla y la escritura: leer nada,
 * preguntarle al dominio con el reloj, y escribir SÓLO cuando hay afirmación.
 */

const NOW = new Date("2026-09-02T15:00:00.000Z");
const CORREO = "maria.f@gmail.com";

function dependencias() {
  const escrito: AccountEmailVerified[] = [];
  return {
    escrito,
    accounts: { markEmailVerified: async (v: AccountEmailVerified) => void escrito.push(v) },
    now: () => NOW,
  };
}

describe("recordProviderEmailVerification (19.14)", () => {
  it("escribe el instante de la entrada por Google sobre la cuenta que entró", async () => {
    const deps = dependencias();

    await recordProviderEmailVerification(
      {
        userId: "usuario-1",
        providerId: "google",
        profile: { email: CORREO, email_verified: true },
        accountEmail: CORREO,
      },
      deps,
    );

    expect(deps.escrito).toEqual([{ userId: "usuario-1", verifiedAt: NOW }]);
  });

  /**
   * La puerta del enlace por correo pasa por acá también —`events.signIn` es
   * uno solo— y su fecha ya la escribió Auth.js. Que no escriba es lo que
   * impide que esta entrega le mueva el instante a quien no lo pidió.
   */
  it("no escribe nada cuando la entrada no trae la afirmación del proveedor", async () => {
    const deps = dependencias();

    await recordProviderEmailVerification(
      { userId: "usuario-1", providerId: "email", accountEmail: CORREO },
      deps,
    );

    expect(deps.escrito).toEqual([]);
  });

  /**
   * **Que un fallo de escritura no cierre la puerta no se garantiza acá**, y
   * por eso no hay `try` que probar: lo garantiza `@auth/core`, que envuelve
   * todos los eventos en el suyo (`lib/init.js:138`). Lo conduce la prueba
   * del arnés, contra la librería de verdad.
   */
});
