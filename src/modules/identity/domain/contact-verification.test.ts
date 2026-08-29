import { describe, expect, it } from "vitest";
import {
  type ContactVerificationEvidence,
  decideContactVerification,
} from "./contact-verification";

/**
 * tasks.md 19.9 y 19.10 — «la verificación pertenece al valor, no a la
 * persona».
 *
 * **No hay una sola comparación de fechas en este archivo, y es a propósito.**
 * Esta regla no decide si una verificación sigue viva: eso es la 19.11 (doce
 * meses) y vive en el `WHERE` del puerto de lectura, igual que
 * `evaluateRevealAllowance` recibe los avisos que ya están dentro de la
 * ventana. Por eso las fechas literales de acá son seguras — ninguna cambia
 * de significado cuando pase el calendario, que es el defecto que este
 * proyecto ya se comió dos veces.
 */

const VERIFIED_AT = new Date("2026-03-11T09:30:00.000Z");
const EMAIL_VERIFIED_AT = new Date("2026-01-04T18:00:00.000Z");

function evidence(
  overrides: Partial<ContactVerificationEvidence> = {},
): ContactVerificationEvidence {
  return {
    verifiedAt: null,
    accountEmail: "maria@example.com",
    accountEmailVerifiedAt: EMAIL_VERIFIED_AT,
    ...overrides,
  };
}

describe("decideContactVerification", () => {
  it("no pide nada cuando el valor elegido ya tiene una fila viva", () => {
    const decision = decideContactVerification(
      { method: "whatsapp", value: "+58 412 555 0134" },
      evidence({ verifiedAt: VERIFIED_AT }),
    );

    expect(decision).toEqual({ kind: "already-verified", verifiedAt: VERIFIED_AT });
  });

  it("da por verificado el correo de la propia cuenta, y con el instante en que Auth.js lo verificó", () => {
    const decision = decideContactVerification(
      { method: "email", value: "maria@example.com" },
      evidence(),
    );

    // El instante es el del inicio de sesión, NO el de publicar: la
    // verificación ocurrió cuando el enlace del correo se usó, y ése es el
    // reloj desde el que la 19.11 tiene que contar sus doce meses.
    expect(decision).toEqual({ kind: "verified-by-account-email", verifiedAt: EMAIL_VERIFIED_AT });
  });

  it("reconoce el correo de la cuenta escrito con otras mayúsculas y con espacios al borde", () => {
    const decision = decideContactVerification(
      { method: "email", value: "  Maria@Example.COM " },
      evidence(),
    );

    expect(decision).toEqual({ kind: "verified-by-account-email", verifiedAt: EMAIL_VERIFIED_AT });
  });

  it("no verifica un correo que no es el de la cuenta", () => {
    const decision = decideContactVerification(
      { method: "email", value: "otra@example.com" },
      evidence(),
    );

    expect(decision).toEqual({ kind: "unverified" });
  });

  it("no verifica el correo de la cuenta mientras Auth.js no haya dejado el instante", () => {
    // Cierra en falso a propósito (AGENTS.md §7). `user.emailVerified` es la
    // única evidencia que este producto guarda de que la dirección se probó;
    // sin ella, «coincide con la cuenta» sólo dice que alguien tecleó su
    // propia dirección, que no prueba nada.
    const decision = decideContactVerification(
      { method: "email", value: "maria@example.com" },
      evidence({ accountEmailVerifiedAt: null }),
    );

    expect(decision).toEqual({ kind: "unverified" });
  });

  it("no verifica un teléfono aunque coincida con el correo verificado de la cuenta", () => {
    // El canal de WhatsApp está diferido (fundador, 2026-08-29) y esto es lo
    // que impide que su ausencia se convierta en un agujero: NINGUNA rama de
    // esta función puede devolver «verificado» para un método que no sea
    // `email` sin una fila viva. No es disciplina, es que el atajo del correo
    // exige `method === "email"` antes de mirar el valor.
    for (const method of ["whatsapp", "telefono"] as const) {
      expect(decideContactVerification({ method, value: "maria@example.com" }, evidence())).toEqual(
        { kind: "unverified" },
      );
    }
  });

  it("no verifica nada cuando la cuenta no existe", () => {
    expect(
      decideContactVerification({ method: "email", value: "maria@example.com" }, null),
    ).toEqual({ kind: "unverified" });
  });

  it("no verifica un valor en blanco ni una cuenta sin correo", () => {
    expect(decideContactVerification({ method: "email", value: "   " }, evidence())).toEqual({
      kind: "unverified",
    });
    expect(
      decideContactVerification(
        { method: "email", value: "maria@example.com" },
        evidence({ accountEmail: null }),
      ),
    ).toEqual({ kind: "unverified" });
  });

  it("la fila viva gana incluso cuando el correo de la cuenta también alcanzaría", () => {
    // Importa porque las dos ramas devuelven instantes distintos, y el que
    // vale es el que la tabla guarda: es el que la 19.11 va a envejecer y el
    // que la ficha (16.34) va a escribir bajo «verificado el …».
    const decision = decideContactVerification(
      { method: "email", value: "maria@example.com" },
      evidence({ verifiedAt: VERIFIED_AT }),
    );

    expect(decision).toEqual({ kind: "already-verified", verifiedAt: VERIFIED_AT });
  });
});
