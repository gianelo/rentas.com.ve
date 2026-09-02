import { describe, expect, it } from "vitest";
import {
  type ContactVerificationEvidence,
  decideContactVerification,
} from "./contact-verification";

/**
 * tasks.md 19.9, 19.10 y 19.11 — «la verificación pertenece al valor, no a la
 * persona», y deja de valer a los doce meses.
 *
 * **Corrección al encabezado que este archivo tenía, con su razón (AGENTS.md
 * §5).** Decía que acá no se compara ni una fecha porque los doce meses de la
 * 19.11 iban a vivir en el `WHERE` del puerto de lectura. Ese puerto lo
 * comparten publicar y la ficha, así que el `WHERE` habría borrado la frase de
 * un aviso ya publicado y todavía activo el día que su verificación caduca —
 * la invalidación que la 19.12 prohíbe. La ventana vive entonces acá, donde
 * sólo la mira el camino de publicar, y `now` entra como parámetro igual que
 * en `isVerificationLinkExpired`, `isExpired` y `resolveListingAvailability`:
 * es lo que mantiene la función pura y su prueba repetible.
 *
 * Las fechas literales siguen siendo seguras porque el reloj también es
 * literal: ninguna comparación de acá cambia de significado cuando pase el
 * calendario, que es el defecto que este proyecto ya se comió dos veces.
 */

const NOW = new Date("2026-08-25T12:00:00.000Z");
const VERIFIED_AT = new Date("2026-03-11T09:30:00.000Z");
const EMAIL_VERIFIED_AT = new Date("2026-01-04T18:00:00.000Z");
/** Once meses antes de `NOW`: dentro de la ventana por un mes entero. */
const HACE_ONCE_MESES = new Date("2025-09-25T12:00:00.000Z");
/** Trece meses antes de `NOW`: afuera por un mes entero. */
const HACE_TRECE_MESES = new Date("2025-07-25T12:00:00.000Z");

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
      NOW,
    );

    expect(decision).toEqual({ kind: "already-verified", verifiedAt: VERIFIED_AT });
  });

  it("da por verificado el correo de la propia cuenta, y con el instante en que Auth.js lo verificó", () => {
    const decision = decideContactVerification(
      { method: "email", value: "maria@example.com" },
      evidence(),
      NOW,
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
      NOW,
    );

    expect(decision).toEqual({ kind: "verified-by-account-email", verifiedAt: EMAIL_VERIFIED_AT });
  });

  it("no verifica un correo que no es el de la cuenta", () => {
    const decision = decideContactVerification(
      { method: "email", value: "otra@example.com" },
      evidence(),
      NOW,
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
      NOW,
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
      expect(
        decideContactVerification({ method, value: "maria@example.com" }, evidence(), NOW),
      ).toEqual({ kind: "unverified" });
    }
  });

  it("no verifica nada cuando la cuenta no existe", () => {
    expect(
      decideContactVerification({ method: "email", value: "maria@example.com" }, null, NOW),
    ).toEqual({ kind: "unverified" });
  });

  it("no verifica un valor en blanco ni una cuenta sin correo", () => {
    expect(decideContactVerification({ method: "email", value: "   " }, evidence(), NOW)).toEqual({
      kind: "unverified",
    });
    expect(
      decideContactVerification(
        { method: "email", value: "maria@example.com" },
        evidence({ accountEmail: null }),
        NOW,
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
      NOW,
    );

    expect(decision).toEqual({ kind: "already-verified", verifiedAt: VERIFIED_AT });
  });
});

/**
 * tasks.md 19.11 — «la verificación caduca a los doce meses» (fundador,
 * 2026-08-22). Los números venezolanos se reciclan, y una verificación de dos
 * años puede pertenecer a otra persona.
 *
 * **Las dos direcciones, siempre.** Una sola de las dos pasaría con la
 * comparación entera borrada: sin la de once meses, «nada verifica» sería
 * verde; sin la de trece, «todo verifica» también.
 */
describe("los doce meses de la 19.11", () => {
  it("una fila de once meses todavía contesta", () => {
    const decision = decideContactVerification(
      { method: "whatsapp", value: "+58 412 555 0134" },
      evidence({ verifiedAt: HACE_ONCE_MESES }),
      NOW,
    );

    expect(decision).toEqual({ kind: "already-verified", verifiedAt: HACE_ONCE_MESES });
  });

  it("una fila de trece meses ya no contesta, y el teléfono queda sin verificar", () => {
    const decision = decideContactVerification(
      { method: "whatsapp", value: "+58 412 555 0134" },
      evidence({ verifiedAt: HACE_TRECE_MESES }),
      NOW,
    );

    expect(decision).toEqual({ kind: "unverified" });
  });

  it("el corte es a los doce meses exactos: ese instante ya caducó, y un segundo después no", () => {
    // Mismo borde que `resolveListingAvailability` y que el `WHERE verified_at
    // > $desde` que el puerto tenía escrito: `>` y no `>=`, así que los doce
    // meses cumplidos son el primer instante que ya no vale.
    const justo = new Date("2025-08-25T12:00:00.000Z");
    const unSegundoDespues = new Date(justo.getTime() + 1000);
    const chosen = { method: "whatsapp", value: "+58 412 555 0134" } as const;

    expect(decideContactVerification(chosen, evidence({ verifiedAt: justo }), NOW)).toEqual({
      kind: "unverified",
    });
    expect(
      decideContactVerification(chosen, evidence({ verifiedAt: unSegundoDespues }), NOW),
    ).toEqual({ kind: "already-verified", verifiedAt: unSegundoDespues });
  });

  it("la fila caducada de un correo propio se vuelve a verificar con el instante de la cuenta", () => {
    // **«A publish whose verification has lapsed re-verifies», literal.** La
    // fila vieja no gana por existir: cae, y el atajo del correo (19.10)
    // vuelve a contestar con el instante que Auth.js dejó — que es el que el
    // `upsert` va a mover hacia adelante.
    const decision = decideContactVerification(
      { method: "email", value: "maria@example.com" },
      evidence({ verifiedAt: HACE_TRECE_MESES }),
      NOW,
    );

    expect(decision).toEqual({ kind: "verified-by-account-email", verifiedAt: EMAIL_VERIFIED_AT });
  });

  it("el atajo del correo también caduca: un `emailVerified` de trece meses no verifica nada", () => {
    // La 19.10 ya lo daba por decidido al escribir `user.emailVerified` en vez
    // de `now()` — «usar el reloj de publicar le regalaría un año a la
    // caducidad de la 19.11». Sin esto, ese instante viejo entraría igual y se
    // escribiría ya caducado, y la publicación siguiente lo volvería a
    // escribir: cincuenta avisos, cincuenta escrituras (19.13).
    const decision = decideContactVerification(
      { method: "email", value: "maria@example.com" },
      evidence({ accountEmailVerifiedAt: HACE_TRECE_MESES }),
      NOW,
    );

    expect(decision).toEqual({ kind: "unverified" });
  });

  it("un `emailVerified` de once meses sí verifica", () => {
    const decision = decideContactVerification(
      { method: "email", value: "maria@example.com" },
      evidence({ accountEmailVerifiedAt: HACE_ONCE_MESES }),
      NOW,
    );

    expect(decision).toEqual({ kind: "verified-by-account-email", verifiedAt: HACE_ONCE_MESES });
  });
});
