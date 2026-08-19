/**
 * Everything the reveal needs to know about a listing, and nothing else. It
 * is one method returning one row so the use case cannot accidentally read
 * the catalogue: no search, no listing-by-publisher, no photos.
 *
 * **OPEN, and deliberately not papered over:** no column stores the
 * publisher's WhatsApp number yet — the design's Data Model does not list
 * one, and adding it means altering `listing` or `user`, which is outside
 * this slice. So this port ships without a Drizzle adapter: the write side
 * (`ContactRevealEventPort`) is what task 6.5 needs against real Postgres,
 * and this read side is proven with a fake until the column exists. Naming
 * the field here rather than omitting it keeps the gap visible instead of
 * turning it into a discovery for whoever writes the reveal route.
 *
 * `findRevealable` returning `null` covers unknown, draft and removed alike:
 * the caller has one branch to handle, and a listing excluded from reveal
 * (design.md: `draft` is excluded from search, from contact reveal, and from
 * the expiry clock) cannot be distinguished from a missing one by anyone
 * probing URLs.
 */
export interface RevealableListing {
  readonly listingId: string;
  readonly publisherId: string;
  readonly cityId: string;
  readonly whatsapp: string;
}

export interface RevealableListingPort {
  findRevealable(listingId: string): Promise<RevealableListing | null>;
}
