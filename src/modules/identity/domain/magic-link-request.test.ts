import { describe, expect, it } from "vitest";
import { MAGIC_LINK_MAX_AGE_SECONDS } from "./magic-link";
import {
  MAGIC_LINK_POLL_INTERVAL_SECONDS,
  MAGIC_LINK_RESEND_COOLDOWN_SECONDS,
  magicLinkAddressOf,
  magicLinkPollFor,
  magicLinkRequestFor,
  magicLinkTicketOf,
  magicLinkWaitFor,
  resendStateFor,
  serialiseMagicLinkTicket,
} from "./magic-link-request";

const AHORA = Date.UTC(2026, 7, 29, 12, 0, 0);
const FICHA = "/alquiler/distrito-capital/chacao/apartamento-2h";
const TICKET = { address: "maria.f@gmail.com", sentAtMs: AHORA, returnTo: FICHA } as const;

describe("qué dirección estamos dispuestos a escribirle (22.22)", () => {
  it("normaliza igual que Auth.js, para que lo que se muestra sea lo que se manda", () => {
    // Auth.js normaliza con NFKC + minúsculas + recorte antes de mandar
    // (`defaultNormalizer`). Si acá se normalizara distinto, la pantalla de
    // espera mostraría una dirección y el correo saldría a otra.
    expect(magicLinkAddressOf("  Maria.F@Gmail.COM  ")).toBe("maria.f@gmail.com");
    expect(magicLinkAddressOf("maria＠gmail.com")).toBe("maria@gmail.com");
  });

  it("se niega a lo que no es una dirección, en vez de tirar", () => {
    expect(magicLinkAddressOf("")).toBeNull();
    expect(magicLinkAddressOf("maria.f")).toBeNull();
    expect(magicLinkAddressOf("maria@f@gmail.com")).toBeNull();
    expect(magicLinkAddressOf("maria@gmail")).toBeNull();
    expect(magicLinkAddressOf("@gmail.com")).toBeNull();
    expect(magicLinkAddressOf("maria f@gmail.com")).toBeNull();
    expect(magicLinkAddressOf(null)).toBeNull();
    expect(magicLinkAddressOf(42)).toBeNull();
  });

  /**
   * **Las dos que Auth.js acepta y recorta.** `defaultNormalizer` corta el
   * dominio en la primera coma y rechaza las comillas; una dirección con coma
   * saldría hacia el pedazo izquierdo mientras la pantalla muestra el texto
   * entero — la pantalla diría una cosa y el correo iría a otra. Rechazarlas
   * es lo único que mantiene esa igualdad.
   */
  it("rechaza la coma y la comilla, que son las que se recortan del otro lado", () => {
    expect(magicLinkAddressOf('"maria"@gmail.com')).toBeNull();
    expect(magicLinkAddressOf("maria@gmail.com,evil.test")).toBeNull();
  });

  it("rechaza una dirección más larga que la que un servidor de correo acepta", () => {
    expect(magicLinkAddressOf(`${"m".repeat(250)}@gmail.com`)).toBeNull();
  });
});

describe("cuándo se puede volver a pedir el enlace (15.9)", () => {
  it("sin nada mandado todavía, se puede", () => {
    const estado = resendStateFor({ sentAtMs: null, nowMs: AHORA });

    expect(estado.allowed).toBe(true);
    expect(estado.retryInSeconds).toBe(0);
    expect(estado.label).toBe("Volver a enviar el enlace");
  });

  /** El botón lleva la cuenta, no un gris sin explicación (nota de la 8c). */
  it("dentro de la ventana dice cuánto falta, en la cara del botón", () => {
    const estado = resendStateFor({ sentAtMs: AHORA, nowMs: AHORA + 18_000 });

    expect(estado.allowed).toBe(false);
    expect(estado.retryInSeconds).toBe(42);
    expect(estado.label).toBe("Volver a enviar en 0:42");
  });

  /** Mismo criterio que `isVerificationLinkExpired`: sólo lo estrictamente anterior. */
  it("en el instante exacto del límite ya se puede", () => {
    const limite = AHORA + MAGIC_LINK_RESEND_COOLDOWN_SECONDS * 1000;

    expect(resendStateFor({ sentAtMs: AHORA, nowMs: limite - 1 }).allowed).toBe(false);
    expect(resendStateFor({ sentAtMs: AHORA, nowMs: limite }).allowed).toBe(true);
  });

  /**
   * **Falla cerrado contra una cookie inventada.** El `sentAtMs` llega del
   * navegador; uno en el futuro no es prueba de nada, y sin este techo la cara
   * del botón diría «Volver a enviar en 16666:40».
   */
  it("un envío fechado en el futuro no autoriza nada, y no dibuja un número absurdo", () => {
    const estado = resendStateFor({ sentAtMs: AHORA + 999_999_999, nowMs: AHORA });

    expect(estado.allowed).toBe(false);
    expect(estado.retryInSeconds).toBe(MAGIC_LINK_RESEND_COOLDOWN_SECONDS);
    expect(estado.label).toBe("Volver a enviar en 1:00");
  });
});

