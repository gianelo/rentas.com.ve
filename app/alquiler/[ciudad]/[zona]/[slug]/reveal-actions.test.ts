import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **El cable entre el caso de uso y la pantalla, que era lo único sin probar.**
 *
 * La verificación de la capacidad (2026-08-24) encontró que `revealContact`
 * tenía sus tests y `safeSignInDestination` los suyos, pero que **la unión de
 * los dos no la ejercía nada**: no existía este archivo. Las dos mitades
 * probadas y el empalme a ciegas es exactamente la forma del defecto que
 * rompió `main` en el PR #103 — dos ramas verdes por separado y nadie probando
 * el encuentro.
 *
 * Lo que se prueba acá no es qué hace revelar, es **qué hace la acción con
 * cada error que revelar puede tirar**. Por eso `revealContact` es un doble:
 * el sujeto es el `catch`, no lo que ocurre antes de él.
 *
 * **El doble de `redirect` TIRA, igual que el de Next.** No es un detalle del
 * test, es la razón por la que la acción está bien escrita: `redirect()` corta
 * la ejecución tirando, así que después de llamarlo no hace falta un `return`.
 * Un doble que volviera normalmente dejaría seguir hasta el `throw error` del
 * final y este archivo reportaría un defecto que no existe.
 */
const { RedirectSignal, redirect, revealContact } = vi.hoisted(() => {
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
    revealContact: vi.fn(),
  };
});

vi.mock("next/navigation", () => ({ redirect }));

// El cliente real tira al importarse si no hay `DATABASE_URL`, y acá no se
// consulta ninguna base: los adaptadores se construyen pero nunca se usan,
// porque `revealContact` está doblado.
vi.mock("@/shared/db/client", () => ({ db: {} }));

// Arrastra Auth.js entero y no participa de lo que se prueba.
vi.mock("@/modules/identity/infrastructure/session-port", () => ({
  nextAuthSessionPort: { getSession: async () => null },
}));

// Sólo se dobla `revealContact`. Las clases de error salen del módulo REAL —
// con copias locales, un renombre en producción dejaría este archivo en verde
// comparando contra errores que ya no existen.
vi.mock("@/modules/contact-reveal/application/reveal-contact", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  revealContact,
}));

import {
  ListingNotRevealableError,
  RevealRateLimitExceededError,
} from "@/modules/contact-reveal/application/reveal-contact";
import { MissingRevealMessageError } from "@/modules/contact-reveal/domain/reveal-message";
import { UnauthenticatedError } from "@/modules/identity/application/require-authenticated-session";
import {
  SIGN_IN_FALLBACK,
  safeSignInDestination,
} from "@/modules/identity/domain/safe-return-destination";
import { revealListingContact } from "./reveal-actions";

const FICHA = "/alquiler/caracas/chacao/apartamento-listing-1";
const SIGN_IN_HREF = `/signin?callbackUrl=${encodeURIComponent(FICHA)}`;

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

function submit(overrides: Record<string, string> = {}) {
  return revealListingContact(
    form({
      listingId: "listing-1",
      signInHref: SIGN_IN_HREF,
      message: "Hola, me interesa. ¿Sigue disponible?",
      ...overrides,
    }),
  );
}

// Los dobles viven fuera de los casos, así que sin esto un `not.toHaveBeenCalled`
// leería las llamadas del caso anterior y pasaría o fallaría por el motivo
// equivocado.
beforeEach(() => {
  redirect.mockClear();
  revealContact.mockReset();
});

describe("la acción de revelar — el cable", () => {
  it("le pasa al caso de uso el aviso Y el mensaje que vinieron del formulario", async () => {
    revealContact.mockResolvedValueOnce({ state: "revealed" });

    await submit();

    // El mensaje es lo que costó agregar: si el `formData.get("message")` se
    // pierde, revelar sigue andando y el inquilino escribe al vacío.
    expect(revealContact).toHaveBeenCalledWith(
      { listingId: "listing-1", message: "Hola, me interesa. ¿Sigue disponible?" },
      expect.anything(),
    );
  });
});

describe("cuando no hay sesión", () => {
  /**
   * El punto de fuga principal del producto: es el único momento en que se le
   * pide algo al inquilino, y si vuelve a la raíz en vez de a la ficha, se va.
   */
  it("manda a entrar por el destino que decide el dominio", async () => {
    revealContact.mockRejectedValueOnce(new UnauthenticatedError());

    await expect(submit()).rejects.toBeInstanceOf(RedirectSignal);

    // Se compara contra la función real, no contra una cadena escrita a mano:
    // así el test no repite la regla, la usa.
    expect(redirect).toHaveBeenCalledWith(safeSignInDestination(SIGN_IN_HREF));
  });

  /**
   * **El campo lo manda el navegador.** Sin la regla del dominio en el medio,
   * esta acción es un redirector abierto — y lo caro no es el salto, es que el
   * enlace se ve nuestro.
   */
  it("no sigue un destino hostil metido en el formulario", async () => {
    revealContact.mockRejectedValueOnce(new UnauthenticatedError());

    await expect(
      submit({ signInHref: "/signin?callbackUrl=https%3A%2F%2Fevil.test" }),
    ).rejects.toBeInstanceOf(RedirectSignal);

    const destination = redirect.mock.lastCall?.[0];
    expect(destination).toBe(SIGN_IN_FALLBACK);
    expect(destination).not.toContain("evil.test");
  });
});

describe("los tres rechazos que no son pantallas rotas", () => {
  /**
   * Los tres vuelven callados a propósito: al volver, la ficha se dibuja de
   * nuevo y dice ella misma qué pasó. Una pantalla de error acá le mostraría un
   * stack trace a alguien que sólo quería un número de teléfono.
   */
  it.each([
    ["el aviso no se puede revelar", new ListingNotRevealableError("listing-1")],
    ["falta el mensaje", new MissingRevealMessageError()],
    ["la cuenta pasó el límite", new RevealRateLimitExceededError("user-1")],
  ])("vuelve sin romper ni redirigir cuando %s", async (_caso, error) => {
    revealContact.mockRejectedValueOnce(error);

    await expect(submit()).resolves.toBeUndefined();
    expect(redirect).not.toHaveBeenCalled();
  });
});

describe("lo que no está previsto", () => {
  /**
   * **Tragar todo sería peor que romper.** Un fallo de la base tiene que
   * llegar al registro de errores; si esta acción lo absorbiera, la ficha se
   * dibujaría igual y el revelado que la métrica norte cuenta se perdería en
   * silencio.
   */
  it("deja pasar un error que no reconoce", async () => {
    revealContact.mockRejectedValueOnce(new Error("la base se cayó"));

    await expect(submit()).rejects.toThrow("la base se cayó");
    expect(redirect).not.toHaveBeenCalled();
  });
});
