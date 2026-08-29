import { describe, expect, it, vi } from "vitest";
import type {
  AuthenticatedSession,
  SessionPort,
} from "../../identity/application/ports/session.port";
import type { ContactVerificationEvidencePort } from "../../identity/application/ports/verified-contact.port";
import type { ContactVerificationEvidence } from "../../identity/domain/contact-verification";
import type {
  ContactRevealMetricsPort,
  UniqueRevealPair,
} from "./ports/contact-reveal-metrics.port";
import type { RevealMessageHistoryPort } from "./ports/reveal-rate-limit.port";
import type { RevealableListing, RevealableListingPort } from "./ports/revealable-listing.port";
import { viewListingContact } from "./view-listing-contact";

const TENANT: AuthenticatedSession = {
  userId: "tenant-1",
  email: "tenant@example.com",
  name: "Jane Doe",
};

const LISTING: RevealableListing = {
  listingId: "listing-1",
  publisherId: "publisher-1",
  cityId: "city-caracas",
  contactMethod: "whatsapp",
  contactValue: "+58 412 555 0134",
};

const PAIR: UniqueRevealPair = {
  tenantUserId: TENANT.userId,
  listingId: LISTING.listingId,
  publisherId: LISTING.publisherId,
  cityId: LISTING.cityId,
  firstRevealedAt: new Date("2026-03-01T10:00:00.000Z"),
  revealCount: 1,
};

function dependencies(
  session: AuthenticatedSession | null,
  pairs: readonly UniqueRevealPair[] = [],
  listing: RevealableListing | null = LISTING,
  message: string | null = null,
  evidence: ContactVerificationEvidence | null = null,
) {
  const sessionPort: SessionPort = { getSession: vi.fn().mockResolvedValue(session) };
  const listings: RevealableListingPort = { findRevealable: vi.fn().mockResolvedValue(listing) };
  const reveals: ContactRevealMetricsPort = {
    findUniquePairs: vi.fn().mockResolvedValue(pairs),
  };
  const messages: RevealMessageHistoryPort = {
    findLatestMessage: vi.fn().mockResolvedValue(message),
  };
  const verification: ContactVerificationEvidencePort = {
    findEvidence: vi.fn().mockResolvedValue(evidence),
  };

  return { sessionPort, listings, reveals, messages, verification };
}

const ACTIVE = {
  listingId: LISTING.listingId,
  method: "whatsapp",
  availability: "available",
} as const;

