import { DrizzleAdapter } from "@auth/drizzle-adapter";
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { db } from "@/shared/db/client";
import { accounts, sessions, users, verificationTokens } from "@/shared/db/schema";
import { buildEmailProvider } from "./email-provider";
import { toMinimalGoogleProfile } from "./google-profile";
import { signInRedirect } from "./redirect-callback";

// account-identity spec, Requirement: Google-Only Authentication has been
// superseded by "Two Authentication Doors" (tasks.md Phase 15, F16/F17):
// Google Sign-In and the magic-link email door, same account either way, no
// credentials/password/SMS provider — see the spec file for the updated
// requirement text.
export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  providers: [
    Google({
      // Restricts the captured profile to email + display name at the
      // narrowest point in the sign-in path — see google-profile.ts.
      profile: toMinimalGoogleProfile,
    }),
    buildEmailProvider(),
  ],
  session: { strategy: "database" },
  // F19, tasks.md 15.10: el único paso por donde cruzan las dos puertas y los
  // dos momentos del enlace por correo. Ver `redirect-callback.ts`.
  callbacks: { redirect: signInRedirect },
});
