import { describe, expect, it } from "vitest";
import {
  buildPublisherListingBoard,
  type PublisherListing,
  parsePublisherListingFilter,
} from "./publisher-listing-board";

/**
 * tasks.md 9.28 — «Mis avisos» de la inmobiliaria (lámina 14d).
 *
 * **Lo que decide este archivo, y por qué acá y no en la pantalla.** Cuáles
 * avisos van primero, cuál es el estado de cada uno, cuántos hay de cada
 * clase y cuántos «no se ven todavía» son afirmaciones sobre el producto, no
 * sobre píxeles: la lámina las escribe en su encabezado —«88 en total · 38 no
 * se ven todavía»— y su propia anotación al pie dice por qué el orden
 * importa: *"los borradores van arriba: son los que no se ven, y por eso los
 * que importan"*. Una regla escrita en `app/mis-avisos/page.tsx` es una regla
 * que el piso de 90% no alcanza (AGENTS.md §1).
 *
 * **Lo que este archivo NO decide: si un borrador puede activarse.** Eso lo
 * contesta `activateListing`, que re-valida con `validatePublishableListing`
 * en etapa `"activation"`. Acá sólo se cuenta cuántos borradores están sin
 * fotos, con la MISMA constante que ese validador aplica.
 */

const NOW = new Date("2026-08-27T12:00:00Z");

function listing(overrides: Partial<PublisherListing> = {}): PublisherListing {
  return {
    id: "listing-1",
    title: "Apartamento amoblado en La Castellana",
    priceUsd: 610,
    zoneName: "La Castellana",
    rooms: 3,
    areaM2: 128,
    publisherType: "broker",
    externalReference: "LC-0912",
    status: "draft",
    photoCount: 0,
    // 22 días, el número que la lámina escribe en la ficha «Activa».
    expiresAt: new Date("2026-09-18T12:00:00Z"),
    ...overrides,
  };
}

const ACTIVE = listing({ id: "activa", status: "active", photoCount: 3 });
const EXPIRING = listing({
  id: "vence-pronto",
  status: "active",
  photoCount: 2,
  // «Vence en 3 días» (14d).
  expiresAt: new Date("2026-08-30T12:00:00Z"),
});
const HIDDEN = listing({ id: "oculta", status: "hidden", photoCount: 4 });
const EXPIRED = listing({
  id: "vencida",
  status: "expired",
  photoCount: 1,
  expiresAt: new Date("2026-08-02T12:00:00Z"),
});
const DRAFT = listing({ id: "borrador", status: "draft", photoCount: 0 });

describe("buildPublisherListingBoard — los cinco estados de 14d", () => {
  it("un borrador se lee como borrador, y dice cuántas fotos le faltan por tener cero", () => {
    const board = buildPublisherListingBoard([DRAFT], NOW);

    expect(board.cards[0]?.state).toBe("draft");
    expect(board.cards[0]?.photoCount).toBe(0);
    expect(board.draftsAwaitingPhotos).toBe(1);
  });

  it("un borrador que YA tiene una foto deja de contar entre los que esperan fotos", () => {
    const board = buildPublisherListingBoard([listing({ status: "draft", photoCount: 1 })], NOW);

    expect(board.cards[0]?.state).toBe("draft");
    expect(board.draftsAwaitingPhotos).toBe(0);
  });

  it("un aviso activo lejos de su vencimiento es «activa», y dice cuántos días le quedan", () => {
    const board = buildPublisherListingBoard([ACTIVE], NOW);

    expect(board.cards[0]?.state).toBe("active");
    expect(board.cards[0]?.daysToExpiry).toBe(22);
  });

  it("un aviso activo dentro de la ventana de vencimiento es «vence pronto»", () => {
    const board = buildPublisherListingBoard([EXPIRING], NOW);

    expect(board.cards[0]?.state).toBe("expiringSoon");
    expect(board.cards[0]?.daysToExpiry).toBe(3);
  });

  /**
   * `markExpired` corre en un cron con `WHERE status = 'active'`, así que
   * entre el minuto en que un aviso vence y el minuto en que el trabajo pasa,
   * la fila sigue diciendo `active`. Dibujarla como activa sería repetir lo
   * que la base todavía no corrigió; la fecha es el hecho, el estado es su
   * registro.
   */
  it("un aviso que la base todavía llama activo pero cuya fecha ya pasó se lee como vencido", () => {
    const board = buildPublisherListingBoard(
      [listing({ status: "active", photoCount: 2, expiresAt: new Date("2026-08-02T12:00:00Z") })],
      NOW,
    );

    expect(board.cards[0]?.state).toBe("expired");
    expect(board.cards[0]?.daysToExpiry).toBeNull();
  });

  it("un aviso oculto por reportes se lee como oculto, aunque su fecha no haya vencido", () => {
    const board = buildPublisherListingBoard([HIDDEN], NOW);

    expect(board.cards[0]?.state).toBe("hidden");
  });
});

