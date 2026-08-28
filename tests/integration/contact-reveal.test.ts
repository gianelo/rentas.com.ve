import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type ContactRevealDatabase,
  DrizzleContactRevealEvents,
  DrizzleContactRevealMetrics,
  DrizzleRevealableListing,
} from "../../src/modules/contact-reveal/infrastructure/drizzle-contact-reveal";
import * as schema from "../../src/shared/db/schema";

/**
 * Task 6.6 — the north-star metric against real Postgres.
 *
 * This is the one assertion no in-memory fake can make. D6 splits the metric
 * across a table and a view: the table keeps every reveal action, the view
 * collapses them to unique `(tenant, listing)` pairs. Both halves are SQL,
 * and if `DISTINCT ON` or the window `count(*)` is wrong the product reports
 * a confident wrong number to its own go/pivot decision six months from now —
 * the single most expensive way this codebase can be wrong.
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
const db = drizzle(pool, { schema }) as unknown as ContactRevealDatabase;
const events = new DrizzleContactRevealEvents(db);
const metrics = new DrizzleContactRevealMetrics(db);
const revealable = new DrizzleRevealableListing(db);

const CITY = randomUUID();
const ZONE = randomUUID();
const PUBLISHER = randomUUID();
const ANA = randomUUID();
const BRUNO = randomUUID();
const LISTING = randomUUID();
const OTHER_LISTING = randomUUID();
const EXPIRED_LISTING = randomUUID();
const HIDDEN_LISTING = randomUUID();
/**
 * task 21.1. El rótulo todavía dice `active` porque el trabajo diario que lo
 * mueve no ha corrido; la fecha ya pasó. Es la misma fila que la búsqueda
 * dejó de ofrecer, vista una capa más abajo.
 */
const CLOCK_EXPIRED_LISTING = randomUUID();

/** Ana reveals the same listing three times, a week apart. */
const REVEALS = [
  new Date("2026-03-01T10:00:00.000Z"),
  new Date("2026-03-08T10:00:00.000Z"),
  new Date("2026-03-15T10:00:00.000Z"),
];

const THIRTY_DAYS_IN_MINUTES = 30 * 24 * 60;

/**
 * `expiresInMinutes` se cuenta desde el `now()` de Postgres y no es una fecha
 * escrita a mano: un literal cambia de significado solo cuando el calendario
 * lo pasa, y la prueba se queda verde midiendo otra cosa. Negativo = vencido.
 */
async function insertListing(
  id: string,
  status = "active",
  expiresInMinutes = THIRTY_DAYS_IN_MINUTES,
) {
  await pool.query(
    `INSERT INTO "listing" (id, publisher_id, publisher_type, property_type, city_id, zone_id, title,
       description, price_usd, rooms, area_m2, bathrooms, contact_method, contact_value, status, published_at, expires_at)
     VALUES ($1,$2,'owner','apartamento',$3,$4,'Título','x',450,2,78,2,'whatsapp','04121234567',$5,now(),now() + make_interval(mins => $6::int))`,
    [id, PUBLISHER, CITY, ZONE, status, expiresInMinutes],
  );
}

beforeAll(async () => {
  await pool.query(`INSERT INTO "city" (id, name) VALUES ($1,$2)`, [CITY, `Ciudad ${CITY}`]);
  await pool.query(
    `INSERT INTO "zone" (id, city_id, name, kind, source) VALUES ($1,$2,$3,'parroquia','INE')`,
    [ZONE, CITY, "Zona"],
  );
  for (const id of [PUBLISHER, ANA, BRUNO]) {
    await pool.query(`INSERT INTO "user" (id, email) VALUES ($1,$2)`, [id, `${id}@ej.com`]);
  }
  await insertListing(LISTING);
  await insertListing(OTHER_LISTING);
  await insertListing(EXPIRED_LISTING, "expired");
  await insertListing(HIDDEN_LISTING, "hidden");
  await insertListing(CLOCK_EXPIRED_LISTING, "active", -60);

  for (const revealedAt of REVEALS) {
    await events.record({
      listingId: LISTING,
      publisherId: PUBLISHER,
      tenantUserId: ANA,
      cityId: CITY,
      revealedAt,
      message: "Hola, me interesa.",
    });
  }

  // A second tenant on the same listing, and Ana on a second listing: without
  // these, a view that returned "one row, always" would pass every assertion
  // below for the wrong reason.
  await events.record({
    listingId: LISTING,
    publisherId: PUBLISHER,
    tenantUserId: BRUNO,
    cityId: CITY,
    revealedAt: new Date("2026-03-02T10:00:00.000Z"),
    message: "Hola, me interesa.",
  });
  await events.record({
    listingId: OTHER_LISTING,
    publisherId: PUBLISHER,
    tenantUserId: ANA,
    cityId: CITY,
    revealedAt: new Date("2026-03-03T10:00:00.000Z"),
    message: "Hola, me interesa.",
  });
});

