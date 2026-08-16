import type { GoogleProfile } from "next-auth/providers/google";

export class UnverifiedGoogleEmailError extends Error {
  constructor() {
    super("Google account email is not verified.");
    this.name = "UnverifiedGoogleEmailError";
  }
}

export interface MinimalIdentityProfile {
  id: string;
  name: string;
  email: string;
}

/**
 * account-identity spec, Requirement: Minimal Identity Data — captures only
 * the verified email and display name Google supplies. Every other field
 * Google's OAuth profile carries (picture, locale, given_name, family_name,
 * hd, ...) is dropped here, at the narrowest point in the whole sign-in
 * path, so no caller downstream can accidentally persist more than the spec
 * allows — wiring this as the provider's `profile()` callback (see
 * ./auth.ts) means it runs before anything is ever handed to the adapter.
 *
 * Also enforces Requirement: Google-Only Authentication's "verified ...
 * Google email" — an unverified email never reaches account creation.
 */
export function toMinimalGoogleProfile(profile: GoogleProfile): MinimalIdentityProfile {
  if (!profile.email_verified) {
    throw new UnverifiedGoogleEmailError();
  }

  return {
    id: profile.sub,
    name: profile.name,
    email: profile.email,
  };
}
