import { describe, expect, it, vi } from "vitest";
import { purgeDueAt, renewedExpiry } from "../domain/expiry";
import { mintRenewalToken } from "../domain/renewal-token";
import type {
  LifecycleListingsPort,
  RenewableListing,
  RenewRequest,
} from "./ports/lifecycle-listings.port";
import { previewRenewal, renewListing } from "./renew-listing";

const SECRET = "secreto";
const LISTING = "aviso-1";
const EXPIRES_AT = new Date("2026-08-31T10:00:00.000Z");
const NOW = new Date("2026-08-29T10:00:00.000Z");

const ROW: RenewableListing = {
  id: LISTING,
  title: "Apartamento 2 habitaciones",
  status: "active",
  expiresAt: EXPIRES_AT,
};

const TOKEN = mintRenewalToken({ listingId: LISTING, expiresAt: EXPIRES_AT }, SECRET);

/**
 * Un puerto con la MISMA condición que el `UPDATE`: sólo renueva si
 * `expires_at` todavía vale lo que el token firmó. Es lo que convierte «un
 * solo uso» en una propiedad del dato y no en una promesa del código.
 */
function port(row: RenewableListing | null = ROW): LifecycleListingsPort & {
  current: RenewableListing | null;
} {
  const state = { current: row };
  return {
    get current() {
      return state.current;
    },
    markExpired: vi.fn(async () => 0),
    noticeCandidates: vi.fn(async () => []),
    findRenewable: vi.fn(async () => state.current),
    renew: vi.fn(async (request: RenewRequest) => {
      if (!state.current) return false;
      if (state.current.expiresAt.getTime() !== request.expectedExpiresAt.getTime()) return false;
      state.current = {
        ...state.current,
        expiresAt: request.newExpiresAt,
        status: state.current.status === "expired" ? "active" : state.current.status,
      };
      return true;
    }),
  };
}

describe("renewListing", () => {
  it("renueva 30 días desde ahora y lo dice", async () => {
    const listings = port();

    const outcome = await renewListing(
      { token: TOKEN },
      { listings, renewalSecret: SECRET, now: () => NOW },
    );

    expect(outcome).toEqual({ status: "renewed", expiresAt: renewedExpiry(NOW) });
    expect(listings.current?.expiresAt).toEqual(renewedExpiry(NOW));
  });

  // **La mutación que carga el peso: el token repetido.** No hay tabla de
  // tokens quemados — lo que lo quema es que renovar mueve el `expires_at` que
  // el token firmó, así que el segundo intento no encaja con ninguna fila.
  it("rechaza el mismo token usado por segunda vez", async () => {
    const listings = port();
    const deps = { listings, renewalSecret: SECRET, now: () => NOW };

    const first = await renewListing({ token: TOKEN }, deps);
    const second = await renewListing({ token: TOKEN }, deps);

    expect(first.status).toBe("renewed");
    expect(second).toEqual({ status: "already-used" });
    // Y no volvió a moverse: dos clics del mismo enlace no dan 60 días.
    expect(listings.current?.expiresAt).toEqual(renewedExpiry(NOW));
  });

  // 7.10/19c: el vencido se CONSERVA y sigue siendo renovable. Renovarlo lo
  // devuelve a `active`, que es lo que lo hace volver a la búsqueda.
  it("un aviso ya vencido se renueva y vuelve a estar activo", async () => {
    const listings = port({ ...ROW, status: "expired" });
    const afterExpiry = new Date("2026-09-05T10:00:00.000Z");

    const outcome = await renewListing(
      { token: TOKEN },
      { listings, renewalSecret: SECRET, now: () => afterExpiry },
    );

    expect(outcome).toEqual({ status: "renewed", expiresAt: renewedExpiry(afterExpiry) });
    expect(listings.current?.status).toBe("active");
  });

  it.each([
    ["inventado", "v1.abc.def"],
    [
      "firmado con otro secreto",
      mintRenewalToken({ listingId: LISTING, expiresAt: EXPIRES_AT }, "otro"),
    ],
  ])("rechaza un token %s sin tocar la base", async (_name, token) => {
    const listings = port();

    const outcome = await renewListing(
      { token },
      { listings, renewalSecret: SECRET, now: () => NOW },
    );

    expect(outcome).toEqual({ status: "invalid", reason: "bad-signature" });
    expect(listings.renew).not.toHaveBeenCalled();
  });

  it("rechaza un token vencido sin tocar la base", async () => {
    const listings = port();

    const outcome = await renewListing(
      { token: TOKEN },
      {
        listings,
        renewalSecret: SECRET,
        now: () => new Date(purgeDueAt(EXPIRES_AT).getTime() + 1),
      },
    );

    expect(outcome).toEqual({ status: "invalid", reason: "expired" });
    expect(listings.renew).not.toHaveBeenCalled();
  });
});

describe("previewRenewal", () => {
  // **El GET no muta, y esto es lo que lo prueba.** No alcanza con no llamar a
  // `renew` por convención: la prueba lo afirma sobre el espía y sobre la fila.
  it("muestra la confirmación sin mover nada", async () => {
    const listings = port();

    const preview = await previewRenewal(
      { token: TOKEN },
      { listings, renewalSecret: SECRET, now: () => NOW },
    );

    expect(preview).toEqual({ status: "ready", listing: ROW });
    expect(listings.renew).not.toHaveBeenCalled();
    expect(listings.current?.expiresAt).toEqual(EXPIRES_AT);
  });

  it("un aviso que ya no existe no muestra confirmación", async () => {
    const listings = port(null);

    expect(
      await previewRenewal({ token: TOKEN }, { listings, renewalSecret: SECRET, now: () => NOW }),
    ).toEqual({ status: "not-found" });
  });

  it("un token inválido no llega ni a leer el aviso", async () => {
    const listings = port();

    const preview = await previewRenewal(
      { token: "v1.roto.roto" },
      { listings, renewalSecret: SECRET, now: () => NOW },
    );

    expect(preview).toEqual({ status: "invalid", reason: "bad-signature" });
    expect(listings.findRenewable).not.toHaveBeenCalled();
  });
});
