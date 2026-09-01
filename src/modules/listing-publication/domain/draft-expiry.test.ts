import { describe, expect, it } from "vitest";
import { DRAFT_LIFETIME_MS, draftExpiresAt, hasDraftExpired } from "./draft-expiry";

describe("draftExpiresAt", () => {
  it("son las veinticuatro horas del fundador, contadas desde el momento que se le pasa", () => {
    expect(draftExpiresAt(new Date("2026-09-01T14:30:00.000Z"))).toEqual(
      new Date("2026-09-02T14:30:00.000Z"),
    );
    expect(DRAFT_LIFETIME_MS).toBe(24 * 60 * 60 * 1000);
  });

  it("volver a guardar corre el vencimiento hacia adelante: quien vuelve retoma donde estaba", () => {
    // Se afirma la DIFERENCIA y no que el segundo sea mayor: «mayor» lo cumple
    // también una función que devuelva el instante recibido sin sumarle nada.
    const primero = draftExpiresAt(new Date("2026-09-01T08:00:00.000Z"));
    const alDiaSiguiente = draftExpiresAt(new Date("2026-09-02T07:00:00.000Z"));

    expect(alDiaSiguiente.getTime() - primero.getTime()).toBe(23 * 60 * 60 * 1000);
  });

  it("no toca el instante que recibe", () => {
    // `now.setUTCHours(now.getUTCHours() + 24)` devuelve el número correcto habiendo
    // movido el reloj de quien llamó, que lo sigue usando después.
    const ahora = new Date("2026-09-01T14:30:00.000Z");
    draftExpiresAt(ahora);
    expect(ahora.toISOString()).toBe("2026-09-01T14:30:00.000Z");
  });
});

describe("hasDraftExpired", () => {
  it("un borrador de hace una hora sigue vivo, y uno de hace dos días no", () => {
    const ahora = new Date("2026-09-02T10:00:00.000Z");
    expect(hasDraftExpired(new Date("2026-09-02T11:00:00.000Z"), ahora)).toBe(false);
    expect(hasDraftExpired(new Date("2026-08-31T10:00:00.000Z"), ahora)).toBe(true);
  });

  it("en el instante exacto ya venció, y el borde se cierra hacia el vencimiento", () => {
    // AGENTS.md §7: la forma preferida es la negativa. El barrido borra fotos de R2
    // por esta misma regla, así que el empate cae del lado de «no lo devuelvas».
    const instante = new Date("2026-09-02T10:00:00.000Z");
    expect(hasDraftExpired(instante, instante)).toBe(true);
  });
});
