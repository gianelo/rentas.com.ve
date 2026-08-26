import { describe, expect, it, vi } from "vitest";
import { buildEmailProvider } from "./email-provider";
import { AuthMailerNotConfiguredError } from "./resend-mailer";

/**
 * El proveedor de correo de Auth.js (tasks.md 15.3–15.5, F17).
 *
 * **No importa `./auth.ts`.** `auth.ts` construye `db` al cargarse, que
 * exige `DATABASE_URL` — igual que `google-profile.ts` se separó de `auth.ts`
 * para poder probarse sin esa dependencia, este archivo es la mitad
 * testeable de la configuración del proveedor de correo.
 */

const PARAMS = {
  identifier: "tenant@ejemplo.com",
  url: "https://rentas.com.ve/api/auth/callback/email?token=abc&email=tenant%40ejemplo.com",
  expires: new Date("2026-08-24T10:15:00.000Z"),
  token: "abc",
  theme: {},
  request: new Request("https://rentas.com.ve"),
} as const;

describe("maxAge", () => {
  // El test que rompe si alguien borra la línea que fija los 15 minutos
  // (tasks.md 15.3) y deja pasar el día entero por defecto de la librería.
  it("está fijado en 15 minutos, no heredado del default de la librería", () => {
    const provider = buildEmailProvider();

    expect(provider.maxAge).toBe(15 * 60);
  });
});

describe("sendVerificationRequest", () => {
  it("falla cerrado si falta la configuración del correo", async () => {
    const provider = buildEmailProvider({ readConfig: () => undefined });

    await expect(provider.sendVerificationRequest(PARAMS as never)).rejects.toThrow(
      AuthMailerNotConfiguredError,
    );
  });

  it("manda el enlace mágico compuesto por el dominio, al remitente configurado", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const provider = buildEmailProvider({
      readConfig: () => ({ apiKey: "re_loquesea", from: "ingresa@rentas.com.ve" }),
      createMailer: () => ({ send }),
    });

    await provider.sendVerificationRequest(PARAMS as never);

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: PARAMS.identifier,
        subject: expect.stringContaining("enlace"),
        body: expect.stringContaining(PARAMS.url),
      }),
    );
  });

  it("no manda nada si la configuración falta — el mailer nunca se construye", async () => {
    const createMailer = vi.fn();
    const provider = buildEmailProvider({ readConfig: () => undefined, createMailer });

    await expect(provider.sendVerificationRequest(PARAMS as never)).rejects.toThrow();
    expect(createMailer).not.toHaveBeenCalled();
  });
});
