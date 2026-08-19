import {
  customType,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import type { AdapterAccountType } from "next-auth/adapters";

// Auth.js v5 core tables (design.md, Data Model: "user, account, session
// (Auth.js)"). Column shapes mirror @auth/drizzle-adapter's own
// `defineTables()` default Postgres schema exactly, so `DrizzleAdapter(db, {
// usersTable, accountsTable, sessionsTable })` in
// src/modules/identity/infrastructure/auth.ts type-checks against it without
// a cast. No `verificationToken` or `authenticator` table: this app has
// exactly one provider (Google OAuth) — no magic-link email provider, no
// WebAuthn/passkeys — so neither table has a caller.

export const users = pgTable("user", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  // Present only because the adapter's default schema defines it. It stays
  // NULL by construction: `toMinimalGoogleProfile` drops Google's `picture`
  // before the adapter ever sees the profile, per the account-identity spec's
  // Minimal Identity Data requirement. Do NOT start populating it because the
  // column happens to exist — capturing an avatar is a product decision about
  // holding third-party personal data, not a schema convenience.
  image: text("image"),
});

export const accounts = pgTable(
  "account",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => [
    primaryKey({
      columns: [account.provider, account.providerAccountId],
    }),
  ],
);

export const sessions = pgTable("session", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

// city / zone (design.md D5, tasks.md 2.1). City isolation is enforced by
// schema, not a runtime filter a caller could forget. `zone` carries an
// explicit UNIQUE(id, city_id) alongside its own primary key: a plain
// primary key on `id` is already unique on its own, but a composite foreign
// key must reference a unique (or primary-key) constraint that covers
// exactly its referencing columns, and `id` alone does not cover `city_id`.
// This is the constraint that makes `listing`'s future composite foreign
// key `(zone_id, city_id) -> zone(id, city_id)` (tasks.md 3.1) possible at
// all — without it, a listing could reference a zone that belongs to the
// wrong city, and no application-level check could be trusted to catch
// every case (see the integration test in tests/integration/zone.test.ts).
//
// Zones are a curated table maintained by the founder, no free text — see
// src/shared/db/seed.ts for the current (provisional) taxonomy.

export const cities = pgTable("city", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull().unique(),
});

export const zones = pgTable(
  "zone",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    cityId: text("city_id")
      .notNull()
      .references(() => cities.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
  },
  (zone) => [
    unique("zone_id_city_id_unique").on(zone.id, zone.cityId),
    // Keeps the seed idempotent (tasks.md 2.3) and rejects two curated rows
    // for the same zone name inside one city.
    unique("zone_city_id_name_unique").on(zone.cityId, zone.name),
  ],
);

