import type { Metadata } from "next";
import { signIn } from "@/modules/identity/infrastructure/auth";

export const metadata: Metadata = {
  title: "Sign in — Rentas",
};

interface SignInPageProps {
  searchParams: Promise<{ callbackUrl?: string }>;
}

/**
 * account-identity spec — Google Sign-In is the only entry point (no
 * password, SMS, or email/password option exists anywhere on this page).
 *
 * Server-rendered, no client component: the sign-in action is a form
 * bound to a Server Action, which works with JavaScript disabled (design.md
 * D13, "the read path ships no client-side JavaScript"). Accessibility
 * baseline (D15): one real <h1>, one landmark (<main>), no placeholder
 * standing in for a label — the page has no text input to mislabel, and
 * keyboard focus is left to the browser default rather than suppressed.
 * No component style is written here (D16): this page carries no CSS.
 */
export default async function SignInPage({ searchParams }: SignInPageProps) {
  const { callbackUrl } = await searchParams;

  async function signInWithGoogle() {
    "use server";
    await signIn("google", { redirectTo: callbackUrl || "/" });
  }

  return (
    <main>
      <h1>Sign in</h1>
      <p>Sign in with your Google account to continue. There is no other way to sign in.</p>
      <form action={signInWithGoogle}>
        <button type="submit">Sign in with Google</button>
      </form>
    </main>
  );
}
