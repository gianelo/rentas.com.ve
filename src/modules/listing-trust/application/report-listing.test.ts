import { describe, expect, it, vi } from "vitest";
import type {
  AuthenticatedSession,
  SessionPort,
} from "../../identity/application/ports/session.port";
import { UnauthenticatedError } from "../../identity/application/require-authenticated-session";
import type { ListingModerationPort, ModeratedListing } from "./ports/listing-moderation.port";
import type { ListingReportPort, NewListingReport } from "./ports/listing-report.port";
import { ListingNotFoundError, reportListing } from "./report-listing";

const REPORTER: AuthenticatedSession = {
  userId: "tenant-1",
  email: "tenant@example.com",
  name: "Jane Doe",
};

const ACTIVE_LISTING: ModeratedListing = {
  listingId: "listing-1",
  status: "active",
  expiresAt: new Date("2026-09-30T00:00:00.000Z"),
};

/** Records every write, so "how many rows / how many transitions" is an assertion. */
function recordingReports(distinctCountAfterRecord: number) {
  const written: NewListingReport[] = [];
  const port: ListingReportPort = {
    record: async (report) => {
      written.push(report);
    },
    countDistinctReporters: vi.fn().mockResolvedValue(distinctCountAfterRecord),
  };
  return { port, written };
}

function recordingListings(listing: ModeratedListing | null) {
  const statusChanges: Array<{ listingId: string; status: string }> = [];
  const port: ListingModerationPort = {
    findModerated: vi.fn().mockResolvedValue(listing),
    setStatus: async (listingId, status) => {
      statusChanges.push({ listingId, status });
    },
  };
  return { port, statusChanges };
}

function dependencies(
  session: AuthenticatedSession | null,
  listing: ModeratedListing | null = ACTIVE_LISTING,
  distinctCountAfterRecord = 1,
) {
  const sessionPort: SessionPort = { getSession: vi.fn().mockResolvedValue(session) };
  const listings = recordingListings(listing);
  const reports = recordingReports(distinctCountAfterRecord);
  const clock = { at: new Date("2026-03-01T10:00:00.000Z") };

  return {
    sessionPort,
    listings: listings.port,
    statusChanges: listings.statusChanges,
    reports: reports.port,
    written: reports.written,
    now: () => clock.at,
  };
}