afterAll(async () => {
  await pool.query(`DELETE FROM "contact_reveal_event" WHERE city_id = $1`, [CITY]);
  await pool.query(`DELETE FROM "listing" WHERE city_id = $1`, [CITY]);
  await pool.query(`DELETE FROM "user" WHERE id = ANY($1)`, [[PUBLISHER, ANA, BRUNO]]);
  await pool.query(`DELETE FROM "zone" WHERE city_id = $1`, [CITY]);
  await pool.query(`DELETE FROM "city" WHERE id = $1`, [CITY]);
  await pool.end();
});

describe("contact_reveal_event", () => {
  // contact-reveal spec, "Repeated reveals by the same tenant still count".
  // The raw log is the source of truth both figures come from; if the insert
  // ever became an upsert, the action count would be silently unrecoverable.
  it("keeps every reveal action, including the repeats", async () => {
    const { rows } = await pool.query<{ count: string }>(
      `SELECT count(*)::int AS count FROM "contact_reveal_event"
       WHERE tenant_user_id = $1 AND listing_id = $2`,
      [ANA, LISTING],
    );

    expect(Number(rows[0]?.count)).toBe(REVEALS.length);
  });
});

describe("DrizzleRevealableListing", () => {
  it("entrega el método y el valor de un aviso activo", async () => {
    const listing = await revealable.findRevealable(LISTING);

    expect(listing).toEqual({
      listingId: LISTING,
      publisherId: PUBLISHER,
      cityId: CITY,
      contactMethod: "whatsapp",
      contactValue: "04121234567",
    });
  });

  /**
   * **La garantía es que el valor NO SALE DE POSTGRES, y sólo se puede probar
   * acá.** El filtro vive en el `WHERE`, así que un aviso vencido u oculto no
   * devuelve fila: no hay nada que un render, un log de consulta o un payload
   * de componente de servidor pueda arrastrar. Filtrado en TypeScript, el
   * número ya viajó — y ninguna prueba con un repositorio falso puede notar la
   * diferencia, porque el falso nunca tuvo el número.
   */
  it.each([
    ["vencido", () => EXPIRED_LISTING],
    ["oculto por moderación", () => HIDDEN_LISTING],
  ])("no devuelve nada de un aviso %s", async (_estado, id) => {
    await expect(revealable.findRevealable(id())).resolves.toBeNull();
  });

  /**
   * **task 21.1 — la misma ventana, una capa más abajo.** Entre que un aviso
   * vence y que el cron diario lo marca hay de 0 a casi 24 horas en las que
   * la fila sigue diciendo `active`. Con la lista ya cerrada, quien llega a
   * la ficha por un enlace de WhatsApp todavía podía gastar uno de sus 40
   * revelados del día en un aviso que ya no está — y el revelado es
   * irreversible: queda escrito en un registro que sólo agrega.
   */
  it("no devuelve nada de un aviso cuya fecha ya pasó, aunque su rótulo siga diciendo active", async () => {
    // La precondición primero: sin esto la aserción de abajo podría estar
    // verde porque la fila quedó `expired`, o porque la fecha nunca pasó.
    const { rows } = await pool.query<{ status: string; vencido: boolean }>(
      `SELECT status, expires_at < now() AS vencido FROM "listing" WHERE id = $1`,
      [CLOCK_EXPIRED_LISTING],
    );
    expect(rows[0]).toEqual({ status: "active", vencido: true });

    await expect(revealable.findRevealable(CLOCK_EXPIRED_LISTING)).resolves.toBeNull();
    // La guarda obligatoria al lado: un puerto que devolviera siempre `null`
    // pasaría la línea de arriba con las dos manos.
    await expect(revealable.findRevealable(LISTING)).resolves.not.toBeNull();
  });

  it("no distingue un aviso dado de baja de uno que nunca existió", async () => {
    // Las dos respuestas son `null`, que es lo que el puerto promete: quien
    // sondea URLs no puede usar la diferencia para inventariar bajas.
    await expect(revealable.findRevealable(randomUUID())).resolves.toBeNull();
  });
});

