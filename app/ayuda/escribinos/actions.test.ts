import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * El cable entre `sendContactMessage` y la pantalla — la misma forma que
 * `reveal-actions.test.ts` ya prueba para revelar el contacto: lo que se
 * prueba acá no es qué decide el caso de uso (eso lo prueba
 * `send-contact-message.test.ts`), es qué hace la acción con cada
 * veredicto que el caso de uso puede devolver.
 */
const { RedirectSignal, redirect, sendContactMessage } = vi.hoisted(() => {
  class RedirectSignal extends Error {
    readonly url: string;
    constructor(url: string) {
      super(`NEXT_REDIRECT:${url}`);
      this.name = "RedirectSignal";
      this.url = url;
    }
  }

  return {
    RedirectSignal,
    redirect: vi.fn((url: string): never => {
      throw new RedirectSignal(url);
    }),
    sendContactMessage: vi.fn(),
  };
});

vi.mock("next/navigation", () => ({ redirect }));

vi.mock("@/modules/site-contact/application/send-contact-message", () => ({ sendContactMessage }));

// El adaptador real falla cerrado sin `RESEND_API_KEY`/`AUTH_MAIL_FROM`/
// `CONTACT_MAIL_TO` al construirse; acá no se manda nada de verdad —
// `sendContactMessage` está doblado— así que sólo hace falta que construirlo
// no tire.
vi.mock("@/modules/site-contact/infrastructure/resend-contact-mailer", () => ({
  ResendContactMailer: class {},
}));

import {
  CONTACT_ERROR_PARAM,
  CONTACT_SENT_PARAM,
} from "@/modules/site-contact/domain/contact-screen";
import { sendContactMessageAction } from "./actions";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

function submit(overrides: Record<string, string> = {}) {
  return sendContactMessageAction(
    form({
      name: "María Pérez",
      email: "maria@example.com",
      message: "Hola, una pregunta.",
      sitioWeb: "",
      ...overrides,
    }),
  );
}

beforeEach(() => {
  redirect.mockClear();
  sendContactMessage.mockReset();
});

describe("sendContactMessageAction — el cable", () => {
  it("pasa al caso de uso los cuatro campos, con la trampa bajo el nombre `honeypot` que el dominio espera", async () => {
    sendContactMessage.mockResolvedValueOnce({ kind: "valid" });

    await expect(submit()).rejects.toBeInstanceOf(RedirectSignal);

    expect(sendContactMessage).toHaveBeenCalledWith(
      {
        name: "María Pérez",
        email: "maria@example.com",
        message: "Hola, una pregunta.",
        honeypot: "",
      },
      expect.anything(),
    );
  });

  it("redirige al acuse de envío cuando el resultado es válido", async () => {
    sendContactMessage.mockResolvedValueOnce({ kind: "valid" });

    await expect(submit()).rejects.toBeInstanceOf(RedirectSignal);

    expect(redirect).toHaveBeenCalledWith(`/ayuda/escribinos?${CONTACT_SENT_PARAM}`);
  });

  it("redirige al MISMO acuse de envío cuando el resultado es spam — no delata la trampa", async () => {
    sendContactMessage.mockResolvedValueOnce({ kind: "spam" });

    await expect(submit()).rejects.toBeInstanceOf(RedirectSignal);

    expect(redirect).toHaveBeenCalledWith(`/ayuda/escribinos?${CONTACT_SENT_PARAM}`);
  });

  it("redirige al aviso de error cuando el resultado es inválido", async () => {
    sendContactMessage.mockResolvedValueOnce({
      kind: "invalid",
      violations: ["message-too-short"],
    });

    await expect(submit()).rejects.toBeInstanceOf(RedirectSignal);

    expect(redirect).toHaveBeenCalledWith(`/ayuda/escribinos?${CONTACT_ERROR_PARAM}`);
  });
});
