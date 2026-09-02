import { DrizzleAdapter } from "@auth/drizzle-adapter";
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { db } from "@/shared/db/client";
import { accounts, sessions, users, verificationTokens } from "@/shared/db/schema";
import { SIGN_IN_WAIT_PATH } from "../domain/safe-return-destination";
import { buildEmailProvider } from "./email-provider";
import { toMinimalGoogleProfile } from "./google-profile";
import { buildProviderEmailVerificationEvent } from "./provider-email-verification-event";
import { signInRedirect } from "./redirect-callback";

// account-identity spec, Requirement: Google-Only Authentication has been
// superseded by "Two Authentication Doors" (tasks.md Phase 15, F16/F17):
// Google Sign-In and the magic-link email door, same account either way, no
// credentials/password/SMS provider — see the spec file for the updated
// requirement text.
/**
 * Sale de la llamada a `NextAuth` porque el asiento de la 19.14 escribe por
 * `updateUser` del propio adaptador — la misma escritura que la puerta del
 * enlace por correo ya hace (`@auth/core` 0.41.3, `handle-login.js:69`), en
 * vez de una consulta nueva al lado.
 */
const adapter = DrizzleAdapter(db, {
  usersTable: users,
  accountsTable: accounts,
  sessionsTable: sessions,
  verificationTokensTable: verificationTokens,
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter,
  providers: [
    Google({
      // Restricts the captured profile to email + display name at the
      // narrowest point in the sign-in path — see google-profile.ts.
      profile: toMinimalGoogleProfile,
    }),
    buildEmailProvider(),
  ],
  session: { strategy: "database" },
  /**
   * **La pantalla por defecto de Auth.js deja de ser alcanzable** (15.9, 22.22):
   * sin esto, `/api/auth/verify-request` dibuja la de la librería, en inglés,
   * sin la dirección tecleada y sin salida. **Es el seam y no un redirect
   * nuestro** porque cubre todos los caminos: `@auth/core` manda ahí venga de
   * donde venga la petición. La acción redirige además por su cuenta, para
   * escribir el comprobante recién cuando el envío ya ocurrió.
   */
  pages: { verifyRequest: SIGN_IN_WAIT_PATH },
  // F19, tasks.md 15.10: el único paso por donde cruzan las dos puertas y los
  // dos momentos del enlace por correo. Ver `redirect-callback.ts`.
  callbacks: { redirect: signInRedirect },
  /**
   * tasks.md 19.14 — Google verifica el correo MEJOR que el enlace mágico y
   * era el único camino que quedaba sin fecha. Ver
   * `provider-email-verification-event.ts` para por qué el asiento es éste y
   * no el callback `signIn` ni `events.createUser`.
   */
  events: { signIn: buildProviderEmailVerificationEvent(adapter) },
});
