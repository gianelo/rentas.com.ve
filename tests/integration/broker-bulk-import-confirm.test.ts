import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { confirmImport } from "../../src/modules/broker-bulk-import/application/confirm-import";
import type { ImportFileSourcePort } from "../../src/modules/broker-bulk-import/application/ports/import-file-source.port";
import { ImportMissingAccountContactError } from "../../src/modules/broker-bulk-import/application/run-import-validation";
import { DrizzleBulkImportAccounts } from "../../src/modules/broker-bulk-import/infrastructure/drizzle-bulk-import-account";
import { DrizzleImportAccountContact } from "../../src/modules/broker-bulk-import/infrastructure/drizzle-import-account-contact";
import type {
  AuthenticatedSession,
  SessionPort,
} from "../../src/modules/identity/application/ports/session.port";
import {
  DrizzleListingRepository,
  DrizzleZoneCatalogue,
  type PublicationDatabase,
} from "../../src/modules/listing-publication/infrastructure/drizzle-listing-repository";
import * as schema from "../../src/shared/db/schema";

/**
 * broker-bulk-import spec, "Idempotent Import by External Reference" +
 * "Whole-File Validation Before Any Write" (tasks.md 9.16/9.17). design.md:
 * "its idempotency guarantee is a unique index, not application code, so a
 * fake would verify the fake." Everything `confirmImport` decides on its
 * own (which rows to write, how it counts them) is already proven against
 * fakes in `confirm-import.test.ts` — what only Postgres can prove is that
 * the SECOND insert of the same `(publisher_id, external_reference)` really
 * is refused by the constraint, with `confirmImport` catching it rather
 * than crashing.
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
const db = drizzle(pool, { schema }) as unknown as PublicationDatabase;

const listings = new DrizzleListingRepository(db);
const zones = new DrizzleZoneCatalogue(db);
const accounts = new DrizzleBulkImportAccounts(db);
const contact = new DrizzleImportAccountContact(db);

const CITY = randomUUID();
const ZONE = randomUUID();

const VALID_DESCRIPTION =
  "Apartamento en piso alto con vista abierta, cocina equipada con linea blanca, " +
  "planta electrica del edificio, vigilancia 24 horas y agua regular por tanque propio.";

function sessionFor(userId: string): SessionPort {
  const session: AuthenticatedSession = { userId, email: null, name: null };
  return { getSession: async () => session };
}

function sourceFromText(text: string): ImportFileSourcePort {
  const bytes = new TextEncoder().encode(text);
  return {
    declaredByteLength: bytes.byteLength,
    async *chunks() {
      yield bytes;
    },
  };
}

const REQUIRED_HEADER =
  "referencia_externa,titulo,descripcion,precio_usd,ciudad,zona,tipo_inmueble,habitaciones,banos,metros2";

function rowLine(externalReference: string): string {
  return `${externalReference},Titulo del aviso,"${VALID_DESCRIPTION}",450,${CITY},${ZONE},apartamento,2,2,78`;
}

async function insertUser(
  id: string,
  options: { bulkImportEnabled: boolean; contactMethod?: string; contactValue?: string },
): Promise<void> {
  await pool.query(
    `INSERT INTO "user" (id, name, email, bulk_import_enabled, contact_method, contact_value)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [
      id,
      "Broker",
      `broker-${id}@example.com`,
      options.bulkImportEnabled,
      options.contactMethod ?? null,
      options.contactValue ?? null,
    ],
  );
}

const USER_IDS: string[] = [];

beforeAll(async () => {
  await pool.query(`INSERT INTO "city" (id, name) VALUES ($1,$2)`, [CITY, `Ciudad ${CITY}`]);
  await pool.query(
    `INSERT INTO "zone" (id, city_id, name, kind, source) VALUES ($1,$2,$3,'parroquia','INE')`,
    [ZONE, CITY, `Zona ${ZONE}`],
  );
});

afterAll(async () => {
  if (USER_IDS.length > 0) {
    await pool.query(`DELETE FROM "user" WHERE id = ANY($1)`, [USER_IDS]);
  }
  await pool.query(`DELETE FROM "zone" WHERE city_id = $1`, [CITY]);
  await pool.query(`DELETE FROM "city" WHERE id = $1`, [CITY]);
  await pool.end();
});

describe("confirmImport — against real Postgres", () => {
  it("creates a draft with zero photos and the external reference set", async () => {
    const userId = randomUUID();
    USER_IDS.push(userId);
    await insertUser(userId, {
      bulkImportEnabled: true,
      contactMethod: "whatsapp",
      contactValue: "04121234567",
    });

    const result = await confirmImport(
      sourceFromText(`${REQUIRED_HEADER}\n${rowLine("PG-REF-1")}`),
      { sessionPort: sessionFor(userId), accounts, contact, zones, listings },
    );

    expect(result.createdCount).toBe(1);

    const rows = await pool.query(
      `SELECT status, external_reference, publisher_type FROM "listing"
        WHERE publisher_id = $1 AND external_reference = $2`,
      [userId, "PG-REF-1"],
    );
    expect(rows.rows[0]).toMatchObject({
      status: "draft",
      external_reference: "PG-REF-1",
      publisher_type: "broker",
    });

    const photoCount = await pool.query(
      `SELECT count(*)::int AS n FROM "listing_photo" p
        JOIN "listing" l ON l.id = p.listing_id
       WHERE l.publisher_id = $1 AND l.external_reference = $2`,
      [userId, "PG-REF-1"],
    );
    expect(photoCount.rows[0]?.n).toBe(0);
  });

  // tasks.md 9.16/9.17: "re-uploading an identical file creates no
  // duplicates" — the SAME (publisher_id, external_reference) pair is
  // refused by the unique index Postgres actually enforces, and
  // `confirmImport` catches the 23505 rather than crashing.
  it("creates no additional draft when the SAME external reference is confirmed again", async () => {
    const userId = randomUUID();
    USER_IDS.push(userId);
    await insertUser(userId, {
      bulkImportEnabled: true,
      contactMethod: "whatsapp",
      contactValue: "04121234567",
    });

    const source = () => sourceFromText(`${REQUIRED_HEADER}\n${rowLine("PG-DUP-1")}`);

    const first = await confirmImport(source(), {
      sessionPort: sessionFor(userId),
      accounts,
      contact,
      zones,
      listings,
    });
    expect(first.createdCount).toBe(1);
    expect(first.skippedDuplicates).toEqual([]);

    const second = await confirmImport(source(), {
      sessionPort: sessionFor(userId),
      accounts,
      contact,
      zones,
      listings,
    });

    expect(second.createdCount).toBe(0);
    expect(second.skippedDuplicates).toEqual([{ rowNumber: 2, externalReference: "PG-DUP-1" }]);

    const count = await pool.query(
      `SELECT count(*)::int AS n FROM "listing" WHERE publisher_id = $1 AND external_reference = $2`,
      [userId, "PG-DUP-1"],
    );
    expect(count.rows[0]?.n).toBe(1);
  });

  // tasks.md 9.16: within-file duplicate is rejected without ever reaching
  // the database — proven here by asserting nothing was written, against a
  // real repository rather than a spy.
  it("writes nothing when referencia_externa is duplicated within the same file", async () => {
    const userId = randomUUID();
    USER_IDS.push(userId);
    await insertUser(userId, {
      bulkImportEnabled: true,
      contactMethod: "whatsapp",
      contactValue: "04121234567",
    });

    const text = `${REQUIRED_HEADER}\n${rowLine("PG-INFILE-DUP")}\n${rowLine("PG-INFILE-DUP")}`;

    const result = await confirmImport(sourceFromText(text), {
      sessionPort: sessionFor(userId),
      accounts,
      contact,
      zones,
      listings,
    });

    expect(result.createdCount).toBe(0);
    expect(result.errors).toHaveLength(2);

    const count = await pool.query(
      `SELECT count(*)::int AS n FROM "listing" WHERE publisher_id = $1 AND external_reference = $2`,
      [userId, "PG-INFILE-DUP"],
    );
    expect(count.rows[0]?.n).toBe(0);
  });

  // The guard from the orchestrator's prompt: an account with no default
  // contact cannot produce a single valid draft, so the whole import is
  // refused up front rather than creating drafts nobody can activate.
  it("refuses the whole import when the account has no default contact configured", async () => {
    const userId = randomUUID();
    USER_IDS.push(userId);
    await insertUser(userId, { bulkImportEnabled: true }); // no contact columns set

    await expect(
      confirmImport(sourceFromText(`${REQUIRED_HEADER}\n${rowLine("PG-NO-CONTACT")}`), {
        sessionPort: sessionFor(userId),
        accounts,
        contact,
        zones,
        listings,
      }),
    ).rejects.toBeInstanceOf(ImportMissingAccountContactError);

    const count = await pool.query(
      `SELECT count(*)::int AS n FROM "listing" WHERE publisher_id = $1`,
      [userId],
    );
    expect(count.rows[0]?.n).toBe(0);
  });
});
