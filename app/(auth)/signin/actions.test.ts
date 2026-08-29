import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **El cable entre la regla y el correo que sale de verdad** (15.9, 22.22).
 *
 * Lo que se prueba acá no es cuándo se puede reenviar —eso es
 * `magic-link-request.test.ts`— sino **qué hace la acción con cada respuesta
 * de la regla**: si llama a Auth.js, si escribe el comprobante y a dónde manda.
 * Las dos mitades probadas y el empalme a ciegas es la forma del defecto que
 * rompió `main` en el PR #103.
 *
 * **El doble de `redirect` TIRA, igual que el de Next**, y no es un detalle del
 * arnés: `redirect()` corta la ejecución tirando, así que la acción no lleva
 * `return` detrás. Un doble que volviera normalmente dejaría seguir y este
 * archivo reportaría defectos que no existen.
 */
const { RedirectSignal, redirect, signIn, store } = vi.hoisted(() => {
  class RedirectSignal extends Error {
    readonly url: string;
    constructor(url: string) {
      super(`NEXT_REDIRECT:${url}`);
      this.name = "RedirectSignal";
      this.url = url;
    }
  }

  const jar = new Map<string, string>();

  return {
    RedirectSignal,
    redirect: vi.fn((url: string): never => {
      throw new RedirectSignal(url);
    }),
    signIn: vi.fn(),
    store: {
      jar,
      set: vi.fn((name: string, value: string) => {
        jar.set(name, value);
      }),
      get: (name: string) => (jar.has(name) ? { value: jar.get(name) } : undefined),
    },
  };
});

vi.mock("next/navigation", () => ({ redirect }));
vi.mock("next/headers", () => ({ cookies: async () => store }));
// `auth.ts` arma el adaptador de Drizzle al importarse, así que sin este doble
// el archivo ni siquiera carga.
vi.mock("@/modules/identity/infrastructure/auth", () => ({ signIn }));

const { requestMagicLink } = await import("./actions");
const { TICKET_COOKIE, TICKET_COOKIE_OPTIONS } = await import("./enlace");
const { SIGN_IN_WAIT_PATH } = await import("@/modules/identity/domain/safe-return-destination");
const { MAGIC_LINK_RESEND_COOLDOWN_SECONDS, magicLinkTicketOf, serialiseMagicLinkTicket } =
  await import("@/modules/identity/domain/magic-link-request");

const FICHA = "/alquiler/distrito-capital/chacao/apartamento-2h";
/** Lo que `@auth/core` devuelve cuando el correo salió (`sendToken`). */
const ENVIADO = "http://localhost:3000/api/auth/verify-request?provider=email&type=email";

function formulario(campos: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(campos)) data.append(name, value);
  return data;
}

async function destinoDe(data: FormData): Promise<string> {
  try {
    await requestMagicLink(data);
  } catch (error) {
    if (error instanceof RedirectSignal) return error.url;
    throw error;
  }
  throw new Error("la acción terminó sin redirigir, y siempre redirige");
}

beforeEach(() => {
  vi.clearAllMocks();
  store.jar.clear();
  signIn.mockResolvedValue(ENVIADO);
});