describe("la decisión de mandar, que cuesta un correo de verdad (15.9)", () => {
  it("sin dirección no se manda nada", () => {
    expect(magicLinkRequestFor({ address: null, ticket: null, nowMs: AHORA })).toEqual({
      send: false,
      reason: "sin-direccion",
    });
  });

  it("la primera vez se manda", () => {
    expect(
      magicLinkRequestFor({ address: "maria.f@gmail.com", ticket: null, nowMs: AHORA }),
    ).toEqual({ send: true, address: "maria.f@gmail.com" });
  });

  it("repetir la misma dirección adentro de la ventana no manda, y dice cuánto falta", () => {
    expect(
      magicLinkRequestFor({
        address: "maria.f@gmail.com",
        ticket: TICKET,
        nowMs: AHORA + 18_000,
      }),
    ).toEqual({ send: false, reason: "muy-pronto", retryInSeconds: 42 });
  });

  it("pasada la ventana, la misma dirección se vuelve a mandar", () => {
    expect(
      magicLinkRequestFor({
        address: "maria.f@gmail.com",
        ticket: TICKET,
        nowMs: AHORA + MAGIC_LINK_RESEND_COOLDOWN_SECONDS * 1000,
      }),
    ).toEqual({ send: true, address: "maria.f@gmail.com" });
  });

  /**
   * **La espera es por buzón, no por navegador, y la diferencia es el error de
   * tipeo.** Quien escribe `maria.f@gmial.com` y se da cuenta al segundo tiene
   * que poder corregirlo ya: bloquearlo un minuto en la pantalla que el propio
   * documento del fundador llama «el punto de fuga principal» cuesta la cuenta
   * entera. Lo que la ventana evita es machacar el mismo buzón.
   */
  it("corregir un tipeo manda de inmediato: la ventana cuida un buzón, no una pestaña", () => {
    expect(
      magicLinkRequestFor({
        address: "maria.f@gmail.com",
        ticket: { ...TICKET, address: "maria.f@gmial.com" },
        nowMs: AHORA + 1_000,
      }),
    ).toEqual({ send: true, address: "maria.f@gmail.com" });
  });
});

describe("el comprobante que el navegador guarda (15.9)", () => {
  it("va y vuelve entero", () => {
    expect(magicLinkTicketOf(serialiseMagicLinkTicket(TICKET))).toEqual({
      ...TICKET,
      // Un comprobante sin huella es válido: lo que pierde es el sondeo, no la
      // espera (15.14).
      linkFingerprint: null,
      seal: null,
    });
  });

  it("sin comprobante, o con basura, no hay nada que mostrar", () => {
    expect(magicLinkTicketOf(undefined)).toBeNull();
    expect(magicLinkTicketOf("")).toBeNull();
    expect(magicLinkTicketOf("{")).toBeNull();
    expect(magicLinkTicketOf('"maria.f@gmail.com"')).toBeNull();
    expect(magicLinkTicketOf(JSON.stringify({ a: "maria.f@gmail.com" }))).toBeNull();
    expect(magicLinkTicketOf(JSON.stringify({ a: "no-es-correo", t: AHORA }))).toBeNull();
    expect(magicLinkTicketOf(JSON.stringify({ a: "maria.f@gmail.com", t: "ayer" }))).toBeNull();
  });

  /**
   * **El destino de la cookie se vuelve a juzgar, con la regla que ya existe.**
   * Una cookie la escribe cualquiera; sin esto la salida a Google de la
   * pantalla de espera sería un redirector abierto con nuestro dominio en la
   * barra. No se agrega una segunda lista: es `safeSignInReturn`.
   */
  it("un destino que la regla de vuelta no admite se cae del comprobante", () => {
    const forjado = JSON.stringify({
      a: "maria.f@gmail.com",
      t: AHORA,
      r: "https://evil.test/publicar",
    });

    expect(magicLinkTicketOf(forjado)).toEqual({
      ...TICKET,
      returnTo: null,
      linkFingerprint: null,
      seal: null,
    });
  });
});