// listing (design.md D5, tasks.md 3.1). The rental advert itself.
//
// Two decisions here are load-bearing, and both are constraints rather than
// application checks — the difference matters, because an application check
// protects only the paths that remember to call it.
//
// 1. `publisher_type` is NOT NULL with NO DEFAULT. A default would be the
//    quiet failure mode: every listing whose publisher type was never
//    resolved would silently become an "owner", and the owner/broker
//    distinction is a trust guarantee the whole product rests on
//    (SISTEMA.md "Distinción dueño / inmobiliaria" — it must survive even
//    the removal of colour). With no default, a caller that forgets the
//    field gets a database error at insert time, not a wrong badge in
//    production.
//
// 2. `(zone_id, city_id)` is a COMPOSITE foreign key into
//    `zone(id, city_id)`, not two independent references. That is D5: "a
//    Maracaibo listing physically cannot hold a Distrito Capital zone."
//    Two separate FKs would each pass on their own while the pair remains
//    nonsense. This is the constraint `zone_id_city_id_unique` exists to
//    make possible, and tests/integration/zone.test.ts proves Postgres
//    actually refuses the cross-city row.
export const listings = pgTable(
  "listing",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    publisherId: text("publisher_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // No .default() — see note 2 above. Adding one later is a silent
    // behaviour change, not a convenience.
    publisherType: text("publisher_type").$type<"owner" | "broker">().notNull(),
    cityId: text("city_id")
      .notNull()
      .references(() => cities.id, { onDelete: "restrict" }),
    zoneId: text("zone_id").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    // Every price in this product is monthly USD (SISTEMA.md screen 3:
    // "Precio: solo el número; todos los precios están en dólares"), stored
    // as whole dollars. No currency column, because a second currency is a
    // product decision that would also change the search filters and the
    // row layout — not something to leave a nullable column open for.
    priceUsd: integer("price_usd").notNull(),
    rooms: integer("rooms").notNull(),
    areaM2: integer("area_m2").notNull(),
    // active | expired | hidden. Search shows `active` only (tasks.md
    // 5.5/5.6); `hidden` is the auto-hide state from reports (Phase 8).
    status: text("status").$type<"active" | "expired" | "hidden">().notNull(),
    publishedAt: timestamp("published_at", { mode: "date", withTimezone: true }).notNull(),
    // 30 days from publication (SISTEMA.md screen 3: "Tu aviso queda activo
    // 30 días"). Stored rather than derived so the reminder job (Phase 7)
    // can index it and a renewal can move it.
    expiresAt: timestamp("expires_at", { mode: "date", withTimezone: true }).notNull(),
  },
  (listing) => [
    foreignKey({
      columns: [listing.zoneId, listing.cityId],
      foreignColumns: [zones.id, zones.cityId],
      name: "listing_zone_city_fk",
    }),
    // Search always filters by city first and city is non-nullable in the
    // search port (tasks.md 5.1/5.2), so this is the access path every
    // query takes.
    index("listing_city_status_idx").on(listing.cityId, listing.status),
  ],
);

// listing_photo (tasks.md 3.8, design.md D12). Two derivatives per photo and
// nothing else.
//
// **There is deliberately no column for the original file.** D12: "Originals
// are discarded after hashing and normalization." A phone photo is 3–8 MB
// and six per listing is ~30 MB, which against R2's 10 GB free tier caps the
// catalogue at ~330 listings; storing only derivatives puts the same tier at
// ~7,000. A nullable `original_key` would be a standing invitation to start
// keeping them, so the column does not exist — the schema refuses what the
// design decided rather than merely not doing it.
//
// **No `alt_text` column either, and that is a decision rather than an
// omission.** The listing-search spec requires alternative text on every
// photo; it does not require a publisher to type it. Asking someone
// filling this form on a phone, one-handed, to describe six photographs
// produces empty fields, not accessible ones. Alt text is composed at
// render time from the listing's own title, zone, and this row's
// `position`. The honest tradeoff, recorded rather than glossed: derived
// alt text is weaker than a real description, and it is chosen because the
// realistic alternative is not better text but no text.
export const listingPhotos = pgTable(
  "listing_photo",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    listingId: text("listing_id")
      .notNull()
      .references(() => listings.id, { onDelete: "cascade" }),
    // Display order, zero-based. The detail screen shows one large photo
    // plus a strip of thumbnails (SISTEMA.md screen 2), so which photo is
    // first is a publisher's choice and has to survive a reload.
    position: integer("position").notNull(),
    // R2 object keys, not URLs. The public base URL is environment
    // configuration (`R2_BUCKET_PUBLIC_URL`) and changes when the bucket
    // moves behind a custom domain — baking it into every row would make
    // that migration a data rewrite instead of a config change.
    thumbnailKey: text("thumbnail_key").notNull(),
    detailKey: text("detail_key").notNull(),
    // Measured byte sizes of the two derivatives (D12: thumbnail ≤ 10 KB,
    // detail ≤ 200 KB). Stored so the budget stays auditable against real
    // production rows — `SELECT max(detail_bytes) FROM listing_photo` is a
    // question the test suite cannot answer, because it only ever sees
    // fixtures. A budget verified solely against test images is a budget
    // that has never met a real photograph.
    thumbnailBytes: integer("thumbnail_bytes").notNull(),
    detailBytes: integer("detail_bytes").notNull(),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
  },
  (photo) => [
    // Two photos cannot claim the same slot in one listing's order.
    unique("listing_photo_position_unique").on(photo.listingId, photo.position),
    index("listing_photo_listing_idx").on(photo.listingId),
  ],
);

