import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { purgeDueAt } from "./expiry";
import { mintRenewalToken, readRenewalToken } from "./renewal-token";

const SECRET = "un-secreto-de-pruebas";
const LISTING = "11111111-2222-3333-4444-555555555555";
const EXPIRES_AT = new Date("2026-08-31T10:00:00.000Z");
const BEFORE_PURGE = new Date("2026-09-10T00:00:00.000Z");

function mint(overrides: { listingId?: string; expiresAt?: Date } = {}): string {
  return mintRenewalToken(
    { listingId: overrides.listingId ?? LISTING, expiresAt: overrides.expiresAt ?? EXPIRES_AT },
    SECRET,
  );
}

describe("readRenewalToken", () => {
  it("devuelve el aviso y el ciclo que se firmaron", () => {
    const result = readRenewalToken(mint(), SECRET, BEFORE_PURGE);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.listingId).toBe(LISTING);
    expect(result.payload.expiresAt).toEqual(EXPIRES_AT);
  });

  // El alcance: el id va DENTRO de la firma. Cambiarlo invalida el token, así
  // que un enlace válido para un aviso no renueva ninguno otro.
  it("rechaza un token cuyo cuerpo fue reescrito para apuntar a otro aviso", () => {
    const [version, body, signature] = mint().split(".") as [string, string, string];
    const decoded = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    const forged = Buffer.from(JSON.stringify({ ...decoded, l: "otro-aviso" }), "utf8").toString(
      "base64url",
    );

    expect(readRenewalToken(`${version}.${forged}.${signature}`, SECRET, BEFORE_PURGE)).toEqual({
      ok: false,
      reason: "bad-signature",
    });
  });

  it("rechaza un token firmado con otro secreto", () => {
    expect(readRenewalToken(mint(), "otro-secreto", BEFORE_PURGE)).toEqual({
      ok: false,
      reason: "bad-signature",
    });
  });

  // Nunca lanza: un token es entrada de un desconocido, y una excepción sería
  // un 500 en lugar de una pantalla que explica.
  it.each([
    ["vacío", ""],
    ["sin partes", "no-es-un-token"],
    ["con firma vacía", "v1.abc."],
    ["de otra versión", "v2.abc.def"],
  ])("rechaza un token %s sin lanzar", (_name, token) => {
    expect(readRenewalToken(token, SECRET, BEFORE_PURGE)).toEqual({
      ok: false,
      reason: "malformed",
    });
  });

  // Se firma basura A PROPÓSITO, con el secreto bueno: prueba que el
  // `JSON.parse` está protegido incluso del lado de adentro de la firma, que
  // es donde nadie mira porque «ya pasó el HMAC».
  it("rechaza un cuerpo correctamente firmado que no es JSON", () => {
    const body = Buffer.from("no soy json", "utf8").toString("base64url");
    const signature = createHmac("sha256", SECRET).update(`v1.${body}`).digest("base64url");

    expect(readRenewalToken(`v1.${body}.${signature}`, SECRET, BEFORE_PURGE)).toEqual({
      ok: false,
      reason: "malformed",
    });
  });

  // El mismo agujero, pero con JSON válido y campos mentirosos.
  it("rechaza un cuerpo firmado cuyo id de aviso no es una cadena", () => {
    const body = Buffer.from(JSON.stringify({ l: 7, e: 1, n: 2 }), "utf8").toString("base64url");
    const signature = createHmac("sha256", SECRET).update(`v1.${body}`).digest("base64url");

    expect(readRenewalToken(`v1.${body}.${signature}`, SECRET, BEFORE_PURGE)).toEqual({
      ok: false,
      reason: "malformed",
    });
  });

  it("el enlace vence el día de la purga y ni un milisegundo después", () => {
    const purgeDay = purgeDueAt(EXPIRES_AT);

    expect(readRenewalToken(mint(), SECRET, purgeDay).ok).toBe(true);
    expect(readRenewalToken(mint(), SECRET, new Date(purgeDay.getTime() + 1))).toEqual({
      ok: false,
      reason: "expired",
    });
  });

  // La firma se comprueba ANTES del vencimiento. Al revés, el servidor
  // contestaría «vencido» sobre un `notAfter` que nadie firmó.
  it("un token inventado y ya vencido se rechaza por la firma, no por la fecha", () => {
    const forged = Buffer.from(JSON.stringify({ l: LISTING, e: 0, n: 0 }), "utf8").toString(
      "base64url",
    );

    expect(readRenewalToken(`v1.${forged}.firma-inventada`, SECRET, BEFORE_PURGE)).toEqual({
      ok: false,
      reason: "bad-signature",
    });
  });
});

describe("mintRenewalToken", () => {
  it("dos ciclos distintos del mismo aviso producen tokens distintos", () => {
    expect(mint()).not.toBe(mint({ expiresAt: new Date("2026-09-30T10:00:00.000Z") }));
  });
});