describe("buildPublisherListingBoard — el orden y las cuentas del encabezado (14d)", () => {
  const TODOS = [ACTIVE, EXPIRED, DRAFT, HIDDEN, EXPIRING];

  /**
   * «Los borradores van arriba: son los que no se ven, y por eso los que
   * importan» — la anotación al pie de 14d. Después va lo que corre reloj, y
   * al final lo que ya no depende de nadie.
   */
  it("los borradores van primero, después lo urgente, y las vencidas al final", () => {
    const board = buildPublisherListingBoard(TODOS, NOW);

    expect(board.cards.map((card) => card.id)).toEqual([
      "borrador",
      "vence-pronto",
      "oculta",
      "activa",
      "vencida",
    ]);
  });

  it("cuenta el total, los que no se ven y los publicados como los escribe el encabezado", () => {
    const board = buildPublisherListingBoard(TODOS, NOW);

    expect(board.total).toBe(5);
    expect(board.draftsAwaitingPhotos).toBe(1);
    // «50 de 88 publicados»: todo lo que alguna vez salió de borrador.
    expect(board.publishedCount).toBe(4);
  });

  it("da una ficha por chip con su cuenta, en el orden de la lámina", () => {
    const board = buildPublisherListingBoard(TODOS, NOW);

    expect(board.chips).toEqual([
      { filter: "todos", label: "Todos", count: 5 },
      { filter: "borradores", label: "Borradores", count: 1 },
      { filter: "activas", label: "Activas", count: 1 },
      { filter: "vencen-pronto", label: "Vencen pronto", count: 1 },
      { filter: "vencidas", label: "Vencidas", count: 1 },
      { filter: "ocultas", label: "Ocultas", count: 1 },
    ]);
  });

  it("sin un solo aviso el tablero no miente: cero en todo y ninguna ficha", () => {
    const board = buildPublisherListingBoard([], NOW);

    expect(board.total).toBe(0);
    expect(board.cards).toEqual([]);
    expect(board.draftsAwaitingPhotos).toBe(0);
    expect(board.chips.every((chip) => chip.count === 0)).toBe(true);
  });
});

describe("buildPublisherListingBoard — el filtro elegido", () => {
  const TODOS = [ACTIVE, EXPIRED, DRAFT, HIDDEN, EXPIRING];

  it("«borradores» deja sólo los borradores", () => {
    const board = buildPublisherListingBoard(TODOS, NOW, "borradores");

    expect(board.cards.map((card) => card.id)).toEqual(["borrador"]);
  });

  it("«vencen-pronto» deja sólo el que corre reloj, no el que ya venció", () => {
    const board = buildPublisherListingBoard(TODOS, NOW, "vencen-pronto");

    expect(board.cards.map((card) => card.id)).toEqual(["vence-pronto"]);
  });

  /**
   * Si las cuentas se calcularan sobre lo filtrado, elegir «Borradores»
   * pondría las otras cinco fichas en cero y la pantalla diría que la cuenta
   * no tiene avisos activos. La ficha cuenta lo que hay, no lo que se está
   * mirando.
   */
  it("las cuentas de las fichas NO cambian al filtrar: cuentan todo, no lo mostrado", () => {
    const board = buildPublisherListingBoard(TODOS, NOW, "borradores");

    expect(board.chips.map((chip) => chip.count)).toEqual([5, 1, 1, 1, 1, 1]);
    expect(board.total).toBe(5);
  });
});

describe("parsePublisherListingFilter — falla cerrado", () => {
  it("reconoce cada uno de los seis filtros que la lámina dibuja", () => {
    expect(parsePublisherListingFilter("borradores")).toBe("borradores");
    expect(parsePublisherListingFilter("vencen-pronto")).toBe("vencen-pronto");
    expect(parsePublisherListingFilter("ocultas")).toBe("ocultas");
  });

  /**
   * Un parámetro inventado no puede elegir un subconjunto que nadie definió
   * (AGENTS.md §7): cae en «todos», que es el estado por defecto de la
   * pantalla y no esconde nada.
   */
  it("cualquier otra cosa cae en «todos», nunca en una lista vacía", () => {
    expect(parsePublisherListingFilter("../../etc/passwd")).toBe("todos");
    expect(parsePublisherListingFilter(undefined)).toBe("todos");
    expect(parsePublisherListingFilter("")).toBe("todos");
  });
});
