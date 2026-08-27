import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * Los tres dobles que hacen falta para correr la **acción de servidor** de
 * `/alquiler/…/reportar` contra este Postgres, y ni uno más.
 *
 * - `redirect` de Next **tira**, igual que el de verdad: es cómo la acción
 *   corta la ejecución, y un doble que volviera normalmente dejaría seguir.
 * - `db` es un proxy perezoso porque la fábrica de `vi.mock` corre al importar
 *   el módulo, o sea ANTES de que el cuerpo de este archivo construya el pool.
 *   El proxy difiere todo al momento de la llamada y ata cada método a la
 *   instancia real, que es lo que Drizzle necesita para su `this`. El cliente
 *   de producción habla HTTP contra Neon y no puede apuntar a un Postgres
 *   local, así que doblarlo no es un atajo: es la única forma.
 * - la sesión, para poder mandar el mismo formulario desde tres cuentas.
 *
 * `reportListing`, `resolveReportOutcome`, `safeReturnPath`, los adaptadores de
 * Drizzle y el esquema son todos los de verdad.
 */
const { RedirectSignal, redirect, sesion, conexion, dbProxy } = vi.hoisted(() => {
  class RedirectSignal extends Error {
    readonly url: string;
    constructor(url: string) {
      super(`NEXT_REDIRECT:${url}`);
      this.name = "RedirectSignal";
      this.url = url;
    }
  }

  const sesion: { actual: string | null } = { actual: null };
  const conexion: { real: Record<string | symbol, unknown> | null } = { real: null };
  const dbProxy = new Proxy({} as Record<string | symbol, unknown>, {
    get(_target, prop) {
      const real = conexion.real;
      if (!real) throw new Error("la base del test todavía no se conectó");
      const value = real[prop];
      return typeof value === "function" ? value.bind(real) : value;
    },
  });

  return {
    RedirectSignal,
    redirect: (url: string): never => {
      throw new RedirectSignal(url);
    },
    sesion,
    conexion,
    dbProxy,
  };
});

vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/shared/db/client", () => ({ db: dbProxy }));
vi.mock("@/modules/identity/infrastructure/session-port", () => ({
  nextAuthSessionPort: {
    getSession: async () =>
      sesion.actual ? { userId: sesion.actual, email: null, name: null } : null,
  },
}));

import { reportarAviso } from "../../app/alquiler/[ciudad]/[zona]/[slug]/reportar/actions";
import type { SessionPort } from "../../src/modules/identity/application/ports/session.port";
import { reportListing } from "../../src/modules/listing-trust/application/report-listing";
import {
  DrizzleListingModeration,
  DrizzleListingReports,
} from "../../src/modules/listing-trust/infrastructure/drizzle-listing-moderation";
import type { TrustDatabase } from "../../src/modules/listing-trust/infrastructure/drizzle-photo-hash";
import * as schema from "../../src/shared/db/schema";

/**
 * listing-trust spec, Requirements: Authenticated Reporting, Auto-Hide
 * After Three Distinct Reports (tasks.md 8.2–8.4).
 *
 * Two things only Postgres can answer, and why they are here and not in
 * report-listing.test.ts (which already covers the use case's own logic
 * against recording fakes):
 *
 * 1. `listing_report_listing_reporter_unique` is what makes a repeat report
 *    from the same account collide instead of insert — the distinct-account
 *    count is a database guarantee, not application code, and a fake port
 *    would only prove the fake was written correctly.
 * 2. The status transition this feature writes (`active → hidden`) actually
 *    persists and is read back correctly through Drizzle's real driver.
 */

function getTestDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      "TEST_DATABASE_URL is not set. Start the disposable database with " +
        "`pnpm db:test:up && pnpm db:test:migrate`.",
    );
  }
  return url;
}

const pool = new Pool({ connectionString: getTestDatabaseUrl() });
const db = drizzle(pool, { schema }) as unknown as TrustDatabase;
// Desde acá el proxy del cliente doblado tiene a quién delegarle: la acción de
// servidor escribe en ESTA base y no en ninguna otra.
conexion.real = db as unknown as Record<string | symbol, unknown>;

const listings = new DrizzleListingModeration(db);
const reports = new DrizzleListingReports(db);

const CITY = randomUUID();
const ZONE = randomUUID();
const PUBLISHER = randomUUID();
const REPORTER_A = randomUUID();
const REPORTER_B = randomUUID();
const REPORTER_C = randomUUID();

function sessionOf(userId: string): SessionPort {
  return { getSession: async () => ({ userId, email: null, name: null }) };
}

