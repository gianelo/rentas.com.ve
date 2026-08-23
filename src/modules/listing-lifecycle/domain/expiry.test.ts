import { describe, expect, it } from "vitest";
import {
  EXPIRY_NOTICE_WINDOW_DAYS,
  expiryFor,
  isExpired,
  LISTING_LIFETIME_DAYS,
  PURGE_GRACE_DAYS,
  PURGE_NOTICE_LEAD_DAYS,
  purgeDueAt,
  renewedExpiry,
  wholeDaysBetween,
} from "./expiry";

const PUBLISHED = new Date("2026-08-01T10:00:00.000Z");

describe("expiryFor", () => {
  it("vence 30 días después de publicar cuando nunca se renovó", () => {
    expect(expiryFor({ publishedAt: PUBLISHED, lastRenewedAt: null })).toEqual(
      new Date("2026-08-31T10:00:00.000Z"),
    );
  });

  it("cuenta desde la renovación cuando es posterior a la publicación", () => {
    expect(
      expiryFor({ publishedAt: PUBLISHED, lastRenewedAt: new Date("2026-08-20T10:00:00.000Z") }),
    ).toEqual(new Date("2026-09-19T10:00:00.000Z"));
  });

  // «la que sea más tarde» es la regla, y ésta es la mitad que se rompe sola:
  // una renovación con fecha anterior a la publicación —reloj torcido, dato
  // importado— NO puede acortar la vida del aviso.
  it("ignora una renovación anterior a la publicación", () => {
    expect(
      expiryFor({ publishedAt: PUBLISHED, lastRenewedAt: new Date("2026-07-01T10:00:00.000Z") }),
    ).toEqual(new Date("2026-08-31T10:00:00.000Z"));
  });

  it("declara la vida del aviso en un solo lugar", () => {
    expect(LISTING_LIFETIME_DAYS).toBe(30);
  });
});

describe("renewedExpiry", () => {
  // Un aviso vencido hace diez días que se renueva recibe 30 días COMPLETOS.
  // Contar desde `expires_at` le devolvería 20 y le cobraría el olvido.
  it("da 30 días completos desde el momento de la renovación, no desde el vencimiento", () => {
    expect(renewedExpiry(new Date("2026-09-10T00:00:00.000Z"))).toEqual(
      new Date("2026-10-10T00:00:00.000Z"),
    );
  });
});

describe("isExpired", () => {
  it("no está vencido en el instante exacto del vencimiento", () => {
    expect(isExpired(PUBLISHED, PUBLISHED)).toBe(false);
  });

  it("está vencido un milisegundo después", () => {
    expect(isExpired(PUBLISHED, new Date(PUBLISHED.getTime() + 1))).toBe(true);
  });
});

describe("purgeDueAt", () => {
  it("la purga cae 15 días después del vencimiento", () => {
    expect(purgeDueAt(new Date("2026-08-31T10:00:00.000Z"))).toEqual(
      new Date("2026-09-15T10:00:00.000Z"),
    );
    expect(PURGE_GRACE_DAYS).toBe(15);
  });
});

describe("wholeDaysBetween", () => {
  it("redondea hacia arriba: faltan 3 días aunque sobren horas", () => {
    expect(
      wholeDaysBetween(new Date("2026-08-28T06:00:00.000Z"), new Date("2026-08-31T10:00:00.000Z")),
    ).toBe(4);
  });

  it("cuenta cero cuando el momento ya pasó", () => {
    expect(
      wholeDaysBetween(new Date("2026-09-01T00:00:00.000Z"), new Date("2026-08-31T10:00:00.000Z")),
    ).toBe(0);
  });
});

describe("ventanas declaradas", () => {
  it("el aviso de vencimiento se elige con una ventana de 5 días y el de purga con 5 de anticipación", () => {
    expect(EXPIRY_NOTICE_WINDOW_DAYS).toBe(5);
    expect(PURGE_NOTICE_LEAD_DAYS).toBe(5);
  });
});
