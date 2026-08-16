import { integer, pgTable, primaryKey, text, timestamp, unique } from "drizzle-orm/pg-core";
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