describe("la pantalla de espera, que el enlace por correo obliga a tener (15.9)", () => {
  const espera = magicLinkWaitFor({ ticket: TICKET, nowMs: AHORA + 18_000 });

  it("muestra de vuelta la dirección tecleada, para cazar el tipeo sin volver", () => {
    expect(espera.title).toBe("Revisá tu correo");
    expect(espera.address).toBe("maria.f@gmail.com");
    expect(espera.leadBefore).toBe("Le mandamos un enlace a ");
    // «Tocalo» (8c) y «Hacé clic» (9c) son cada una falsa en el otro ancho, y
    // la copia sale del dominio: no puede cambiar con el ancho. Se toma el
    // verbo que sigue siendo cierto en los dos (ver 22.27).
    expect(espera.leadAfter).toBe(". Abrilo y entrás sin escribir nada más.");
  });

  /**
   * **El «15 minutos» se afirma por valor y no derivándolo de la constante.**
   * Escribir acá la misma expresión que usa el sujeto es una tautología: se
   * mueven juntas y la aserción no pregunta nada (trampa 1 del plan, medido —
   * con la constante puesta en 10 minutos esta prueba seguía verde). El número
   * pineado es el de la lámina; la derivación del otro lado es lo que impide
   * que la copia y el vencimiento real se separen.
   */
  it("explica por qué podría no llegar, y el vencimiento dibujado es el de verdad", () => {
    expect(espera.troublesTitle).toBe("Si no llega");
    expect(espera.troubles).toEqual([
      "Puede tardar hasta dos minutos.",
      "Mirá en correo no deseado.",
      "El enlace sirve una sola vez y vence en 15 minutos.",
    ]);
    expect(MAGIC_LINK_MAX_AGE_SECONDS).toBe(15 * 60);
  });

  it("el reenvío lleva la misma cuenta que decide el envío", () => {
    expect(espera.resend).toEqual(resendStateFor({ sentAtMs: AHORA, nowMs: AHORA + 18_000 }));
    expect(espera.resend.label).toBe("Volver a enviar en 0:42");
  });

  /** F20: nadie queda atrapado esperando — hay dos salidas, y las dos vuelven. */
  it("deja salir a Google y a cambiar de correo, las dos conservando el destino", () => {
    expect(espera.googleLabel).toBe("Mejor entro con Google");
    expect(espera.returnTo).toBe(FICHA);
    expect(espera.wayOut).toEqual({
      href: `/signin?callbackUrl=${encodeURIComponent(FICHA)}`,
      label: "← Cambiar de correo",
    });
  });

  it("sin destino, cambiar de correo vuelve a la puerta pelada", () => {
    const sinDestino = magicLinkWaitFor({
      ticket: { ...TICKET, returnTo: null },
      nowMs: AHORA,
    });

    expect(sinDestino.wayOut.href).toBe("/signin");
    expect(sinDestino.returnTo).toBeNull();
  });
});

/**
 * **La pregunta que el sondeo hace, y la que no puede hacer** (tasks.md 15.14).
 *
 * «¿Entró maria.f@gmail.com?» es una pregunta que cualquiera podría hacer sobre
 * cualquiera con sólo saber una dirección, y repetirla convierte la pantalla de
 * espera en una forma de saber cuándo alguien está conectado. La pregunta que
 * sí se puede hacer es «¿sigue vivo MI enlace?», y lo que la vuelve propia es
 * la huella: el sha256 de un token que sólo salió hacia un buzón.
 */