describe("viewListingContact", () => {
  /**
   * **La garantía entera del bloque bloqueado, y no es el `state`.** Es que
   * el valor NO SE LEE: mientras nadie revele, el número no sale de Postgres,
   * así que no hay render, JSON ni carga de componente de servidor que pueda
   * filtrarlo por descuido. Un caso de uso que leyera el aviso y después
   * decidiera qué mostrar dependería de que cada componente se acuerde de
   * mirar el `state` — y ese olvido es silencioso.
   */
  it("no le pide el valor al catálogo cuando el visitante es anónimo", async () => {
    const deps = dependencies(null);

    const view = await viewListingContact(ACTIVE, deps);

    expect(view.contact).toEqual({ state: "locked", method: "whatsapp" });
    expect(deps.listings.findRevealable).not.toHaveBeenCalled();
    // tasks.md 6.14 — el bloqueado no puede filtrar el mensaje: ni la clave
    // ni el viaje que lo trae.
    expect(deps.messages.findLatestMessage).not.toHaveBeenCalled();
  });

  it("tampoco lo lee para quien entró pero todavía no reveló", async () => {
    // Entrar no es revelar: la revelación es el hecho que la métrica cuenta
    // (design.md D6), y una sesión que abriera el número por sí sola no
    // inflaría el número — lo dejaría ciego.
    const deps = dependencies(TENANT, []);

    const view = await viewListingContact(ACTIVE, deps);

    expect(view.contact).toEqual({ state: "locked", method: "whatsapp" });
    expect(deps.listings.findRevealable).not.toHaveBeenCalled();
    expect(deps.messages.findLatestMessage).not.toHaveBeenCalled();
  });

  it("entrega el valor a quien ya reveló este aviso", async () => {
    const deps = dependencies(TENANT, [PAIR]);

    expect((await viewListingContact(ACTIVE, deps)).contact).toEqual({
      state: "revealed",
      method: "whatsapp",
      value: "+58 412 555 0134",
      message: null,
    });
  });

  // tasks.md 6.14 — "the contact action opens with the submitted message
  // already written". Repeat reveals never deduplicate (task 6.4), so the
  // port itself decides "latest"; this use case only carries what it hands
  // back.
  it("entrega el mensaje más reciente que el inquilino escribió al revelar", async () => {
    const deps = dependencies(TENANT, [PAIR], LISTING, "Hola, vi tu aviso y me interesa.");

    expect((await viewListingContact(ACTIVE, deps)).contact).toEqual({
      state: "revealed",
      method: "whatsapp",
      value: "+58 412 555 0134",
      message: "Hola, vi tu aviso y me interesa.",
    });
    expect(deps.messages.findLatestMessage).toHaveBeenCalledWith(TENANT.userId, LISTING.listingId);
  });

  // task 6.11 — una revelación anterior al requisito guarda `message: NULL`.
  // Eso no es un mensaje vacío ni un error: es "esta revelación es previa a
  // la regla", y el render no puede confundirlo con lo uno ni con lo otro.
  it("no revienta cuando la revelación es anterior al requisito del mensaje", async () => {
    const deps = dependencies(TENANT, [PAIR], LISTING, null);

    expect((await viewListingContact(ACTIVE, deps)).contact).toEqual({
      state: "revealed",
      method: "whatsapp",
      value: "+58 412 555 0134",
      message: null,
    });
  });

  /**
   * **El filtro lleva las dos claves, y si le falta una el fallo es enorme y
   * mudo.** Preguntando sólo por `listingId`, el primer inquilino que revela
   * un aviso se lo abre a todos los demás; preguntando sólo por
   * `tenantUserId`, revelar un aviso abre todos los avisos. Las dos versiones
   * devuelven filas, ninguna lanza nada.
   */
  it("pregunta por el par inquilino + aviso, nunca por uno solo", async () => {
    const deps = dependencies(TENANT, [PAIR]);

    await viewListingContact(ACTIVE, deps);

    expect(deps.reveals.findUniquePairs).toHaveBeenCalledWith({
      listingId: LISTING.listingId,
      tenantUserId: TENANT.userId,
    });
  });

  /**
   * Un aviso vencido no tiene contacto en ningún estado de sesión, y acá eso
   * se paga además en lecturas: no se consulta la sesión, ni la métrica, ni
   * el catálogo. La decisión es del dominio; lo que este caso de uso agrega
   * es no ir a buscar nada para tomarla.
   */
  it("resuelve el aviso vencido sin leer sesión, métrica ni catálogo", async () => {
    const deps = dependencies(TENANT, [PAIR]);

    const view = await viewListingContact({ ...ACTIVE, availability: "expired" }, deps);

    expect(view.contact).toEqual({ state: "expired" });
    expect(deps.sessionPort.getSession).not.toHaveBeenCalled();
    expect(deps.reveals.findUniquePairs).not.toHaveBeenCalled();
    expect(deps.listings.findRevealable).not.toHaveBeenCalled();
  });

  /**
   * **La carrera real, no una hipotética.** El evento de revelación sobrevive
   * al aviso a propósito (la métrica no se puede borrar con un `JOIN`), así
   * que un aviso dado de baja después de la revelación deja al par existiendo
   * y al aviso ya no revelable. Sin esta rama, `contactValue` de `null`
   * llegaría como `undefined` hasta el render.
   */
  it("vuelve a bloquear si el aviso dejó de ser revelable después de la revelación", async () => {
    const deps = dependencies(TENANT, [PAIR], null, "Hola, me interesa.");

    const view = await viewListingContact(ACTIVE, deps);

    expect(view.contact).toEqual({ state: "locked", method: "whatsapp" });
    // Bloqueado por esta rama también, aunque `hasRevealed` sea `true` y el
    // mensaje SÍ se haya leído: el tipo `ContactPresentation` ni siquiera
    // declara `message` en su variante `locked`, así que esto no podría
    // filtrarse de otra forma — la prueba lo hace visible igual.
    expect(Object.keys(view.contact)).not.toContain("message");
  });

  /**
   * El método lo pone la ficha, que ya lo tiene; el valor lo pone el
   * catálogo. Que el aviso guarde otro canal del que la ficha dibujó es un
   * dato desincronizado, y gana el que trae el valor: el rótulo tiene que
   * nombrar el canal del número que se está mostrando.
   */
  it("nombra el canal del valor que efectivamente entrega", async () => {
    const deps = dependencies(TENANT, [PAIR], {
      ...LISTING,
      contactMethod: "email",
      contactValue: "duenio@ejemplo.com",
    });

    expect((await viewListingContact(ACTIVE, deps)).contact).toEqual({
      state: "revealed",
      method: "email",
      value: "duenio@ejemplo.com",
      message: null,
    });
  });

  /**
   * **La verificación se pregunta por el TRIPLE, nunca por la persona**
   * (tasks.md 19.9). Si María verificó un número y publica con otro, ese otro
   * no está verificado: preguntar sólo por la cuenta daría por bueno
   * cualquier valor que escriba después, y distinguir un aviso real de uno
   * falso es lo único para lo que la verificación existe.
   *
   * La cuenta es la del aviso —`publisherId` de la fila recién leída— y no
   * la de quien mira. Preguntando con `session.userId` la ficha diría que el
   * teléfono del dueño está verificado porque el INQUILINO verificó el suyo.
   */
  it("pregunta por el triple del aviso, no por la persona ni por quien mira", async () => {
    const deps = dependencies(TENANT, [PAIR]);

    await viewListingContact(ACTIVE, deps);

    expect(deps.verification.findEvidence).toHaveBeenCalledWith({
      userId: "publisher-1",
      contact: { method: "whatsapp", value: "+58 412 555 0134" },
    });
  });

  /**
   * **Ni una consulta más en el camino normal.** Quien llega de Google no
   * tiene sesión y quien tiene sesión casi nunca reveló este aviso: la ficha
   * es la pantalla más visitada del sitio, y una lectura de `verified_contact`
   * por visita anónima se paga en cada una de ellas. Además no habría nada que
   * preguntar — sin valor revelado no hay contacto del que hablar.
   */
  it("no lee `verified_contact` mientras nadie haya revelado", async () => {
    const anonima = dependencies(null);
    await viewListingContact(ACTIVE, anonima);
    expect(anonima.verification.findEvidence).not.toHaveBeenCalled();

    const sinRevelar = dependencies(TENANT, []);
    await viewListingContact(ACTIVE, sinRevelar);
    expect(sinRevelar.verification.findEvidence).not.toHaveBeenCalled();

    const vencida = dependencies(TENANT, [PAIR]);
    await viewListingContact({ ...ACTIVE, availability: "expired" }, vencida);
    expect(vencida.verification.findEvidence).not.toHaveBeenCalled();
  });

  /**
   * **La cuenta existe y este contacto no está verificado — que NO es lo
   * mismo que no existir la cuenta.** El puerto devuelve la fila del `LEFT
   * JOIN` con `verifiedAt` en `null`, y eso tiene que llegar a la pantalla
   * como «no hay nada que decir». Un texto por defecto acá certificaría lo
   * que nadie comprobó.
   */
  it("no dice nada de la verificación cuando el triple no tiene fila", async () => {
    const deps = dependencies(TENANT, [PAIR], LISTING, null, {
      verifiedAt: null,
      accountEmail: "maria@ejemplo.com",
      accountEmailVerifiedAt: new Date("2026-08-19T12:00:00.000Z"),
    });

    const view = await viewListingContact(ACTIVE, deps);

    expect(view.contact.state).toBe("revealed");
    expect(view.verificationNotice).toBeNull();
  });

  /**
   * **La 16.12 en una línea: el instante que la ficha necesita ES
   * `verified_contact.verified_at`.** Fijada por valor, con el canal del
   * contacto que efectivamente se entrega — no un «por WhatsApp» fijo, que
   * hoy sería falso para toda fila (el canal de WhatsApp está diferido,
   * fundador 2026-08-29).
   */
  it("dice desde cuándo está verificado cuando el triple tiene fila", async () => {
    const deps = dependencies(TENANT, [PAIR], LISTING, null, {
      verifiedAt: new Date("2026-08-19T12:00:00.000Z"),
      accountEmail: "maria@ejemplo.com",
      accountEmailVerifiedAt: null,
    });

    const view = await viewListingContact(ACTIVE, deps);

    expect(view.verificationNotice).toBe("verificado por WhatsApp el 19 ago.");
  });
});