async function insertListing(id: string, status: string, expiresAt: Date): Promise<void> {
  await pool.query(
    `INSERT INTO "listing"
       (id, publisher_id, publisher_type, property_type, city_id, zone_id, title, description,
        price_usd, rooms, area_m2, bathrooms, parking_spots,
        has_power_plant, has_regular_water, is_furnished, has_security, has_appliances,
        contact_method, contact_value, status, published_at, expires_at)
     VALUES ($1,$2,'owner','apartamento',$3,$4,'Apartamento reportable','Descripción larga.',
             450,2,78,1,0, false,false,false,false,false,
             'email','sin-contacto',$5, now() - interval '30 days', $6)`,
    [id, PUBLISHER, CITY, ZONE, status, expiresAt],
  );
}

async function readListingStatus(id: string): Promise<string | undefined> {
  const { rows } = await pool.query('SELECT status FROM "listing" WHERE id = $1', [id]);
  return rows[0]?.status;
}

async function countReportRows(listingId: string): Promise<number> {
  const { rows } = await pool.query(
    'SELECT count(*)::int AS n FROM "listing_report" WHERE listing_id = $1',
    [listingId],
  );
  return rows[0].n;
}

beforeAll(async () => {
  await pool.query('INSERT INTO "city" (id, name) VALUES ($1,$2)', [CITY, `Ciudad ${CITY}`]);
  await pool.query(
    `INSERT INTO "zone" (id, city_id, name, kind, source) VALUES ($1,$2,$3,'parroquia','INE')`,
    [ZONE, CITY, `Zona ${ZONE}`],
  );
  const seedUsers: ReadonlyArray<readonly [string, string]> = [
    [PUBLISHER, "Publicador"],
    [REPORTER_A, "Ana"],
    [REPORTER_B, "Bruno"],
    [REPORTER_C, "Carla"],
  ];
  for (const [id, name] of seedUsers) {
    await pool.query('INSERT INTO "user" (id, name, email) VALUES ($1,$2,$3)', [
      id,
      name,
      `${name.toLowerCase()}-${id}@example.com`,
    ]);
  }
});

afterAll(async () => {
  // Same discipline as tests/integration/contact-reveal.test.ts: the shared
  // test database persists across files within one run, and
  // seed.test.ts's own cleanup does an unconditional `DELETE FROM
  // "listing"`. `listing_report` is `ON DELETE restrict` on purpose
  // (evidence, not a disposable row) — this suite is exactly what would
  // otherwise leave rows behind that turn that DELETE into a foreign-key
  // violation for a completely different test file.
  await pool.query(
    `DELETE FROM "listing_report" WHERE listing_id = ANY(
    SELECT id FROM "listing" WHERE city_id = $1
  )`,
    [CITY],
  );
  await pool.query(`DELETE FROM "listing" WHERE city_id = $1`, [CITY]);
  await pool.query(`DELETE FROM "user" WHERE id = ANY($1)`, [
    [PUBLISHER, REPORTER_A, REPORTER_B, REPORTER_C],
  ]);
  await pool.query(`DELETE FROM "zone" WHERE city_id = $1`, [CITY]);
  await pool.query(`DELETE FROM "city" WHERE id = $1`, [CITY]);
  await pool.end();
});

describe("reportListing — el conteo distinto es la restricción, no un `if`", () => {
  const listingId = randomUUID();
  const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  beforeAll(async () => {
    await insertListing(listingId, "active", future);
  });

  it("repeat reports from the same account leave exactly one row and no hide", async () => {
    await reportListing({ listingId }, { sessionPort: sessionOf(REPORTER_A), listings, reports });
    await reportListing({ listingId }, { sessionPort: sessionOf(REPORTER_A), listings, reports });

    expect(await countReportRows(listingId)).toBe(1);
    expect(await readListingStatus(listingId)).toBe("active");
  });

  it("a second distinct account still does not reach the threshold", async () => {
    const result = await reportListing(
      { listingId },
      { sessionPort: sessionOf(REPORTER_B), listings, reports },
    );

    expect(result.autoHidden).toBe(false);
    expect(await countReportRows(listingId)).toBe(2);
    expect(await readListingStatus(listingId)).toBe("active");
  });

  // listing-trust spec, Scenario "Third distinct reporter triggers
  // auto-hide" — proven against the real constraint and the real UPDATE.
  it("the third distinct account auto-hides the listing", async () => {
    const result = await reportListing(
      { listingId },
      { sessionPort: sessionOf(REPORTER_C), listings, reports },
    );

    expect(result.autoHidden).toBe(true);
    expect(await countReportRows(listingId)).toBe(3);
    expect(await readListingStatus(listingId)).toBe("hidden");
  });
});

