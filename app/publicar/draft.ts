import type { PublishViolation } from "../../src/modules/listing-publication/domain/publishable-listing";
import type { PublishFormValues } from "./PublishForm";

/**
 * Step 1's answers, carried to step 2 and back to itself.
 *
 * ## Why a cookie and not a table
 *
 * A `draft_listing` table would need a status column, a cleanup job for the
 * drafts nobody finishes, and a migration — for data whose entire lifetime is
 * "between two screens of one sitting". The draft is small by construction
 * once photos are excluded, and #38's 1,200-character description ceiling is
 * what keeps it inside a cookie's ~4 KB rather than failing at an arbitrary,
 * unreproducible size in production.
 *
 * ## Why it is not signed, stated so nobody "fixes" it later
 *
 * Every value here is the publisher's own, and they can change all of them by
 * retyping the form. Tampering buys nothing. The one field that must never
 * come from the client — the publisher id — is not here and never will be: it
 * comes from the session, which is what makes the ownership check in
 * `processUploadedPhoto` mean anything. `httpOnly` and `sameSite=lax` are
 * carried anyway, because a draft is still somebody's unfinished writing.
 */

export const DRAFT_COOKIE = "rentas_publish_draft";

/**
 * Ten minutes. Long enough to pick photos out of a gallery on a bad day,
 * short enough that a shared or borrowed phone does not hand the next person
 * a half-written listing.
 */
export const DRAFT_TTL_SECONDS = 600;

export interface PublishDraft {
  readonly values: PublishFormValues;
  /** Empty on the way to step 2; populated when step 1 sends itself back. */
  readonly violations: readonly PublishViolation[];
}

/** Only the fields the form actually posts. */
const VALUE_KEYS = [
  "publisherType",
  "title",
  "priceUsd",
  "cityId",
  "zoneId",
  "rooms",
  "areaM2",
  "bathrooms",
  "parkingSpots",
  "description",
] as const;

/**
 * base64url, not raw JSON.
 *
 * **This is not tidiness — the raw form does not fit.** A maximal draft is
 * ~2.4 KB of UTF-8 once the description is 1,200 accented characters, and a
 * cookie value is percent-encoded, which turns every non-ASCII byte into
 * three characters: 7,724 for the realistic Spanish worst case, against a
 * ~4 KB browser ceiling that counts the name and attributes too. The failure
 * mode would have been a request that silently arrives without its cookie
 * and a form that empties itself — in production, at a size nobody could
 * reproduce on demand.
 *
 * base64url expands by a third and needs no percent-encoding, because its
 * alphabet is already URL-safe. The test measures the real worst case rather
 * than trusting this paragraph.
 */
export function serialiseDraft(draft: PublishDraft): string {
  return Buffer.from(JSON.stringify(draft), "utf8").toString("base64url");
}

/**
 * Returns `null` for anything that is not a draft this application wrote.
 *
 * Unknown keys are dropped rather than carried, and that is deliberate: the
 * parsed object is spread into the form's values, so a cookie carrying
 * `publisherId` would otherwise arrive at exactly the place a publisher id
 * must never come from. An allowlist makes that unreachable instead of
 * merely unlikely.
 */
export function parseDraft(raw: string | undefined): PublishDraft | null {
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
  } catch {
    // A truncated or hand-edited cookie is not an error worth surfacing —
    // the publisher simply gets an empty form, which is recoverable.
    return null;
  }

  if (typeof parsed !== "object" || parsed === null) return null;
  const candidate = parsed as { values?: unknown; violations?: unknown };
  if (typeof candidate.values !== "object" || candidate.values === null) return null;

  const source = candidate.values as Record<string, unknown>;
  const values: Record<string, string> = {};
  for (const key of VALUE_KEYS) {
    const value = source[key];
    if (typeof value === "string") values[key] = value;
  }

  const violations = Array.isArray(candidate.violations)
    ? candidate.violations.filter((v): v is PublishViolation => typeof v === "string")
    : [];

  return { values, violations };
}
