import { integer, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";
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
