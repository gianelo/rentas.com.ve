import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **El cable entre `reportListing` y un navegador, que era lo que no existía**
 * (tasks.md 8.7).
 *
 * `reportListing` está completo y probado —contra dobles y contra Postgres
 * real— y hasta acá **ninguna ruta lo llamaba**. En un navegador nadie podía
 * reportar un aviso, así que el umbral de tres reportantes distintos no podía
 * dispararse nunca y el estado `hidden` sólo lo producía un `UPDATE` a mano.
 * Es la quinta vez que este trabajo encuentra la misma forma de defecto: las
 * dos mitades probadas y el empalme a ciegas.
 *
 * Lo que se prueba acá no es qué hace reportar —eso ya está probado— sino
 * **a dónde manda esta acción en cada uno de sus cinco caminos**, incluido el
 * que no manda a ningún lado.
 *
 * **El doble de `redirect` TIRA, igual que el de Next**: `redirect()` corta la
 * ejecución tirando, así que después de llamarlo no hace falta un `return`. Un
 * doble que volviera normalmente dejaría seguir hasta el final y este archivo
 * reportaría un defecto que no existe.
 */
const { RedirectSignal, redirect, reportListing } = vi.hoisted(() => {
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
    reportListing: vi.fn(),
  };
});

vi.mock("next/navigation", () => ({ redirect }));

// El cliente real tira al importarse si no hay `DATABASE_URL`, y acá no se
// consulta ninguna base: los adaptadores se construyen y nunca se usan, porque
// `reportListing` está doblado.
vi.mock("@/shared/db/client", () => ({ db: {} }));

// Arrastra Auth.js entero y no participa de lo que se prueba.
vi.mock("@/modules/identity/infrastructure/session-port", () => ({
  nextAuthSessionPort: { getSession: async () => null },
}));

// Sólo se dobla `reportListing`. Las clases de error salen del módulo REAL —
// con copias locales, un renombre en producción dejaría este archivo en verde
// comparando contra errores que ya no existen.
vi.mock("@/modules/listing-trust/application/report-listing", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  reportListing,
}));

import { UnauthenticatedError } from "@/modules/identity/application/require-authenticated-session";
import { ListingNotFoundError } from "@/modules/listing-trust/application/report-listing";
import { REPORT_SENT_PARAM } from "@/modules/listing-trust/domain/report-screen";
import { reportarAviso } from "./actions";

const FICHA = "/alquiler/caracas/chacao/apartamento-listing-1";
const REPORTAR = `${FICHA}/reportar`;
const ACUSE = `${REPORTAR}?${REPORT_SENT_PARAM}`;

function submit(overrides: Record<string, string> = {}) {
  const data = new FormData();
  for (const [name, value] of Object.entries({
    listingId: "listing-1",
    listingPath: FICHA,
    ...overrides,
  })) {
    data.set(name, value);
  }
  return reportarAviso(data);
}

/** El destino con el que la acción terminó, sacado de la señal que tiró. */
async function destinationOf(promise: Promise<void>): Promise<string> {
  const error = await promise.then(
    () => null,
    (thrown: unknown) => thrown,
  );
  if (!(error instanceof RedirectSignal)) {
    throw new Error(`la acción no redirigió: ${String(error)}`);
  }
  return error.url;
}

beforeEach(() => {
  redirect.mockClear();
  reportListing.mockReset();
  reportListing.mockResolvedValue({ autoHidden: false });
});

describe("la acción de reportar — el cable", () => {
  it("le pasa al caso de uso el aviso que vino del formulario", async () => {
    await destinationOf(submit({ listingId: "listing-42" }));

    expect(reportListing).toHaveBeenCalledWith({ listingId: "listing-42" }, expect.anything());
  });
});

