import { describe, expect, it } from "vitest";
import {
  composeMagicLinkEmail,
  isVerificationLinkExpired,
  MAGIC_LINK_MAX_AGE_SECONDS,
} from "./magic-link";

describe("MAGIC_LINK_MAX_AGE_SECONDS", () => {
  // F17 lo fija en 15 minutos. Auth.js hereda un día entero si esta constante
  // desaparece de la configuración del proveedor (tasks.md 15.3) — este test
  // es lo que rompe si alguien la borra y deja pasar el default.
  it("son 15 minutos, no el día entero que trae la librería por defecto", () => {
    expect(MAGIC_LINK_MAX_AGE_SECONDS).toBe(15 * 60);
  });
});

describe("composeMagicLinkEmail", () => {
  it("incluye el enlace tal cual, sin envolverlo ni acortarlo", () => {
    const url = "https://rentas.com.ve/api/auth/callback/email?token=abc&email=a%40b.com";

    const email = composeMagicLinkEmail(url);

    expect(email.body).toContain(url);
  });

  it("dice que vale 15 minutos y una sola vez, para que quien lo lee sepa la regla", () => {
    const email = composeMagicLinkEmail("https://rentas.com.ve/x");

    expect(email.body).toContain("15 minutos");
    expect(email.body).toContain("una sola vez");
  });
});

describe("isVerificationLinkExpired", () => {
  const EXPIRES = new Date("2026-08-24T10:00:00.000Z");

  // Espejo de @auth/core: `invite.expires.valueOf() < Date.now()`. En el
  // instante exacto el enlace todavía vale — misma frontera que `isExpired`
  // en listing-lifecycle/domain/expiry.ts.
  it("no está vencido en el instante exacto del vencimiento", () => {
    expect(isVerificationLinkExpired(EXPIRES, EXPIRES)).toBe(false);
  });

  it("está vencido un milisegundo después", () => {
    expect(isVerificationLinkExpired(EXPIRES, new Date(EXPIRES.getTime() + 1))).toBe(true);
  });

  it("todavía vale un milisegundo antes", () => {
    expect(isVerificationLinkExpired(EXPIRES, new Date(EXPIRES.getTime() - 1))).toBe(false);
  });
});
