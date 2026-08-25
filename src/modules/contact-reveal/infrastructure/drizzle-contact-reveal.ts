import { randomUUID } from "node:crypto";
import { and, desc, eq, gte, type SQL, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type * as schema from "../../../shared/db/schema";
import { contactRevealEvents, listings } from "../../../shared/db/schema";
import type {
  ContactRevealEventPort,
  NewContactRevealEvent,
} from "../application/ports/contact-reveal-event.port";
import type {
  ContactRevealMetricsPort,
  UniquePairFilter,
  UniqueRevealPair,
} from "../application/ports/contact-reveal-metrics.port";
import type {
  RevealMessageHistoryPort,
  RevealRateLimitPort,
} from "../application/ports/reveal-rate-limit.port";
import type {
  RevealableListing,
  RevealableListingPort,
} from "../application/ports/revealable-listing.port";

/**
 * The two halves of D6 against real Postgres (tasks.md 6.5, 6.7).
 *
 * The handle is a constructor argument, not an import: production hands it a
 * Neon client and tests/integration/contact-reveal.test.ts hands it a
 * `node-postgres` client pointed at a real container, and **both run this
 * exact code**. `PgDatabase` is the shape the two drivers share.
 */
export type ContactRevealDatabase = PgDatabase<PgQueryResultHKT, typeof schema>;

/**
 * Implements the write side (D6), the rate-limit read side (task 6.9/6.10)
 * and the message-recall read side (task 6.14) — same table, same class, no
 * second connection or repository to keep in sync. `ContactRevealEventPort`
 * stays write-only in its own contract; this class simply also answers what
 * `RevealRateLimitPort` and `RevealMessageHistoryPort` ask.
 */
export class DrizzleContactRevealEvents
  implements ContactRevealEventPort, RevealRateLimitPort, RevealMessageHistoryPort
{
  constructor(private readonly db: ContactRevealDatabase) {}

  /**
   * One INSERT, no read first, no ON CONFLICT. A repeat reveal by the same
   * tenant is a new row — deduplication is the view's job, and a write-time
   * dedup here would destroy the raw action count the contact-reveal spec
   * requires, with no way to reconstruct it.
   */
  async record(event: NewContactRevealEvent): Promise<void> {
    await this.db.insert(contactRevealEvents).values({ id: randomUUID(), ...event });
  }

  /**
   * Task 6.9/6.10 — every DISTINCT listing this tenant revealed since
   * `since`. The rolling window lives entirely in this query (`since` is
   * `now - 24h`, computed by the caller); `evaluateRevealAllowance` never
   * sees a `Date` at all.
   */
  async findRecentlyRevealedListingIds(
    tenantUserId: string,
    since: Date,
  ): Promise<readonly string[]> {
    const rows = await this.db
      .selectDistinct({ listingId: contactRevealEvents.listingId })
      .from(contactRevealEvents)
      .where(
        and(
          eq(contactRevealEvents.tenantUserId, tenantUserId),
          gte(contactRevealEvents.revealedAt, since),
        ),
      );

    return rows.map((row) => row.listingId);
  }

  /**
   * Task 6.14 — the tenant's MOST RECENT message for this pair. "Latest"
   * lives entirely in `ORDER BY ... DESC LIMIT 1`, the same read-query shape
   * D6's own view already uses to pick a specific row deterministically; the
   * application layer above never has to know how "latest" was decided.
   */
  async findLatestMessage(tenantUserId: string, listingId: string): Promise<string | null> {
    const rows = await this.db
      .select({ message: contactRevealEvents.message })
      .from(contactRevealEvents)
      .where(
        and(
          eq(contactRevealEvents.tenantUserId, tenantUserId),
          eq(contactRevealEvents.listingId, listingId),
        ),
      )
      .orderBy(desc(contactRevealEvents.revealedAt), desc(contactRevealEvents.id))
      .limit(1);

    return rows[0]?.message ?? null;
  }
}

/**
 * El único lugar por donde el contacto guardado sale de Postgres.
 *
 * **`status = 'active'` va en el WHERE y no en un `if` después de leer.** La
 * diferencia no es de estilo: filtrando en SQL, el valor de un aviso vencido u
 * oculto **nunca sale de la base**, así que no hay render, log de consulta ni
 * payload de componente de servidor que pueda arrastrarlo. Filtrado en
 * TypeScript, el número ya viajó — y el descarte depende de que cada lector se
 * acuerde de mirar el estado.
 *
 * Devolver `null` cubre inexistente, vencido y oculto por igual, que es lo que
 * el puerto promete: quien sondea URLs no puede distinguir un aviso dado de
 * baja de uno que nunca existió.
 */
export class DrizzleRevealableListing implements RevealableListingPort {
  constructor(private readonly db: ContactRevealDatabase) {}

  async findRevealable(listingId: string): Promise<RevealableListing | null> {
    const rows = await this.db
      .select({
        listingId: listings.id,
        publisherId: listings.publisherId,
        cityId: listings.cityId,
        contactMethod: listings.contactMethod,
        contactValue: listings.contactValue,
      })
      .from(listings)
      .where(and(eq(listings.id, listingId), eq(listings.status, "active")))
      .limit(1);

    return rows[0] ?? null;
  }
}

/**
 * **DRIFT RISK — tasks.md 6.2, stated here because this is where it bites.**
 *
 * `contact_reveal_unique_pair` is a hand-written view in
 * drizzle/0005_hesitant_brood.sql. Drizzle does not know it exists: it is not
 * in schema.ts, `drizzle-kit generate` neither creates nor diffs it, and
 * `db.execute` returns `unknown` rows. So `UniquePairRow` below is a HAND
 * DECLARATION — a claim about the SQL that the compiler cannot check.
 *
 * What breaks when they drift, concretely: rename or drop a view column and
 * TypeScript still compiles, `pnpm typecheck` still passes, and every field
 * that no longer exists arrives as `undefined`. `Number(undefined)` is `NaN`,
 * `new Date(undefined)` is Invalid Date — so the failure mode is not a crash
 * but a go/pivot report reading `NaN` unique pairs, or silently reading zero
 * if a `?? 0` is ever added in sympathy. The only thing standing between that
 * and a shipped wrong number is tests/integration/contact-reveal.test.ts,
 * which runs this mapping against the real view. **If that test is ever
 * skipped, quarantined, or run without Postgres, this type is unverified.**
 *
 * Rejected alternative, and why: teaching Drizzle the view via `pgView(...)`
 * would type it, but Drizzle would then also own its DDL — and the
 * `DISTINCT ON` + window `count(*)` this view is built from is not
 * expressible in that builder without an `.as(sql\`…\`)` escape hatch that
 * reintroduces exactly the same unchecked string. The risk moves; it does not
 * disappear. Keeping the SQL in one readable place and pinning it with an
 * integration test is the honest version of the same trade.
 */
interface UniquePairRow extends Record<string, unknown> {
  readonly tenant_user_id: string;
  readonly listing_id: string;
  readonly publisher_id: string;
  readonly city_id: string;
  /** `Date` on node-postgres, an ISO string on neon-http. Both are mapped. */
  readonly first_revealed_at: Date | string;
  /** Postgres `count(*)` is bigint; node-postgres hands it back as a string. */
  readonly reveal_count: string | number;
}

export class DrizzleContactRevealMetrics implements ContactRevealMetricsPort {
  constructor(private readonly db: ContactRevealDatabase) {}

  async findUniquePairs(filter: UniquePairFilter): Promise<readonly UniqueRevealPair[]> {
    // Predicates are applied to the view, never to the base table, and never
    // by rebuilding the aggregation here. The view name is the one thing
    // callers depend on, which is what keeps D6's escalation path open: it
    // can become a MATERIALIZED VIEW or a projection table without touching
    // a single query.
    const conditions: SQL[] = [];
    if (filter.listingId) conditions.push(sql`listing_id = ${filter.listingId}`);
    if (filter.cityId) conditions.push(sql`city_id = ${filter.cityId}`);
    if (filter.tenantUserId) conditions.push(sql`tenant_user_id = ${filter.tenantUserId}`);

    const where = conditions.length > 0 ? sql` WHERE ${and(...conditions)}` : sql``;

    const result = await this.db.execute<UniquePairRow>(
      sql`SELECT * FROM contact_reveal_unique_pair${where} ORDER BY first_revealed_at, listing_id`,
    );

    // `rows` on node-postgres, the array itself on neon-http. Both drivers
    // serve this port and the shape difference is theirs, not ours.
    const rows: UniquePairRow[] = Array.isArray(result)
      ? (result as UniquePairRow[])
      : ((result as { rows: UniquePairRow[] }).rows ?? []);

    return rows.map((row) => ({
      tenantUserId: row.tenant_user_id,
      listingId: row.listing_id,
      publisherId: row.publisher_id,
      cityId: row.city_id,
      firstRevealedAt: new Date(row.first_revealed_at),
      revealCount: Number(row.reveal_count),
    }));
  }
}