describe("reportListing", () => {
  // listing-trust spec, Requirement: Authenticated Reporting, Scenario
  // "Unauthenticated visitor cannot report" (tasks.md 8.2).
  it("refuses an anonymous visitor and records nothing", async () => {
    const deps = dependencies(null);

    await expect(reportListing({ listingId: "listing-1" }, deps)).rejects.toThrow(
      UnauthenticatedError,
    );
    expect(deps.written).toHaveLength(0);
    expect(deps.statusChanges).toHaveLength(0);
  });

  // Ordering, same guarantee revealContact already carries: the session gate
  // must run before the listing is ever read, or an anonymous request can
  // still make this function query the catalogue.
  it("reads the session before touching the listing at all", async () => {
    const deps = dependencies(null);

    await expect(reportListing({ listingId: "listing-1" }, deps)).rejects.toThrow(
      UnauthenticatedError,
    );
    expect(deps.listings.findModerated).not.toHaveBeenCalled();
  });

  it("throws when the listing does not exist and records nothing", async () => {
    const deps = dependencies(REPORTER, null);

    await expect(reportListing({ listingId: "gone" }, deps)).rejects.toThrow(ListingNotFoundError);
    expect(deps.written).toHaveLength(0);
  });

  // listing-trust spec, Scenario "Repeated reports from the same account do
  // not trigger auto-hide alone" (tasks.md 8.3). The distinct count itself
  // is the port's job (proven for real in tests/integration); this asserts
  // the use case's own behaviour when the count stays at 1.
  it("records the report and does not hide the listing below the threshold", async () => {
    const deps = dependencies(REPORTER, ACTIVE_LISTING, 1);

    const result = await reportListing({ listingId: "listing-1" }, deps);

    expect(deps.written).toEqual([
      { listingId: "listing-1", reporterId: "tenant-1", reportedAt: deps.now() },
    ]);
    expect(deps.statusChanges).toHaveLength(0);
    expect(result).toEqual({ autoHidden: false });
  });

  // listing-trust spec, Scenario "Third distinct reporter triggers
  // auto-hide" (tasks.md 8.3).
  it("hides the listing when the third distinct reporter arrives", async () => {
    const deps = dependencies(REPORTER, ACTIVE_LISTING, 3);

    const result = await reportListing({ listingId: "listing-1" }, deps);

    expect(deps.statusChanges).toEqual([{ listingId: "listing-1", status: "hidden" }]);
    expect(result).toEqual({ autoHidden: true });
  });

  // DEVIATION recorded in tasks.md 8.4: reporting an already-hidden listing
  // is recorded but is a status no-op — there is no "more hidden".
  it("records a report on an already-hidden listing without changing its status", async () => {
    const hidden: ModeratedListing = { ...ACTIVE_LISTING, status: "hidden" };
    const deps = dependencies(REPORTER, hidden, 5);

    const result = await reportListing({ listingId: "listing-1" }, deps);

    expect(deps.written).toHaveLength(1);
    expect(deps.statusChanges).toHaveLength(0);
    expect(result).toEqual({ autoHidden: false });
  });

  // Reports must not resurrect a listing: an expired listing that reaches
  // the threshold must stay `expired`, never become `hidden`, or it would
  // escape `markExpired`'s `WHERE status = 'active'` clause forever.
  it("records a report on an expired listing without hiding it", async () => {
    const expired: ModeratedListing = { ...ACTIVE_LISTING, status: "expired" };
    const deps = dependencies(REPORTER, expired, 3);

    const result = await reportListing({ listingId: "listing-1" }, deps);

    expect(deps.written).toHaveLength(1);
    expect(deps.statusChanges).toHaveLength(0);
    expect(result).toEqual({ autoHidden: false });
  });

  // DEVIATION recorded in tasks.md 8.4: self-reporting is allowed. The spec
  // names no exemption for the publisher, and the threshold is 3 DISTINCT
  // accounts — a publisher reporting their own listing spends one of the
  // three seats it takes to hide it, and gains nothing an attacker could not
  // already get by creating a second real account.
  it("allows the publisher to report their own listing", async () => {
    const own: NewListingReport = {
      listingId: "listing-1",
      reporterId: REPORTER.userId,
      reportedAt: new Date("2026-03-01T10:00:00.000Z"),
    };
    const deps = dependencies(REPORTER, ACTIVE_LISTING, 1);

    await reportListing({ listingId: "listing-1" }, deps);

    expect(deps.written).toEqual([own]);
  });
});

/**
 * **El reloj por defecto, que es el único que corre en producción.**
 *
 * `reportListing` resuelve `dependencies.now ?? (() => new Date())`, y hasta
 * acá ningún test ejecutaba esa segunda mitad: todos inyectan su propio
 * reloj, que es lo correcto para que las fechas sean afirmables. El costo era
 * que la rama que sí corre —la ruta nunca inyecta un reloj— no la miraba
 * nadie: cambiarla por `new Date(0)` no habría puesto una sola prueba en
 * rojo, y cada reporte se habría guardado con fecha de 1970.
 *
 * Mismo procedimiento que `renew-listing.test.ts`: no se afirma un instante,
 * que sería irrepetible, sino que la fecha cae dentro de una ventana que
 * cualquier máquina cumple.
 */
describe("el reloj por defecto", () => {
  it("sella el reporte con la hora real cuando nadie inyecta un reloj", async () => {
    const listings = recordingListings(ACTIVE_LISTING);
    const reports = recordingReports(1);
    const sessionPort: SessionPort = { getSession: vi.fn().mockResolvedValue(REPORTER) };

    const antes = Date.now();
    await reportListing(
      { listingId: "listing-1" },
      { sessionPort, listings: listings.port, reports: reports.port },
    );
    const despues = Date.now();

    expect(reports.written).toHaveLength(1);
    const sellado = reports.written[0]?.reportedAt.getTime() ?? 0;
    expect(sellado).toBeGreaterThanOrEqual(antes);
    expect(sellado).toBeLessThanOrEqual(despues);
  });
});