describe("el sondeo pregunta por el enlace, no por la persona (15.14)", () => {
  const HUELLA = "4f1a".repeat(16);
  const OTRA = "9b7c".repeat(16);
  const SELLO = "c0de".repeat(16);
  const CON_HUELLA = { ...TICKET, linkFingerprint: HUELLA, seal: SELLO } as const;

  it("mientras su enlace siga entre los pendientes, todavía no entró", () => {
    expect(magicLinkPollFor({ ticket: CON_HUELLA, pendingFingerprints: [HUELLA, OTRA] })).toEqual({
      entro: false,
    });
  });

  /**
   * Auth.js borra la fila al canjear el enlace (`useVerificationToken`, probado
   * contra Postgres en la 15.4), así que su desaparición ES la señal.
   */
  it("cuando su enlace ya no está pendiente, se abrió", () => {
    expect(magicLinkPollFor({ ticket: CON_HUELLA, pendingFingerprints: [] })).toEqual({
      entro: true,
    });
  });

  /**
   * **Un reenvío deja dos enlaces vivos del mismo buzón**, y sólo uno es el que
   * esta pestaña está mirando. Contestar por «hay algo pendiente para esta
   * dirección» diría «todavía esperás» después de que el enlace nuevo se abrió.
   */
  it("otro enlace del mismo buzón no es el suyo", () => {
    expect(magicLinkPollFor({ ticket: CON_HUELLA, pendingFingerprints: [OTRA] })).toEqual({
      entro: true,
    });
  });

  it("sin huella no hay respuesta que dar, y «no entró» sería inventarla", () => {
    expect(magicLinkPollFor({ ticket: TICKET, pendingFingerprints: [] })).toBeNull();
  });

  it("la huella y su sello van y vuelven en el comprobante", () => {
    expect(magicLinkTicketOf(serialiseMagicLinkTicket(CON_HUELLA))).toEqual(CON_HUELLA);
  });

  /**
   * **Media prueba no es prueba.** La huella sola no dice quién la emitió, y es
   * el sello lo que hace que la cookie sea un secreto de este navegador en vez
   * de un formulario más. Sin sello, la huella no viaja: se cae ella y no la
   * espera, la misma asimetría que el destino inadmisible.
   */
  it("una huella sin sello no viaja, y la espera sigue en pie", () => {
    const sinSello = magicLinkTicketOf(JSON.stringify({ a: TICKET.address, t: AHORA, k: HUELLA }));

    expect(sinSello?.address).toBe(TICKET.address);
    expect(sinSello?.linkFingerprint).toBeNull();
  });

  it("una huella con forma inventada se cae sola", () => {
    const forjado = magicLinkTicketOf(
      JSON.stringify({ a: TICKET.address, t: AHORA, k: "no-es-una-huella", s: SELLO }),
    );

    expect(forjado?.linkFingerprint).toBeNull();
  });

  /**
   * **El sondeo se apaga con el enlace.** Pasada su vida, «no está pendiente»
   * deja de significar «lo abrió» y pasa a significar «se venció»: seguir
   * preguntando anunciaría una entrada que nunca ocurrió.
   */
  it("pregunta mientras el enlace pueda abrirse, y ni un segundo más", () => {
    expect(magicLinkWaitFor({ ticket: CON_HUELLA, nowMs: AHORA }).poll).toEqual({
      everySeconds: MAGIC_LINK_POLL_INTERVAL_SECONDS,
      forSeconds: MAGIC_LINK_MAX_AGE_SECONDS,
    });
    expect(
      magicLinkWaitFor({
        ticket: CON_HUELLA,
        nowMs: AHORA + (MAGIC_LINK_MAX_AGE_SECONDS - 1) * 1000,
      }).poll,
    ).toEqual({ everySeconds: MAGIC_LINK_POLL_INTERVAL_SECONDS, forSeconds: 1 });
    expect(
      magicLinkWaitFor({
        ticket: CON_HUELLA,
        nowMs: AHORA + MAGIC_LINK_MAX_AGE_SECONDS * 1000,
      }).poll,
    ).toBeNull();
  });

  it("sin huella no hay nada que preguntar, y la pantalla queda igual", () => {
    const espera = magicLinkWaitFor({ ticket: TICKET, nowMs: AHORA });

    expect(espera.poll).toBeNull();
    expect(espera.resend.label).toBe("Volver a enviar en 1:00");
  });

  /** La frase que la 9c promete, y que hasta ahora no se podía decir sin mentir. */
  it("dice que la sesión quedó en el otro dispositivo, no que ya entró acá", () => {
    expect(magicLinkWaitFor({ ticket: CON_HUELLA, nowMs: AHORA }).signedInNotice).toBe(
      "Abriste el enlace en otro dispositivo. Podés seguir ahí: acá ya no hace falta esperar.",
    );
  });
});