describe("pedir el enlace por correo (22.22)", () => {
  it("manda el correo, guarda el comprobante y lleva a la pantalla de espera", async () => {
    const destino = await destinoDe(
      formulario({ correo: "  Maria.F@Gmail.com ", callbackUrl: FICHA }),
    );

    // Normalizado por el dominio ANTES de salir: lo que se manda es lo que
    // después se muestra de vuelta.
    expect(signIn).toHaveBeenCalledWith("email", {
      email: "maria.f@gmail.com",
      redirectTo: FICHA,
      redirect: false,
    });
    expect(destino).toBe(SIGN_IN_WAIT_PATH);
    expect(magicLinkTicketOf(store.jar.get(TICKET_COOKIE))).toMatchObject({
      address: "maria.f@gmail.com",
      returnTo: FICHA,
    });
    // Muere con el enlace, no la puede leer un script y no sale de esta puerta.
    expect(store.set).toHaveBeenCalledWith(
      TICKET_COOKIE,
      expect.any(String),
      TICKET_COOKIE_OPTIONS,
    );
  });

  /** **Falla cerrado** (§7): sin dirección válida no sale un correo. */
  it.each([
    ["vacía", ""],
    ["sin arroba", "maria.f"],
    ["con coma, que Auth.js recortaría", "maria@gmail.com,evil.test"],
  ])("con una dirección %s no manda nada y devuelve a la puerta", async (_caso, correo) => {
    const destino = await destinoDe(formulario({ correo, callbackUrl: FICHA }));

    expect(signIn).not.toHaveBeenCalled();
    expect(store.set).not.toHaveBeenCalled();
    // Y la puerta conserva el destino: el tropiezo no cuesta la vuelta al aviso.
    expect(destino).toBe(`/signin?callbackUrl=${encodeURIComponent(FICHA)}`);
  });

  /** El destino es entrada de quien envía, y la juzga la regla que ya existe. */
  it("un destino que la regla no admite no viaja adentro del enlace", async () => {
    await destinoDe(
      formulario({ correo: "maria.f@gmail.com", callbackUrl: "https://evil.test/x" }),
    );

    expect(signIn).toHaveBeenCalledWith("email", {
      email: "maria.f@gmail.com",
      redirectTo: "/",
      redirect: false,
    });
    expect(magicLinkTicketOf(store.jar.get(TICKET_COOKIE))?.returnTo).toBeNull();
  });

  /**
   * **El botón deshabilitado no es lo que frena el reenvío.** Un POST se arma
   * sin pantalla, así que si la negativa viviera sólo en el `disabled` la
   * ventana no existiría. Acá se comprueba sobre la acción.
   */
  it("repetir la misma dirección adentro de la ventana no gasta un correo", async () => {
    store.jar.set(
      TICKET_COOKIE,
      serialiseMagicLinkTicket({
        address: "maria.f@gmail.com",
        sentAtMs: Date.now(),
        returnTo: FICHA,
      }),
    );

    const destino = await destinoDe(formulario({ correo: "maria.f@gmail.com" }));

    expect(signIn).not.toHaveBeenCalled();
    expect(store.set).not.toHaveBeenCalled();
    expect(destino).toBe(SIGN_IN_WAIT_PATH);
  });

  it("pasada la ventana, el reenvío sí sale", async () => {
    store.jar.set(
      TICKET_COOKIE,
      serialiseMagicLinkTicket({
        address: "maria.f@gmail.com",
        sentAtMs: Date.now() - (MAGIC_LINK_RESEND_COOLDOWN_SECONDS + 1) * 1000,
        returnTo: FICHA,
      }),
    );

    await destinoDe(formulario({ correo: "maria.f@gmail.com", callbackUrl: FICHA }));

    expect(signIn).toHaveBeenCalledTimes(1);
  });

  /**
   * **No se escribe un comprobante por un correo que no salió** (§7). Auth.js
   * con `redirect: false` no tira: devuelve la dirección a la que HABRÍA
   * mandado, y ante un fallo del envío ésa es la pantalla de error. Sin esta
   * comprobación la pantalla de espera diría «Le mandamos un enlace a…» sobre
   * un correo que nunca se despachó, que es la mentira que §5 describe.
   */
  it("si el envío no llegó a hacerse, no se promete un enlace que no salió", async () => {
    signIn.mockResolvedValue("http://localhost:3000/api/auth/error?error=EmailSignin");

    const destino = await destinoDe(
      formulario({ correo: "maria.f@gmail.com", callbackUrl: FICHA }),
    );

    expect(store.set).not.toHaveBeenCalled();
    expect(destino).toBe(`/signin?callbackUrl=${encodeURIComponent(FICHA)}`);
  });
});