describe("el acuse", () => {
  /**
   * **El mismo destino haya ocultado el aviso o no, y afirmado dos veces por
   * separado.** Comparar los dos entre sí bastaría si los dos fueran el acuse;
   * también pasaría si los dos fueran `undefined`. Así que cada uno se afirma
   * contra la URL literal, y la igualdad se afirma además.
   */
  it.each([
    ["cuando el reporte no ocultó nada", false],
    ["cuando el reporte fue el que ocultó el aviso", true],
  ])("manda al acuse %s", async (_caso, autoHidden) => {
    reportListing.mockResolvedValueOnce({ autoHidden });

    expect(await destinationOf(submit())).toBe(ACUSE);
  });

  it("no distingue un caso del otro por el destino", async () => {
    reportListing.mockResolvedValueOnce({ autoHidden: false });
    const sinOcultar = await destinationOf(submit());
    reportListing.mockResolvedValueOnce({ autoHidden: true });
    const ocultando = await destinationOf(submit());

    expect(sinOcultar).toBe(ACUSE);
    expect(ocultando).toBe(ACUSE);
    expect(ocultando).toBe(sinOcultar);
  });
});

describe("cuando no hay sesión", () => {
  /**
   * La spec de listing-trust lo dice en esos términos: «the system blocks the
   * action and requires sign-in first». Se vuelve **a la pantalla de reportar**
   * y no a la ficha: quien entró para reportar sigue queriendo reportar, y
   * devolverlo a la ficha le esconde el enlace que acababa de tocar.
   */
  it("manda a entrar con la vuelta a la pantalla de reportar", async () => {
    reportListing.mockRejectedValueOnce(new UnauthenticatedError());

    expect(await destinationOf(submit())).toBe(
      `/signin?callbackUrl=${encodeURIComponent(REPORTAR)}`,
    );
  });
});

describe("cuando el aviso no existe", () => {
  /**
   * Vuelve a la ficha y deja que sea ELLA la que conteste. La ficha ya trata
   * inexistente, oculto y borrado por igual —un 404 indistinguible—, así que
   * esta acción no tiene que inventar una segunda forma de decir lo mismo, ni
   * confirmarle a quien sondea URLs que ese id existía.
   */
  it("vuelve a la ficha, que es la que sabe decirlo", async () => {
    reportListing.mockRejectedValueOnce(new ListingNotFoundError("listing-1"));

    expect(await destinationOf(submit())).toBe(FICHA);
  });
});

describe("cuando la vuelta no es nuestra", () => {
  /**
   * **El campo lo manda el navegador.** Sin la regla del dominio en el medio,
   * esta acción es un redirector abierto — y lo caro no es el salto, es que el
   * enlace se ve nuestro.
   *
   * Y se niega ANTES de reportar: un formulario que no dibujamos nosotros no es
   * un formulario sobre el que actuemos. Es el modo de fallo que AGENTS.md §7
   * pide preferir — el rechazo.
   */
  it.each([
    ["otro origen escrito completo", "https://evil.test/alquiler/x"],
    ["el origen relativo al protocolo", "//evil.test/alquiler/x"],
    ["una pantalla que no es una ficha", "/publicar"],
    ["el campo vacío", ""],
  ])("no reporta nada y manda al inicio con %s", async (_caso, listingPath) => {
    expect(await destinationOf(submit({ listingPath }))).toBe("/");
    expect(reportListing).not.toHaveBeenCalled();
  });
});

describe("lo que no está previsto", () => {
  /**
   * **Tragar todo sería peor que romper.** Un fallo de la base tiene que llegar
   * al registro de errores; si esta acción lo absorbiera, se dibujaría el acuse
   * y quien reportó se iría creyendo que su reporte quedó guardado.
   */
  it("deja pasar un error que no reconoce, y no acusa recibo", async () => {
    reportListing.mockRejectedValueOnce(new Error("la base se cayó"));

    await expect(submit()).rejects.toThrow("la base se cayó");
    expect(redirect).not.toHaveBeenCalled();
  });
});
