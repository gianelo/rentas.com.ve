import { sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "../../../shared/db/schema";
import type {
  NewPhotoHash,
  PhotoHashMatch,
  PhotoHashPort,
  PublisherId,
} from "../application/ports/photo-hash.port";
import type { PerceptualHash } from "../domain/perceptual-hash";

/**
 * The duplicate scan, run where the rows are (design.md D4, task 4.6).
 *
 * `bit_count(a # b)` is Postgres's own population count over an XOR — the
 * Hamming distance, computed by the database rather than by pulling every
 * hash into a serverless function and looping. `hammingDistance` in the
 * domain is the same arithmetic in TypeScript, and the two are cross-checked
 * against the same vectors in tests/integration/photo-hash.test.ts, because
 * two implementations that drift return a confident wrong answer where one
 * untested implementation would at least leave a visible gap.
 *
 * **The same-publisher exemption is not a filter this file remembers to
 * apply.** The port exposes exactly one query and `excludePublisherId` is a
 * required argument on it, so the exclusion reaches the SQL by construction.
 * An honest owner republishing their own property after it expired passes by
 * the shape of the API, not by anyone's discipline.
 *
 * `publisher_id` is joined rather than stored beside the hash. A copy would
 * be a second source of truth for who owns a listing — the exact fact this
 * exemption rests on — and a copy that drifts turns "this is your own photo"
 * into a false accusation of duplication.
 */
export type TrustDatabase = PgDatabase<PgQueryResultHKT, typeof schema>;

/** What the query returns, before it is a `PhotoHashMatch`. */
interface MatchRow extends Record<string, unknown> {
  readonly photo_id: string;
  readonly listing_id: string;
  readonly publisher_id: string;
  readonly distance: number;
}

/** 64 ones and zeroes — how `bit(64)` is written and read. */
function toBitString(hash: PerceptualHash): string {
  return hash.toString(2).padStart(64, "0");
}

export class DrizzlePhotoHash implements PhotoHashPort {
  constructor(private readonly db: TrustDatabase) {}

  async findMatchesFromOtherPublishers(
    hash: PerceptualHash,
    excludePublisherId: PublisherId,
    maxDistance: number,
  ): Promise<PhotoHashMatch[]> {
    const result = await this.db.execute<MatchRow>(sql`
      SELECT
        h.photo_id,
        p.listing_id,
        l.publisher_id,
        bit_count(h.hash # ${toBitString(hash)}::bit(64))::int AS distance
      FROM listing_photo_hash h
      JOIN listing_photo p ON p.id = h.photo_id
      JOIN listing l ON l.id = p.listing_id
      WHERE l.publisher_id <> ${excludePublisherId}
        AND bit_count(h.hash # ${toBitString(hash)}::bit(64)) <= ${maxDistance}
      ORDER BY distance ASC, h.photo_id ASC
    `);

    // `rows` on node-postgres, the array itself on neon-http. Both drivers
    // serve this port and the shape difference is theirs, not ours.
    const rows: MatchRow[] = Array.isArray(result)
      ? (result as MatchRow[])
      : ((result as { rows: MatchRow[] }).rows ?? []);

    return rows.map((row) => ({
      photoId: row.photo_id,
      listingId: row.listing_id,
      publisherId: row.publisher_id,
      distance: Number(row.distance),
    }));
  }

  /**
   * The write side task 4.7 adds. Exactly the three columns
   * `listing_photo_hash` has — no `publisherId`, because the schema
   * deliberately carries none (schema.ts) — so there is nothing here for a
   * denormalised copy to drift from. Drizzle's own typed insert is used
   * rather than raw SQL, since `bit64`'s `customType` already speaks the
   * same 64-character bit string `toBitString` produces for the read side.
   */
  async record(newHash: NewPhotoHash): Promise<void> {
    await this.db.insert(schema.listingPhotoHashes).values({
      photoId: newHash.photoId,
      hash: toBitString(newHash.hash),
      createdAt: newHash.recordedAt,
    });
  }
}
