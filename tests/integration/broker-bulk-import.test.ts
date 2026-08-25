import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  authorizeBulkImport,
  BulkImportDisabledError,
} from "../../src/modules/broker-bulk-import/application/authorize-bulk-import";
import type { BulkImportAccountDatabase } from "../../src/modules/broker-bulk-import/infrastructure/drizzle-bulk-import-account";
import { DrizzleBulkImportAccounts } from "../../src/modules/broker-bulk-import/infrastructure/drizzle-bulk-import-account";
import type {
  AuthenticatedSession,
  SessionPort,
} from "../../src/modules/identity/application/ports/session.port";
import * as schema from "../../src/shared/db/schema";

/**
 * broker-bulk-import spec, Requirement: Operator-Granted Access (tasks.md
 * 9.1-9.3, design.md Security Boundaries "Bulk import access": "Enabled-
 * flag-less account POSTing directly returns 403 and creates no draft").
 *
 * What only Postgres can answer, and why it is here and not only in
 * authorize-bulk-import.test.ts (which already covers the decision itself
 * against a recording fake): that `user.bulk_import_enabled` really is
 * NOT NULL with a `false` default, that `DrizzleBulkImportAccounts` reads
 * it back correctly through Drizzle's real driver, and that the two other
 * schema guarantees this slice adds — `listing.status` accepting `draft`
 * and the `(publisher_id, external_reference)` unique index — hold against
 * a real database and not only against the TypeScript type checker.
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
const db = drizzle(pool, { schema }) as unknown as BulkImportAccountDatabase;
const accounts = new DrizzleBulkImportAccounts(db);

function sessionFor(userId: string): SessionPort {
  const session: AuthenticatedSession = { userId, email: null, name: null };
  return { getSession: async () => session };
}

async function insertUser(id: string, bulkImportEnabled?: boolean): Promise<void> {
  if (bulkImportEnabled === undefined) {
    // Omits the column entirely on purpose in one of the two seeded users
    // (see the "no default de servidor" test below) — proves the DEFAULT
    // false is what the database enforces, not something the application
    // has to remember to pass.
    await pool.query('INSERT INTO "user" (id, name, email) VALUES ($1,$2,$3)', [
      id,
      "Broker",
      `broker-${id}@example.com`,
    ]);
    return;
  }
  await pool.query(
    'INSERT INTO "user" (id, name, email, bulk_import_enabled) VALUES ($1,$2,$3,$4)',
    [id, "Broker", `broker-${id}@example.com`, bulkImportEnabled],
  );
}

const USER_IDS: string[] = [];

afterAll(async () => {
  if (USER_IDS.length > 0) {
    await pool.query('DELETE FROM "user" WHERE id = ANY($1)', [USER_IDS]);
  }
  await pool.end();
});

describe("authorizeBulkImport + DrizzleBulkImportAccounts — la bandera contra Postgres real", () => {
  it("una cuenta sin la bandera (el DEFAULT del servidor) es rechazada", async () => {
    const userId = randomUUID();
    USER_IDS.push(userId);
    await insertUser(userId); // no bulk_import_enabled column supplied — DEFAULT false applies

    await expect(
      authorizeBulkImport({ sessionPort: sessionFor(userId), accounts }),
    ).rejects.toBeInstanceOf(BulkImportDisabledError);
  });

  it("una cuenta con la bandera explícitamente en false es rechazada", async () => {
    const userId = randomUUID();
    USER_IDS.push(userId);
    await insertUser(userId, false);

    await expect(
      authorizeBulkImport({ sessionPort: sessionFor(userId), accounts }),
    ).rejects.toBeInstanceOf(BulkImportDisabledError);
  });

  it("una cuenta con la bandera en true es autorizada", async () => {
    const userId = randomUUID();
    USER_IDS.push(userId);
    await insertUser(userId, true);

    await expect(
      authorizeBulkImport({ sessionPort: sessionFor(userId), accounts }),
    ).resolves.toEqual({ userId });
  });

  // El otro lado de "creates no draft" (design.md Security Boundaries): no
  // hay ningún camino en este slice que escriba en `listing`, así que la
  // prueba real disponible hoy es que la tabla queda exactamente como
  // estaba después de un rechazo — nada la tocó.
  it("un rechazo no cambia cuántos avisos existen", async () => {
    const userId = randomUUID();
    USER_IDS.push(userId);
    await insertUser(userId, false);

    const before = await pool.query('SELECT count(*)::int AS n FROM "listing"');

    await expect(
      authorizeBulkImport({ sessionPort: sessionFor(userId), accounts }),
    ).rejects.toBeInstanceOf(BulkImportDisabledError);

    const after = await pool.query('SELECT count(*)::int AS n FROM "listing"');
    expect(after.rows[0].n).toBe(before.rows[0].n);
  });
});

describe("schema.ts — las tres garantías del task 9.1 contra Postgres real", () => {
  const CITY = randomUUID();
  const ZONE = randomUUID();
  const PUBLISHER = randomUUID();

  beforeAll(async () => {
    await pool.query('INSERT INTO "city" (id, name) VALUES ($1,$2)', [CITY, `Ciudad ${CITY}`]);
    await pool.query(
      `INSERT INTO "zone" (id, city_id, name, kind, source) VALUES ($1,$2,$3,'parroquia','INE')`,
      [ZONE, CITY, `Zona ${ZONE}`],
    );
    await pool.query('INSERT INTO "user" (id, name, email) VALUES ($1,$2,$3)', [
      PUBLISHER,
      "Publicador",
      `publicador-${PUBLISHER}@example.com`,
    ]);
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM "listing" WHERE city_id = $1`, [CITY]);
    await pool.query(`DELETE FROM "user" WHERE id = $1`, [PUBLISHER]);
    await pool.query(`DELETE FROM "zone" WHERE city_id = $1`, [CITY]);
    await pool.query(`DELETE FROM "city" WHERE id = $1`, [CITY]);
  });

  async function insertListing(
    id: string,
    status: string,
    externalReference: string | null,
  ): Promise<void> {
    await pool.query(
      `INSERT INTO "listing"
         (id, publisher_id, publisher_type, property_type, city_id, zone_id, title, description,
          price_usd, rooms, area_m2, bathrooms, parking_spots,
          has_power_plant, has_regular_water, is_furnished, has_security, has_appliances,
          contact_method, contact_value, status, external_reference, published_at, expires_at)
       VALUES ($1,$2,'broker','apartamento',$3,$4,'Aviso importado','Descripción larga de sobra.',
               450,2,78,1,0, false,false,false,false,false,
               'email','sin-contacto',$5,$6, now(), now() + interval '30 days')`,
      [id, PUBLISHER, CITY, ZONE, status, externalReference],
    );
  }

  it("listing.status acepta 'draft'", async () => {
    const id = randomUUID();
    await insertListing(id, "draft", null);

    const { rows } = await pool.query('SELECT status FROM "listing" WHERE id = $1', [id]);
    expect(rows[0]?.status).toBe("draft");
  });

  it("dos avisos del mismo publisher con la misma referencia externa violan la restricción única", async () => {
    const first = randomUUID();
    const second = randomUUID();
    await insertListing(first, "draft", "REF-001");

    await expect(insertListing(second, "draft", "REF-001")).rejects.toMatchObject({
      code: "23505", // unique_violation
    });
  });

  // El otro lado de la restricción: NULL nunca choca contra NULL, así que la
  // publicación de a uno (que nunca setea external_reference) sigue
  // coexistiendo sin límite para el mismo publisher.
  it("dos avisos del mismo publisher sin referencia externa (NULL) no chocan", async () => {
    const first = randomUUID();
    const second = randomUUID();
    await insertListing(first, "active", null);

    await expect(insertListing(second, "active", null)).resolves.toBeUndefined();
  });
});
