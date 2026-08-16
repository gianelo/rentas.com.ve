import type { GoogleProfile } from "next-auth/providers/google";
import { describe, expect, it } from "vitest";
import { toMinimalGoogleProfile, UnverifiedGoogleEmailError } from "./google-profile";

function makeGoogleProfile(overrides: Partial<GoogleProfile> = {}): GoogleProfile {
  return {
    aud: "client-id",
    azp: "client-id",
    email: "tenant@example.com",
    email_verified: true,
    exp: 0,
    family_name: "Doe",
    given_name: "Jane",
    hd: "example.com",
    iat: 0,
    iss: "https://accounts.google.com",
    locale: "es",
    name: "Jane Doe",
    picture: "https://example.com/photo.jpg",
    sub: "google-user-id",
    ...overrides,
  };
}

describe("toMinimalGoogleProfile", () => {
  // account-identity spec, Requirement: Minimal Identity Data — "The system
  // MUST capture only the verified email and display name supplied by
  // Google at signup."
  it("keeps only id, name, and email from a verified Google profile", () => {
    const profile = makeGoogleProfile();

    expect(toMinimalGoogleProfile(profile)).toEqual({
      id: "google-user-id",
      name: "Jane Doe",
      email: "tenant@example.com",
    });
  });

  it("drops every extra field Google's profile carries — picture, locale, given/family name, hd", () => {
    const profile = makeGoogleProfile();

    const result = toMinimalGoogleProfile(profile) as unknown as Record<string, unknown>;

    expect(Object.keys(result).sort()).toEqual(["email", "id", "name"]);
  });

  // account-identity spec, Requirement: Google-Only Authentication — the
  // captured account must hold a *verified* Google email.
  it("rejects an unverified email instead of creating an account from it", () => {
    const profile = makeGoogleProfile({ email_verified: false });

    expect(() => toMinimalGoogleProfile(profile)).toThrow(UnverifiedGoogleEmailError);
  });
});
