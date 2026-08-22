/**
 * The canonical listing URL (tasks.md 11.1, design.md D11):
 *
 *     /alquiler/<ciudad>/<zona>/<slug>-<id>
 *
 * **Only the id identifies the listing.** The three readable segments exist
 * for the two audiences that read a URL — a crawler, and a person deciding
 * whether to tap a link pasted into a WhatsApp group, which is how listings
 * actually circulate here. They carry no lookup power, and they must not:
 * a title can be edited and a zone renamed, and a URL that stopped resolving
 * because someone fixed a typo is a URL that was never worth indexing.
 *
 * The consequence is a duty on the page rather than on this module. Since
 * every path ending in the same id resolves to the same listing, a page that
 * served all of them would publish unbounded duplicate URLs for one advert —
 * the exact thing Phase 11 exists to avoid. The page therefore rebuilds the
 * canonical path with `buildListingPath` and redirects anything that differs.
 */

export interface ListingUrlParts {
  readonly cityName: string;
  readonly zoneName: string;
  readonly title: string;
  readonly id: string;
}

/**
 * **A cap, not a truncation of meaning.** A published title runs to whatever
 * a publisher typed, and pinning the whole of it in front of a 36-character
 * id produces links that wrap across three lines in a chat. Sixty characters
 * keeps the first clause — which is where a Venezuelan rental title puts the
 * property type and the room count — and the cut lands on a word boundary,
 * because a slug ending mid-word reads as a broken link rather than a long
 * one.
 */
export const MAX_SLUG_LENGTH = 60;

/**
 * The id as both generators actually emit it: 8-4-4-4-12 lowercase hex.
 * `crypto.randomUUID()` sets the RFC 4122 version and variant bits, the
 * seed's `stableId` does not, and neither difference shows up here — the
 * column is `text` and nothing in this product parses an id as a UUID.
 *
 * **Anchored at the end on purpose.** A slug may legitimately contain
 * something id-shaped (a broker's own reference, a title quoting one), and
 * the id is always the tail.
 */
const TRAILING_ID = /(?:^|-)([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

/**
 * Lowercase, unaccented, hyphen-joined. Empty when nothing survives, which
 * is a real case rather than a defensive one: a publisher may write a title
 * made entirely of punctuation, and their advert still has to have a URL.
 */
export function slugify(value: string): string {
  const ascii = value
    // NFD splits an accented letter into its base plus a combining mark, so
    // stripping the marks leaves `a` for `á` and `n` for `ñ`. Done here
    // rather than with a character map because the map is the part that
    // goes stale the first time a title carries an accent nobody listed.
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (ascii.length <= MAX_SLUG_LENGTH) return ascii;

  const cut = ascii.slice(0, MAX_SLUG_LENGTH);
  const lastBoundary = cut.lastIndexOf("-");
  // No boundary at all means one word longer than the cap; cutting it
  // mid-word is still better than emitting a 200-character segment.
  return lastBoundary === -1 ? cut : cut.slice(0, lastBoundary);
}

export function buildListingPath({ cityName, zoneName, title, id }: ListingUrlParts): string {
  const slug = slugify(title);
  // The bare id when the title contributes nothing — never a dangling
  // hyphen, which would be the one shape this module's own parser has to
  // special-case.
  const tail = slug === "" ? id : `${slug}-${id}`;

  return `/alquiler/${slugify(cityName)}/${slugify(zoneName)}/${tail}`;
}

/**
 * The listing id carried by the last path segment, or `null` when the
 * segment is not one this module could have produced.
 *
 * **The null is the guard.** This value goes on to be a `WHERE id = $1`, so
 * a segment that merely looks plausible must be refused here rather than
 * handed to the database as a lookup key. Returning the id in its canonical
 * lowercase form matters for the same reason: `text` compares exactly in
 * Postgres, and an uppercased URL would otherwise produce an id that can
 * never match a row while looking entirely correct in a log.
 */
export function listingIdFromSlug(segment: string): string | null {
  const match = TRAILING_ID.exec(segment);

  return match?.[1] ? match[1].toLowerCase() : null;
}
