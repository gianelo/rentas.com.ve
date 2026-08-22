import type { ContactMethod } from "../../domain/revealable-contact";

/**
 * Everything the reveal needs to know about a listing, and nothing else. It
 * is one method returning one row so the use case cannot accidentally read
 * the catalogue: no search, no listing-by-publisher, no photos.
 *
 * **The gap this port was written around is now closed.** It used to carry a
 * single `whatsapp` field and a note saying no column stored it. Both are
 * gone: `listing.contact_method` and `listing.contact_value` ship NOT NULL,
 * copied at publish time so editing an account default never rewrites an
 * advert somebody already wrote to.
 *
 * They are TWO fields rather than one because the founder decided the
 * publisher picks the channel (2026-08-18): "el valor que quiera mostrar la
 * persona. Sea email, WhatsApp o número de teléfono." Collapsing them back
 * into one string would lose the method, and the method is what the reveal
 * button's label is made of — a listing that says "Ver WhatsApp" while
 * holding an address is a promise the product does not keep.
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
  readonly contactMethod: ContactMethod;
  readonly contactValue: string;
}

export interface RevealableListingPort {
  findRevealable(listingId: string): Promise<RevealableListing | null>;
}