describe("contact_reveal_unique_pair", () => {
  it("collapses N repeat reveals of one pair into one row counting N", async () => {
    const pairs = await metrics.findUniquePairs({ listingId: LISTING });
    const ana = pairs.filter((pair) => pair.tenantUserId === ANA);

    expect(ana).toHaveLength(1);
    expect(ana[0]?.revealCount).toBe(REVEALS.length);
  });

  it("reports the earliest reveal as first_revealed_at", async () => {
    // Cohort semantics (design.md D6): a pair belongs to the period of its
    // FIRST reveal. Taking the latest instead would move a month-1 tenant
    // into month 3 and make the curve look like growth that never happened.
    const [ana] = await metrics.findUniquePairs({ listingId: LISTING, tenantUserId: ANA });

    expect(ana?.firstRevealedAt).toEqual(REVEALS[0]);
    expect(ana?.publisherId).toBe(PUBLISHER);
    expect(ana?.cityId).toBe(CITY);
  });

  it("counts two tenants on one listing as two pairs", async () => {
    const pairs = await metrics.findUniquePairs({ listingId: LISTING });

    expect(pairs.map((pair) => pair.tenantUserId).sort()).toEqual([ANA, BRUNO].sort());
  });

  it("keeps the same tenant's two listings apart", async () => {
    const pairs = await metrics.findUniquePairs({ cityId: CITY });

    expect(pairs).toHaveLength(3);
    expect(pairs.filter((pair) => pair.tenantUserId === ANA)).toHaveLength(2);
  });

  it("reports more raw actions than pairs once a tenant repeats", async () => {
    // contact-reveal spec, "Both figures are derivable from the same event
    // log". The spec's own wording is `>=`, but this fixture deliberately
    // contains repeats, so here the inequality is STRICT — and it has to be
    // asserted that way: with `>=`, a view that emitted one row per raw event
    // with `reveal_count = 1` passes, because 5 actions >= 5 rows. That exact
    // mutation was run against this file and slipped through until the
    // assertion was tightened.
    const pairs = await metrics.findUniquePairs({ cityId: CITY });
    const actions = pairs.reduce((total, pair) => total + pair.revealCount, 0);

    expect(actions).toBe(REVEALS.length + 2);
    expect(actions).toBeGreaterThan(pairs.length);
  });
});

describe("contact_reveal_event.message — NOT VALID CHECK (tasks.md 6.11)", () => {
  // NOT VALID exempts only rows already present AT THE TIME the constraint
  // was added — never a new insert made afterwards, however "historical" it
  // looks. The only honest way to reproduce a PR #81-era row here is to drop
  // the constraint, insert exactly as that migration would have found it,
  // then re-add it NOT VALID — the same sequence tasks.md 6.11 describes.
  it("keeps a pre-migration NULL message readable, and still refuses a NEW NULL row", async () => {
    const id = randomUUID();
    await pool.query(
      `ALTER TABLE "contact_reveal_event" DROP CONSTRAINT "contact_reveal_event_message_present"`,
    );
    await pool.query(
      `INSERT INTO "contact_reveal_event"
         (id, listing_id, publisher_id, tenant_user_id, city_id, revealed_at, message)
       VALUES ($1,$2,$3,$4,$5,now(),NULL)`,
      [id, LISTING, PUBLISHER, ANA, CITY],
    );
    await pool.query(
      `ALTER TABLE "contact_reveal_event"
         ADD CONSTRAINT "contact_reveal_event_message_present"
         CHECK (message IS NOT NULL AND length(btrim(message)) > 0) NOT VALID`,
    );

    const { rows } = await pool.query<{ message: string | null }>(
      `SELECT message FROM "contact_reveal_event" WHERE id = $1`,
      [id],
    );
    expect(rows[0]?.message).toBeNull();

    // Going forward means going forward: a NEW row, even with the exact same
    // NULL value, is enforced from this point on.
    await expect(
      pool.query(
        `INSERT INTO "contact_reveal_event"
           (id, listing_id, publisher_id, tenant_user_id, city_id, revealed_at, message)
         VALUES ($1,$2,$3,$4,$5,now(),NULL)`,
        [randomUUID(), LISTING, PUBLISHER, ANA, CITY],
      ),
    ).rejects.toThrow();

    await pool.query(`DELETE FROM "contact_reveal_event" WHERE id = $1`, [id]);
  });

  // Every insert from this migration forward is enforced: a blank or
  // whitespace-only message must be refused at the database, not only in the
  // application layer above it.
  it.each(["", "   "])("refuses a new row with a blank message (%j)", async (message) => {
    await expect(
      pool.query(
        `INSERT INTO "contact_reveal_event"
           (id, listing_id, publisher_id, tenant_user_id, city_id, revealed_at, message)
         VALUES ($1,$2,$3,$4,$5,now(),$6)`,
        [randomUUID(), LISTING, PUBLISHER, ANA, CITY, message],
      ),
    ).rejects.toThrow();
  });
});