/**
 * A 64-bit dHash of one photo, as Postgres `bit(64)` (design.md D4).
 *
 * **Not `bigint`, and not `text`.** The similarity query is
 * `bit_count(hash # $1) <= $2` — Postgres's own population count over an XOR
 * — and that operator pair only exists for bit strings. Storing this as a
 * number would force every comparison into application code, which is
 * exactly the sequential-scan-in-TypeScript this design avoids; storing it
 * as text would make the same query a lie that happens to parse.
 *
 * Drizzle has no first-class `bit`, so the type is declared here rather than
 * approximated with one that ships. `customType` keeps the SQL honest while
 * the TypeScript side stays a plain string of 64 ones and zeroes.
 */
const bit64 = customType<{ data: string; driverData: string }>({
  dataType: () => "bit(64)",
});

// listing_photo_hash (tasks.md 4.1, design.md D4). One hash per photo, and
// the primary key says so: a photo with two hashes would make "is this a
// duplicate" depend on which row a scan reached first.
//
// **There is deliberately no `publisher_id` column here**, even though the
// duplicate query filters on it. It is reachable by joining `listing_photo`
// to `listing`, and a copy kept in this table would be a second source of
// truth for who owns a listing — the exact fact D4's same-publisher
// exemption depends on. A denormalised copy that drifts turns "this is your
// own photo, republish freely" into a false accusation of duplication, which
// is the worst failure this feature has.
export const listingPhotoHashes = pgTable("listing_photo_hash", {
  photoId: text("photo_id")
    .primaryKey()
    .references(() => listingPhotos.id, { onDelete: "cascade" }),
  hash: bit64("hash").notNull(),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
});

// contact_reveal_event (tasks.md 6.1, design.md D6) — the north-star metric's
// single source of truth. Append-only: one row per reveal ACTION, repeats
// included. The unique `(tenant, listing)` figure is not a second table, it is
// `contact_reveal_unique_pair`, a VIEW created by hand in the same migration
// (drizzle has no schema-level view builder in this version, so the CREATE
// VIEW lives in the .sql file; see drizzle-contact-reveal.ts for the drift
// risk that creates).
//
// **`city_id` is copied here, not joined.** A listing can be edited, expired,
// hidden or removed; a metric a JOIN can erase is not a metric. Same reason
// `publisher_id` is stored rather than reached through `listing`.
//
// **No ON DELETE CASCADE anywhere in this table, and that is the decision
// most likely to be "fixed" by mistake.** Cascading from `listing` or `user`
// would silently delete the go/pivot evidence exactly when a listing is taken
// down or an account is closed — the deletions most correlated with the
// months a reveal happened. `restrict` makes the conflict loud instead: an
// account erasure request will fail here until someone decides between
// anonymising these rows and dropping them, which is the open question
// design.md already records under "Retention for contact_reveal_event".
export const contactRevealEvents = pgTable(
  "contact_reveal_event",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    listingId: text("listing_id")
      .notNull()
      .references(() => listings.id, { onDelete: "restrict" }),
    publisherId: text("publisher_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    tenantUserId: text("tenant_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    cityId: text("city_id")
      .notNull()
      .references(() => cities.id, { onDelete: "restrict" }),
    revealedAt: timestamp("revealed_at", { mode: "date", withTimezone: true }).notNull(),
  },
  (event) => [
    // Supplies the view's `DISTINCT ON` ordering and its window partition in
    // one index, so the unique-pair count needs no sort step (design.md D6,
    // query table). There is deliberately NO unique constraint on
    // (tenant_user_id, listing_id): a repeat reveal must insert, not conflict.
    index("contact_reveal_pair_idx").on(
      event.tenantUserId,
      event.listingId,
      event.revealedAt,
      event.id,
    ),
    index("contact_reveal_city_idx").on(event.cityId, event.revealedAt),
    index("contact_reveal_listing_idx").on(event.listingId, event.revealedAt),
  ],
);
