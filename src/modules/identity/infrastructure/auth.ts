import { DrizzleAdapter } from "@auth/drizzle-adapter";
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { db } from "@/shared/db/client";
import { accounts, sessions, users } from "@/shared/db/schema";
import { toMinimalGoogleProfile } from "./google-profile";

// account-identity spec, Requirement: Google-Only Authentication — Google is
// wired as the only provider. No credentials/password/SMS provider exists
// here, including for testing (binding constraint: never add one "for
// testing").
export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
  }),
  providers: [
    Google({
      // Restricts the captured profile to email + display name at the
      // narrowest point in the sign-in path — see google-profile.ts.
      profile: toMinimalGoogleProfile,
    }),
  ],
  session: { strategy: "database" },
});
