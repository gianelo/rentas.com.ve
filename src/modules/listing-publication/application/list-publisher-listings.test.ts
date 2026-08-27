import { describe, expect, it, vi } from "vitest";
import type { SessionPort } from "../../identity/application/ports/session.port";
import { UnauthenticatedError } from "../../identity/application/require-authenticated-session";
import { listPublisherListings } from "./list-publisher-listings";
import type { PublisherListingRow, PublisherListingsPort } from "./ports/publisher-listings.port";

/**
 * tasks.md 9.28 — el caso de uso que «Mis avisos» necesita para existir.
 *
 * **Lo que se prueba acá es de quién son los avisos.** El tablero
 * (`publisher-listing-board.ts`) ya tiene sus propias pruebas sobre estados,
 * orden y cuentas; esto prueba la única regla que un tablero puro no puede
 * tener: que la lista sale de la sesión y de ningún otro lado.
 */

const NOW = new Date("2026-08-27T12:00:00Z");

function sessionPortReturning(userId: string | null): SessionPort {
  return {
    async getSession() {
      return userId ? { userId, email: null, name: null } : null;
    },
  };
}

function row(overrides: Partial<PublisherListingRow> = {}): PublisherListingRow {
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
    expiresAt: new Date("2026-09-18T12:00:00Z"),
    ...overrides,
  };
}

function listingsPort(rows: readonly PublisherListingRow[]): PublisherListingsPort & {
  readonly listByPublisher: ReturnType<typeof vi.fn>;
} {
  return { listByPublisher: vi.fn(async () => rows) };
}

describe("listPublisherListings", () => {
  it("refusa a quien no tiene sesión ANTES de leer un solo aviso", async () => {
    const listings = listingsPort([row()]);

    await expect(
      listPublisherListings(
        {},
        { sessionPort: sessionPortReturning(null), listings, now: () => NOW },
      ),
    ).rejects.toBeInstanceOf(UnauthenticatedError);

    expect(listings.listByPublisher).not.toHaveBeenCalled();
  });

  /**
   * **La regla que este caso de uso existe para tener.** El id sale de la
   * sesión; el pedido no puede nombrar una cuenta. Un puerto llamado con un
   * id del pedido convertiría «Mis avisos» en «los avisos de cualquiera».
   */
  it("lee los avisos de la cuenta de la sesión, y el pedido no puede nombrar otra", async () => {
    const listings = listingsPort([row()]);

    await listPublisherListings(
      // Un pedido que intenta nombrar otra cuenta: se ignora por completo,
      // porque este caso de uso no tiene ningún parámetro que la acepte.
      { filter: "todos" },
      { sessionPort: sessionPortReturning("broker-1"), listings, now: () => NOW },
    );

    expect(listings.listByPublisher).toHaveBeenCalledTimes(1);
    expect(listings.listByPublisher).toHaveBeenCalledWith("broker-1");
  });

  it("devuelve el tablero armado: estados, cuentas y fichas", async () => {
    const listings = listingsPort([
      row({ id: "borrador", status: "draft", photoCount: 0 }),
      row({ id: "activa", status: "active", photoCount: 3 }),
    ]);

    const board = await listPublisherListings(
      {},
      { sessionPort: sessionPortReturning("broker-1"), listings, now: () => NOW },
    );

    expect(board.total).toBe(2);
    expect(board.draftsAwaitingPhotos).toBe(1);
    expect(board.cards.map((card) => card.id)).toEqual(["borrador", "activa"]);
    expect(board.chips.find((chip) => chip.filter === "borradores")?.count).toBe(1);
  });

  it("aplica el filtro pedido, y uno inventado no vacía la pantalla", async () => {
    const rows = [
      row({ id: "borrador", status: "draft", photoCount: 0 }),
      row({ id: "activa", status: "active", photoCount: 3 }),
    ];

    const soloBorradores = await listPublisherListings(
      { filter: "borradores" },
      {
        sessionPort: sessionPortReturning("broker-1"),
        listings: listingsPort(rows),
        now: () => NOW,
      },
    );
    expect(soloBorradores.cards.map((card) => card.id)).toEqual(["borrador"]);

    const inventado = await listPublisherListings(
      { filter: "%2e%2e%2f" },
      {
        sessionPort: sessionPortReturning("broker-1"),
        listings: listingsPort(rows),
        now: () => NOW,
      },
    );
    expect(inventado.cards.map((card) => card.id)).toEqual(["borrador", "activa"]);
  });

  /**
   * Sin `now`, el reloj es el del sistema — la misma forma que
   * `activateListing` y `attachPhotoToDraft` ya usan. Se prueba con una fecha
   * lo bastante lejana para que la respuesta no dependa del día en que corra
   * la suite: un aviso que vence en años es «activa» hoy y lo será mañana.
   */
  it("sin reloj inyectado usa el del sistema, y sigue contestando", async () => {
    const listings = listingsPort([
      row({ id: "activa", status: "active", photoCount: 3, expiresAt: new Date("2099-01-01") }),
    ]);

    const board = await listPublisherListings(
      {},
      { sessionPort: sessionPortReturning("broker-1"), listings },
    );

    expect(board.cards[0]?.state).toBe("active");
    expect(board.total).toBe(1);
  });

  /**
   * El reloj entra por dependencia, igual que en `activateListing`. Sin esto,
   * «vence pronto» sería una respuesta que ninguna prueba puede fijar.
   */
  it("usa el reloj que le pasan para decidir qué vence pronto", async () => {
    const listings = listingsPort([
      row({
        id: "activa",
        status: "active",
        photoCount: 3,
        expiresAt: new Date("2026-08-30T12:00:00Z"),
      }),
    ]);

    const board = await listPublisherListings(
      {},
      { sessionPort: sessionPortReturning("broker-1"), listings, now: () => NOW },
    );

    expect(board.cards[0]?.state).toBe("expiringSoon");
    expect(board.cards[0]?.daysToExpiry).toBe(3);
  });
});
