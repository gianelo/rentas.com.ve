import { describe, expect, it } from "vitest";
import type { ContactVerificationEvidence } from "../domain/contact-verification";
import type {
  ContactVerificationEvidencePort,
  ContactVerificationQuery,
  NewVerifiedContact,
  VerifiedContactPort,
} from "./ports/verified-contact.port";
import { resolveContactVerification } from "./resolve-contact-verification";

/**
 * tasks.md 19.9 / 19.10 — lo único que decide esta capa: qué se lee, qué se
 * escribe y qué NO se escribe. La regla en sí está probada en
 * `contact-verification.test.ts` y la clave natural contra Postgres de verdad
 * en `tests/integration/contact-verification.test.ts`.
 */

const MARIA = "usr_maria";
const NOW = new Date("2026-08-25T12:00:00.000Z");
const EMAIL_VERIFIED_AT = new Date("2026-02-02T12:00:00.000Z");
const LIVE_VERIFIED_AT = new Date("2026-05-20T08:00:00.000Z");
/** Trece meses antes de `NOW` — afuera de la ventana de la 19.11. */
const CADUCADA = new Date("2025-07-25T12:00:00.000Z");

function evidencePort(
  evidence: ContactVerificationEvidence | null,
): ContactVerificationEvidencePort & { readonly asked: ContactVerificationQuery[] } {
  const asked: ContactVerificationQuery[] = [];
  return {
    asked,
    async findEvidence(query) {
      asked.push(query);
      return evidence;
    },
  };
}

function recordingPort(): VerifiedContactPort & { readonly written: NewVerifiedContact[] } {
  const written: NewVerifiedContact[] = [];
  return {
    written,
    async record(verified) {
      written.push(verified);
    },
  };
}

const ACCOUNT: ContactVerificationEvidence = {
  verifiedAt: null,
  accountEmail: "maria@example.com",
  accountEmailVerifiedAt: EMAIL_VERIFIED_AT,
};

describe("resolveContactVerification", () => {
  it("pregunta por el triple exacto que se eligió, no sólo por la cuenta", async () => {
    const evidence = evidencePort(ACCOUNT);

    await resolveContactVerification(
      { userId: MARIA, contact: { method: "whatsapp", value: "+58 412 555 0134" } },
      { evidence, verifiedContacts: recordingPort(), now: () => NOW },
    );

    expect(evidence.asked).toEqual([
      { userId: MARIA, contact: { method: "whatsapp", value: "+58 412 555 0134" } },
    ]);
  });

  it("registra el correo de la cuenta con el instante de Auth.js, no con el de publicar", async () => {
    const verifiedContacts = recordingPort();

    const decision = await resolveContactVerification(
      { userId: MARIA, contact: { method: "email", value: "maria@example.com" } },
      { evidence: evidencePort(ACCOUNT), verifiedContacts, now: () => NOW },
    );

    expect(decision).toEqual({ kind: "verified-by-account-email", verifiedAt: EMAIL_VERIFIED_AT });
    expect(verifiedContacts.written).toEqual([
      {
        userId: MARIA,
        contact: { method: "email", value: "maria@example.com" },
        verifiedAt: EMAIL_VERIFIED_AT,
      },
    ]);
  });

  it("no vuelve a escribir cuando el valor ya tenía una fila viva", async () => {
    const verifiedContacts = recordingPort();

    const decision = await resolveContactVerification(
      { userId: MARIA, contact: { method: "whatsapp", value: "+58 412 555 0134" } },
      {
        evidence: evidencePort({ ...ACCOUNT, verifiedAt: LIVE_VERIFIED_AT }),
        verifiedContacts,
        now: () => NOW,
      },
    );

    expect(decision).toEqual({ kind: "already-verified", verifiedAt: LIVE_VERIFIED_AT });
    expect(verifiedContacts.written).toEqual([]);
  });

  it("no escribe absolutamente nada para un teléfono sin verificar", async () => {
    // El canal de WhatsApp está diferido (fundador, 2026-08-29). Ésta es la
    // frontera que impide que su ausencia se lea como verificación: no hay
    // fila, y sin fila la ficha no tiene qué fecha escribir.
    const verifiedContacts = recordingPort();

    const decision = await resolveContactVerification(
      { userId: MARIA, contact: { method: "whatsapp", value: "+58 412 555 0134" } },
      { evidence: evidencePort(ACCOUNT), verifiedContacts, now: () => NOW },
    );

    expect(decision).toEqual({ kind: "unverified" });
    expect(verifiedContacts.written).toEqual([]);
  });

  it("no escribe nada para un correo que no es el de la cuenta", async () => {
    const verifiedContacts = recordingPort();

    const decision = await resolveContactVerification(
      { userId: MARIA, contact: { method: "email", value: "contacto@inmobiliaria.com" } },
      { evidence: evidencePort(ACCOUNT), verifiedContacts, now: () => NOW },
    );

    expect(decision).toEqual({ kind: "unverified" });
    expect(verifiedContacts.written).toEqual([]);
  });

  /**
   * tasks.md 19.11 — la mitad de la caducidad que esta capa decide: qué se
   * ESCRIBE cuando la fila vieja ya no vale. La regla en sí está probada en
   * `contact-verification.test.ts`; lo que se mide acá es que la fila caducada
   * deje de frenar la escritura, que es lo que hace que «se vuelve a
   * verificar» signifique algo en la tabla y no sólo en el tipo devuelto.
   */
  it("vuelve a escribir la fila caducada, moviéndole el instante hacia adelante", async () => {
    const verifiedContacts = recordingPort();

    const decision = await resolveContactVerification(
      { userId: MARIA, contact: { method: "email", value: "maria@example.com" } },
      {
        evidence: evidencePort({ ...ACCOUNT, verifiedAt: CADUCADA }),
        verifiedContacts,
        now: () => NOW,
      },
    );

    expect(decision).toEqual({ kind: "verified-by-account-email", verifiedAt: EMAIL_VERIFIED_AT });
    expect(verifiedContacts.written).toEqual([
      {
        userId: MARIA,
        contact: { method: "email", value: "maria@example.com" },
        verifiedAt: EMAIL_VERIFIED_AT,
      },
    ]);
  });

  it("una fila caducada de un teléfono no escribe nada: no hay canal con qué re-verificar", async () => {
    // El par negativo del de arriba. El canal de WhatsApp está diferido
    // (fundador, 2026-08-29), así que una verificación de teléfono que caduca
    // no se renueva sola — y lo que NO puede pasar es que se reescriba con el
    // instante viejo, que sería una verificación inventada de doce meses.
    const verifiedContacts = recordingPort();

    const decision = await resolveContactVerification(
      { userId: MARIA, contact: { method: "whatsapp", value: "+58 412 555 0134" } },
      {
        evidence: evidencePort({ ...ACCOUNT, verifiedAt: CADUCADA }),
        verifiedContacts,
        now: () => NOW,
      },
    );

    expect(decision).toEqual({ kind: "unverified" });
    expect(verifiedContacts.written).toEqual([]);
  });

  it("no escribe nada cuando la cuenta no existe", async () => {
    const verifiedContacts = recordingPort();

    const decision = await resolveContactVerification(
      { userId: "usr_fantasma", contact: { method: "email", value: "maria@example.com" } },
      { evidence: evidencePort(null), verifiedContacts, now: () => NOW },
    );

    expect(decision).toEqual({ kind: "unverified" });
    expect(verifiedContacts.written).toEqual([]);
  });
});
