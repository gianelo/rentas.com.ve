import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **El sondeo, en lo que de verdad sale de la ruta** (tasks.md 15.14).
 *
 * La trampa 4 de este plan: que `magicLinkPollFor` conteste bien y que la ruta
 * conteste bien son dos afirmaciones distintas, y la segunda es la que se
 * despacha. Acá se conduce el `GET` de verdad, con la cookie de verdad.
 *
 * **Las dos direcciones se afirman juntas y a propósito.** Sólo la negativa
 * («no contesta») pasaría con la ruta entera borrada; sólo la positiva («el
 * navegador correcto recibe su respuesta») pasaría con la comprobación del
 * sello borrada, que es exactamente la fuga. Cada una sin la otra es verde
 * mintiendo.
 */
const { jar, pendientes } = vi.hoisted(() => ({
  jar: new Map<string, string>(),
  pendientes: { value: [] as string[] },
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { value: jar.get(name) } : undefined),
  }),
}));
vi.mock("@/shared/db/client", () => ({ db: {} }));
vi.mock("@/modules/identity/infrastructure/drizzle-pending-magic-link", () => ({
  DrizzlePendingMagicLinks: class {
    async findPendingFingerprints(): Promise<readonly string[]> {
      return pendientes.value;
    }
  },
}));

process.env.AUTH_SECRET = "una-llave-de-prueba";

const { GET } = await import("./route");
const { TICKET_COOKIE, sealTicket } = await import("../../enlace");
const { serialiseMagicLinkTicket } = await import("@/modules/identity/domain/magic-link-request");

const AHORA = Date.UTC(2026, 8, 2, 12, 0, 0);
const CORREO = "maria.f@gmail.com";
const AJENO = "otra.persona@gmail.com";
const HUELLA = "4f1a".repeat(16);

/** Un comprobante como el que la acción escribe: sellado por este servidor. */
function comprobante(address: string, linkFingerprint: string | null = HUELLA): string {
  return serialiseMagicLinkTicket(
    sealTicket({ address, sentAtMs: AHORA, returnTo: null, linkFingerprint }),
  );
}

beforeEach(() => {
  jar.clear();
  pendientes.value = [];
});

describe("el sondeo contesta al navegador que pidió el enlace (15.14)", () => {
  it("mientras su enlace sigue vivo, dice que todavía no", async () => {
    jar.set(TICKET_COOKIE, comprobante(CORREO));
    pendientes.value = [HUELLA];

    const respuesta = await GET();

    expect(respuesta.status).toBe(200);
    expect(await respuesta.json()).toEqual({ entro: false });
    // Distinto por navegador y cambia dentro del minuto: guardarla es darle a
    // alguien el estado de otro.
    expect(respuesta.headers.get("cache-control")).toBe("no-store");
  });

  it("cuando el enlace se abrió, se lo dice", async () => {
    jar.set(TICKET_COOKIE, comprobante(CORREO));
    pendientes.value = [];

    expect(await (await GET()).json()).toEqual({ entro: true });
  });
});

describe("y no contesta sobre nadie más (15.14)", () => {
  /**
   * **La fuga, escrita como prueba.** Alguien que sabe una dirección arma la
   * cookie con ella —una cookie es una cabecera, la escribe quien envía— y
   * pregunta. Sin el sello recibiría exactamente la misma respuesta que la
   * dueña del buzón, y repitiendo la pregunta sabría cuándo entró.
   */
  it("un comprobante armado sobre la dirección de otra persona no recibe nada", async () => {
    const legítimo = JSON.parse(comprobante(CORREO)) as Record<string, unknown>;
    jar.set(TICKET_COOKIE, JSON.stringify({ ...legítimo, a: AJENO }));
    pendientes.value = [];

    const respuesta = await GET();

    expect(respuesta.status).toBe(204);
    expect(await respuesta.text()).toBe("");
  });

  it("una huella inventada sobre la dirección propia tampoco pasa", async () => {
    jar.set(
      TICKET_COOKIE,
      JSON.stringify({ a: CORREO, t: AHORA, k: HUELLA, s: "dead".repeat(16) }),
    );

    expect((await GET()).status).toBe(204);
  });

  it("sin comprobante no hay nada que saber", async () => {
    expect((await GET()).status).toBe(204);
  });

  it("un comprobante sin huella calla, y la pantalla sigue funcionando sin él", async () => {
    jar.set(TICKET_COOKIE, comprobante(CORREO, null));

    expect((await GET()).status).toBe(204);
  });

  /**
   * **La ruta no tiene por dónde recibir una dirección.** No es que la
   * descarte: no acepta petición. Es la forma que hace imposible el `?correo=`
   * que la tarea prohíbe, y una prueba sobre la firma es lo único que se pone
   * roja el día que alguien le agregue el parámetro.
   */
  it("no acepta nada de quien pregunta: la firma no recibe petición", () => {
    expect(GET.length).toBe(0);
  });
});
