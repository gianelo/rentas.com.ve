import { describe, expect, it } from "vitest";
import { resolveListingAvailability } from "./listing-availability";

const NOW = new Date("2026-08-22T12:00:00.000Z");

function listing(overrides: Partial<{ status: string; expiresAt: Date }> = {}) {
  return {
    status: "active",
    expiresAt: new Date("2026-08-31T00:00:00.000Z"),
    ...overrides,
  };
}

describe("resolveListingAvailability", () => {
  it("un aviso activo y dentro de su fecha se puede ofrecer", () => {
    expect(resolveListingAvailability(listing(), NOW)).toBe("available");
  });

  it("un aviso cuyo estado ya dice vencido no se ofrece", () => {
    expect(resolveListingAvailability(listing({ status: "expired" }), NOW)).toBe("expired");
  });

  /**
   * **La ventana entre el reloj y el rótulo, que es la razón de este módulo.**
   * `markExpired` corre dentro de un trabajo programado una vez al día
   * (`vercel.json`, `0 13 * * *`), y un aviso vence a los 30 días de la HORA en
   * que se publicó: entre «venció» y «la fila lo dice» pasan de 0 a casi 24
   * horas. Mirando sólo el rótulo, la ficha ofrece durante todo ese rato el
   * contacto de un aviso que ya no está en pie.
   */
  it("el que todavía dice active pero cuya fecha ya pasó no se ofrece", () => {
    const lapsed = listing({ expiresAt: new Date("2026-08-21T00:00:00.000Z") });

    expect(resolveListingAvailability(lapsed, NOW)).toBe("expired");
  });

  /**
   * El borde exacto: `expiresAt` es el instante en que deja de valer, no el
   * último instante en que vale. Escrito con `>=` en vez de `>`, un aviso
   * seguiría ofreciéndose en el mismo milisegundo de su vencimiento — y ese
   * milisegundo es el que separa esta función del sitemap, que ya usa
   * `expires_at > now()`.
   */
  it("el instante exacto del vencimiento ya no se ofrece", () => {
    const exact = listing({ expiresAt: NOW });

    expect(resolveListingAvailability(exact, NOW)).toBe("expired");
  });

  /**
   * **Escrito al revés de como se lee: sólo `active` habilita.** Un quinto
   * estado que alguien agregue mañana cae en la rama que NO ofrece contacto, y
   * ese descuido no falla en ningún lado — la misma disciplina que
   * `resolveListingIndexing` ya sostiene del lado del índice.
   */
  it("cualquier estado que no sea active no se ofrece", () => {
    expect(resolveListingAvailability(listing({ status: "hidden" }), NOW)).toBe("expired");
    expect(resolveListingAvailability(listing({ status: "draft" }), NOW)).toBe("expired");
  });
});