describe("reportListing — un aviso vencido no se puede esconder por reportes", () => {
  const listingId = randomUUID();
  const past = new Date(Date.now() - 24 * 60 * 60 * 1000);

  beforeAll(async () => {
    await insertListing(listingId, "expired", past);
    for (const reporter of [REPORTER_A, REPORTER_B, REPORTER_C]) {
      await reportListing({ listingId }, { sessionPort: sessionOf(reporter), listings, reports });
    }
  });

  // Reports must not resurrect a listing, and must not let it escape the
  // expiry sweep either: staying `expired` (not `hidden`) is what keeps it
  // reachable by `markExpired`'s own `WHERE status = 'active'` semantics —
  // it is already out, and stays out, through its own status.
  it("stays expired at the threshold, never becomes hidden", async () => {
    expect(await countReportRows(listingId)).toBe(3);
    expect(await readListingStatus(listingId)).toBe("expired");
  });
});

/**
 * **El umbral, disparado por la puerta de verdad** (tasks.md 8.7).
 *
 * Todo lo de arriba llama a `reportListing` directamente, que es lo correcto
 * para probar el caso de uso — y es exactamente por eso que **el defecto de la
 * 8.7 sobrevivió a esta suite**: el caso de uso estaba probado contra Postgres
 * real, y ninguna ruta lo llamaba. Un navegador no podía reportar nada.
 *
 * Esto entra por `reportarAviso`, la acción de servidor que el formulario de
 * `/alquiler/…/reportar` invoca, y llega hasta el `UPDATE` real. Si mañana
 * alguien borra el formulario o desconecta la acción, este archivo se pone
 * rojo; el de arriba no.
 */
describe("reportar desde la pantalla — la cadena entera contra Postgres", () => {
  const listingId = randomUUID();
  const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const FICHA = `/alquiler/caracas/chacao/apartamento-reportable-${listingId}`;
  const ACUSE = `${FICHA}/reportar?enviado`;

  function formulario(): FormData {
    const data = new FormData();
    data.set("listingId", listingId);
    data.set("listingPath", FICHA);
    return data;
  }

  /** El destino con el que la acción terminó, sacado de la señal que tiró. */
  async function enviar(userId: string | null): Promise<string> {
    sesion.actual = userId;
    const error = await reportarAviso(formulario()).then(
      () => null,
      (thrown: unknown) => thrown,
    );
    if (!(error instanceof RedirectSignal)) {
      throw new Error(`la acción no redirigió: ${String(error)}`);
    }
    return error.url;
  }

  beforeAll(async () => {
    await insertListing(listingId, "active", future);
  });

  it("un visitante sin sesión no reporta nada y va a entrar", async () => {
    expect(await enviar(null)).toBe(
      `/signin?callbackUrl=${encodeURIComponent(`${FICHA}/reportar`)}`,
    );

    expect(await countReportRows(listingId)).toBe(0);
    expect(await readListingStatus(listingId)).toBe("active");
  });

  it("el primer reportante deja una fila y el aviso sigue activo", async () => {
    expect(await enviar(REPORTER_A)).toBe(ACUSE);

    expect(await countReportRows(listingId)).toBe(1);
    expect(await readListingStatus(listingId)).toBe("active");
  });

  it("la misma cuenta insistiendo no suma una segunda fila", async () => {
    expect(await enviar(REPORTER_A)).toBe(ACUSE);

    expect(await countReportRows(listingId)).toBe(1);
    expect(await readListingStatus(listingId)).toBe("active");
  });

  it("la segunda cuenta distinta todavía no alcanza el umbral", async () => {
    expect(await enviar(REPORTER_B)).toBe(ACUSE);

    expect(await countReportRows(listingId)).toBe(2);
    expect(await readListingStatus(listingId)).toBe("active");
  });

  /**
   * **Lo que el producto no podía hacer hasta esta tarea.** El aviso pasa a
   * `hidden` por el camino que recorre una persona con un navegador, y no por
   * un `UPDATE` a mano ni por una llamada directa al caso de uso.
   */
  it("la tercera cuenta distinta oculta el aviso, y el acuse no lo dice", async () => {
    const destino = await enviar(REPORTER_C);

    expect(await readListingStatus(listingId)).toBe("hidden");
    expect(await countReportRows(listingId)).toBe(3);
    // El mismo destino que las dos veces que NO ocultaron nada: quien reporta
    // no aprende cuántas cuentas faltaban.
    expect(destino).toBe(ACUSE);
  });
});
