import { describe, expect, it } from "vitest";
import { isListingContactVerified } from "./is-listing-contact-verified";
import type { ListingContactVerificationPort } from "./ports/verified-contact.port";

/**
 * tasks.md 22.39 — la composición que la 22.32 dejó pendiente: el puerto
 * (`ListingContactVerificationPort.findVerifiedAt`) y la decisión
 * (`listingContactIsVerified`) ya estaban probados por separado; esto es lo
 * único que junta las dos mitades detrás de un llamador real.
 */

const NOW = new Date("2026-08-25T12:00:00.000Z");
/** Once meses antes de `NOW` — sigue dentro de la ventana de la 19.11. */
const LIVE_VERIFIED_AT = new Date("2025-09-25T12:00:00.000Z");
/** Trece meses antes de `NOW` — afuera de la ventana. */
const EXPIRED_VERIFIED_AT = new Date("2025-07-25T12:00:00.000Z");

function verificationPort(
  verifiedAt: Date | null,
): ListingContactVerificationPort & { readonly asked: string[] } {
  const asked: string[] = [];
  return {
    asked,
    async findVerifiedAt(listingId) {
      asked.push(listingId);
      return verifiedAt;
    },
  };
}

describe("isListingContactVerified", () => {
  it("contesta que sí cuando el puerto trae un instante vigente", async () => {
    const port = verificationPort(LIVE_VERIFIED_AT);

    const verified = await isListingContactVerified("lst_1", {
      verification: port,
      now: () => NOW,
    });

    expect(verified).toBe(true);
  });

  it("contesta que no cuando el puerto no trae fila", async () => {
    const port = verificationPort(null);

    const verified = await isListingContactVerified("lst_1", {
      verification: port,
      now: () => NOW,
    });

    expect(verified).toBe(false);
  });

  it("contesta que no cuando el instante ya venció", async () => {
    const port = verificationPort(EXPIRED_VERIFIED_AT);

    const verified = await isListingContactVerified("lst_1", {
      verification: port,
      now: () => NOW,
    });

    expect(verified).toBe(false);
  });

  it("pregunta al puerto por el listingId exacto que se le pasó", async () => {
    const port = verificationPort(LIVE_VERIFIED_AT);

    await isListingContactVerified("lst_exacto", { verification: port, now: () => NOW });

    expect(port.asked).toEqual(["lst_exacto"]);
  });
});
