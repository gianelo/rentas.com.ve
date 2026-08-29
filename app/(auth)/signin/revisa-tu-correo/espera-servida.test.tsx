import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **La pantalla de espera, en los bytes que salen de la ruta** (15.9, láminas
 * 8c/9c). Trampa 4 del plan: que `magicLinkWaitFor` conteste bien y que la
 * pantalla lo dibuje son dos afirmaciones distintas.
 *
 * **El «sin un solo script» NO se afirma acá**, por lo mismo que en
 * `entrar-servida.test.tsx`: fuera del compilador de Next una Server Action es
 * una función común y React inyecta su propio `<script>` de reenvío. Esa
 * medición vive en `tests/e2e/entrar-sin-javascript.spec.ts`, con el script
 * apagado y contra la compilación de producción.
 */
const { RedirectSignal, redirect, jar } = vi.hoisted(() => {
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
    jar: new Map<string, string>(),
  };
});

vi.mock("next/navigation", () => ({ redirect }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { value: jar.get(name) } : undefined),
  }),
}));
vi.mock("@/modules/identity/infrastructure/auth", () => ({ signIn: vi.fn() }));

const { default: EsperaPage } = await import("./page");
const { TICKET_COOKIE } = await import("../enlace");
const { MAGIC_LINK_RESEND_COOLDOWN_SECONDS, serialiseMagicLinkTicket } = await import(
  "@/modules/identity/domain/magic-link-request"
);

const AHORA = Date.UTC(2026, 7, 29, 12, 0, 0);
const FICHA = "/alquiler/distrito-capital/chacao/apartamento-2h";
const CORREO = "maria.f@gmail.com";

function conComprobante(sentAtMs: number, returnTo: string | null = FICHA) {
  jar.set(TICKET_COOKIE, serialiseMagicLinkTicket({ address: CORREO, sentAtMs, returnTo }));
}

async function servida(): Promise<string> {
  return renderToStaticMarkup(await EsperaPage());
}

function titulo(html: string): string {
  return html.match(/<h1[^>]*>([^<]*)<\/h1>/)?.[1] ?? "";
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(AHORA);
  jar.clear();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("la pantalla de espera sale entera en el HTML (15.9)", () => {
  /**
   * **Falla cerrado** (§7). La dirección tecleada sólo existe en el
   * comprobante, así que sin él no hay nada que mostrar — y dibujar «Revisá tu
   * correo» sin decir cuál sería una pantalla que no informa nada.
   */
  it("sin comprobante no hay pantalla: vuelve a la puerta", async () => {
    await expect(servida()).rejects.toThrow(RedirectSignal);
    expect(redirect).toHaveBeenCalledWith("/signin");
  });

  it("muestra de vuelta la dirección tecleada, que es como se caza el tipeo sin volver", async () => {
    conComprobante(AHORA);
    const html = await servida();

    expect(titulo(html)).toBe("Revisá tu correo");
    // La frase entera y la dirección DENTRO del `<b>`: la lámina la destaca, y
    // afirmar sólo que la cadena aparece pasaría con la dirección en cualquier
    // parte del documento.
    expect(html).toMatch(new RegExp(`Le mandamos un enlace a <b[^>]*>${CORREO}</b>`));
    expect(html).toContain("Abrilo y entrás sin escribir nada más.");
    // **Y a nadie más.** La dirección no viaja en ninguna dirección web: ni en
    // la barra, ni en un enlace, ni en el historial de quien mira por encima
    // del hombro. Sale del comprobante y vuelve a la pantalla.
    expect(html).not.toMatch(new RegExp(`href="[^"]*${CORREO.replace("@", "(@|%40)")}`));
  });

  it("explica por qué podría no llegar, con las tres razones de la lámina", async () => {
    conComprobante(AHORA);
    const html = await servida();

    expect(html).toContain("Si no llega");
    expect(html).toContain("Puede tardar hasta dos minutos.");
    expect(html).toContain("Mirá en correo no deseado.");
    expect(html).toContain("El enlace sirve una sola vez y vence en 15 minutos.");
  });

  /**
   * **Dos frases dibujadas que este producto no puede decir hoy.** La 8c
   * escribe «Abrí el enlace en este mismo teléfono», que es la regla de mismo
   * dispositivo que el fundador quitó en la 15.6 (y que la 15.15 manda corregir
   * en la lámina). La 9c escribe «te avisamos acá cuando pase», que la cumple
   * el sondeo de la 15.12 — que no está construido. Prometer cualquiera de las
   * dos es la casilla que miente de §5.
   */
  it("no promete la regla que se quitó ni el aviso que todavía nadie manda", async () => {
    conComprobante(AHORA);
    const html = await servida();

    expect(html).not.toContain("este mismo teléfono");
    expect(html).not.toContain("esta misma computadora");
    expect(html).not.toContain("te avisamos");
  });

  /**
   * **La cuenta va en la cara del control, y el control no es un botón muerto**
   * — la nota de la 8c: «reenviar con cuenta regresiva, no deshabilitado sin
   * explicación». Dentro de la ventana no hay nada que apretar porque no hay
   * nada que hacer todavía, y el número dice cuándo lo habrá.
   */
  it("dentro de la ventana el reenvío es la cuenta, y no un formulario", async () => {
    conComprobante(AHORA - 18_000);
    const html = await servida();

    expect(html).toContain("Volver a enviar en 0:42");
    expect(html).not.toContain("Volver a enviar el enlace");
    // El único formulario que queda es la salida a Google.
    expect(html.match(/<form/g)).toHaveLength(1);
  });

  it("pasada la ventana el reenvío es un formulario de verdad, con su dirección", async () => {
    conComprobante(AHORA - (MAGIC_LINK_RESEND_COOLDOWN_SECONDS + 1) * 1000);
    const html = await servida();

    expect(html).toContain(">Volver a enviar el enlace</button>");
    expect(html).not.toContain("Volver a enviar en");
    expect(html.match(/<form/g)).toHaveLength(2);
    expect(html).toMatch(
      new RegExp(`<input[^>]*type="hidden"[^>]*name="correo"[^>]*value="${CORREO}"`),
    );
  });

  /** F20: dos salidas visibles, y las dos conservan el aviso al que se vuelve. */
  it("deja salir a Google y a cambiar de correo sin perder el destino", async () => {
    conComprobante(AHORA);
    const html = await servida();

    expect(html).toContain(">Mejor entro con Google</button>");
    expect(html).toContain(`href="/signin?callbackUrl=${encodeURIComponent(FICHA)}"`);
    expect(html).toContain("← Cambiar de correo");
    expect(html).toMatch(
      new RegExp(`<input[^>]*type="hidden"[^>]*name="callbackUrl"[^>]*value="${FICHA}"`),
    );
  });

  /** Un destino forjado en la cookie no llega a la pantalla (§7). */
  it("un destino que la regla no admite no aparece en los bytes servidos", async () => {
    jar.set(
      TICKET_COOKIE,
      JSON.stringify({ a: CORREO, t: AHORA, r: "https://evil.test/publicar" }),
    );
    const html = await servida();

    expect(html).not.toContain("evil.test");
    expect(html).toContain('href="/signin"');
  });
});