describe("DrizzleContactRevealEvents as RevealRateLimitPort (tasks.md 6.9/6.10)", () => {
  it("returns only the DISTINCT listings this tenant revealed inside the window", async () => {
    // ANA revealed LISTING three times and OTHER_LISTING once, in beforeAll.
    const ids = await events.findRecentlyRevealedListingIds(
      ANA,
      new Date("2026-02-01T00:00:00.000Z"),
    );

    expect([...ids].sort()).toEqual([LISTING, OTHER_LISTING].sort());
  });

  it("excludes reveals older than the given `since`", async () => {
    // Ana's earliest reveal in this fixture is 2026-03-01; a `since` set
    // right after it must drop that one but keep the later repeats.
    const ids = await events.findRecentlyRevealedListingIds(
      ANA,
      new Date("2026-03-02T00:00:00.000Z"),
    );

    expect(ids).toContain(LISTING);
  });

  it("returns nothing for a tenant who has never revealed anything", async () => {
    const ids = await events.findRecentlyRevealedListingIds(
      randomUUID(),
      new Date("2020-01-01T00:00:00.000Z"),
    );

    expect(ids).toEqual([]);
  });
});

describe("DrizzleContactRevealEvents as RevealMessageHistoryPort (tasks.md 6.14)", () => {
  it("returns the tenant's MOST RECENT message for the pair, not just any", async () => {
    // Repeat reveals never deduplicate (task 6.4); this is the query that
    // decides "latest" is the one that matters for the contact action.
    const listingId = randomUUID();
    await insertListing(listingId);
    await events.record({
      listingId,
      publisherId: PUBLISHER,
      tenantUserId: ANA,
      cityId: CITY,
      revealedAt: new Date("2026-04-01T10:00:00.000Z"),
      message: "Primer mensaje",
    });
    await events.record({
      listingId,
      publisherId: PUBLISHER,
      tenantUserId: ANA,
      cityId: CITY,
      revealedAt: new Date("2026-04-02T10:00:00.000Z"),
      message: "Segundo mensaje, el que importa",
    });

    await expect(events.findLatestMessage(ANA, listingId)).resolves.toBe(
      "Segundo mensaje, el que importa",
    );

    await pool.query(`DELETE FROM "contact_reveal_event" WHERE listing_id = $1`, [listingId]);
    await pool.query(`DELETE FROM "listing" WHERE id = $1`, [listingId]);
  });

  it("returns null when the tenant never revealed this listing", async () => {
    await expect(events.findLatestMessage(randomUUID(), LISTING)).resolves.toBeNull();
  });

  // task 6.11 — a reveal from before the message requirement stores
  // `message IS NULL`. The read side must hand that back as `null`, not
  // crash and not invent an empty string — `null` means "predates the rule".
  it("returns null when the tenant's only reveal predates the message requirement", async () => {
    const listingId = randomUUID();
    const eventId = randomUUID();
    await insertListing(listingId);

    // The only honest way to reproduce a PR #81-era row: drop the
    // constraint, insert exactly as that migration would have found it, then
    // re-add it NOT VALID — same sequence as the CHECK-constraint tests
    // above, because a NEW insert is enforced regardless of how "historical"
    // it looks.
    await pool.query(
      `ALTER TABLE "contact_reveal_event" DROP CONSTRAINT "contact_reveal_event_message_present"`,
    );
    await pool.query(
      `INSERT INTO "contact_reveal_event"
         (id, listing_id, publisher_id, tenant_user_id, city_id, revealed_at, message)
       VALUES ($1,$2,$3,$4,$5,now(),NULL)`,
      [eventId, listingId, PUBLISHER, ANA, CITY],
    );
    await pool.query(
      `ALTER TABLE "contact_reveal_event"
         ADD CONSTRAINT "contact_reveal_event_message_present"
         CHECK (message IS NOT NULL AND length(btrim(message)) > 0) NOT VALID`,
    );

    await expect(events.findLatestMessage(ANA, listingId)).resolves.toBeNull();

    await pool.query(`DELETE FROM "contact_reveal_event" WHERE id = $1`, [eventId]);
    await pool.query(`DELETE FROM "listing" WHERE id = $1`, [listingId]);
  });
});
