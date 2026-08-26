import type { ContactMethod, PropertyType, PublisherType } from "../../domain/publishable-listing";

/**
 * broker-bulk-import spec, "Drafts Are Not Published Listings" (tasks.md
 * 9.18/9.19). Everything `validatePublishableListing("activation")` needs
 * about a stored draft, plus the two facts activation itself decides on:
 * who owns it (`publisherId`) and how many photos it actually has
 * (`photoCount` — a draft is created with zero, tasks.md 9.15, and photos
 * attach afterwards through 9.20-9.23's upload path).
 *
 * **A read port beside `ListingRepositoryPort`, not a widening of it**
 * (AGENTS.md §3: "add a read port beside it; do not widen the write one").
 * `ListingRepositoryPort.save` inserts a brand-new row; activation reads an
 * existing one and flips it in place. Those are different operations on the
 * same table, and folding the second into the first port would make every
 * caller of `save` carry activation's shape for no reason.
 */
export interface DraftForActivation {
  readonly id: string;
  readonly publisherId: string;
  readonly publisherType: PublisherType;
  readonly propertyType: PropertyType;
  readonly cityId: string;
  readonly zoneId: string;
  readonly title: string;
  readonly description: string;
  readonly priceUsd: number;
  readonly rooms: number;
  readonly areaM2: number;
  readonly bathrooms: number;
  readonly parkingSpots: number;
  readonly hasPowerPlant: boolean;
  readonly hasRegularWater: boolean;
  readonly isFurnished: boolean;
  readonly hasSecurity: boolean;
  readonly hasAppliances: boolean;
  readonly contactMethod: ContactMethod;
  readonly contactValue: string;
  readonly photoCount: number;
}

export interface ListingActivationPort {
  /**
   * **Scoped to `status = 'draft'` in the query itself, not filtered
   * afterwards.** A listing that exists but is already `active`, `expired`,
   * `hidden`, or belongs to nobody at all all collapse to the same `null` —
   * the same "unknown, draft and removed alike" idiom
   * `RevealableListingPort.findRevealable` already uses. There is no second
   * activation of an already-active listing to reason about, because the
   * query never hands one back.
   */
  findDraftById(listingId: string): Promise<DraftForActivation | null>;

  /**
   * The compare-and-swap `renew` and `record`'s idempotent insert already
   * established for this codebase: `true` if the row was still a draft at
   * the moment of the `UPDATE` and is now active, `false` if it had already
   * been activated (by a concurrent request racing the same draft) between
   * the read above and this write. Never a bare `UPDATE ... WHERE id = $1`
   * — the `status = 'draft'` guard has to be IN the write, not only in the
   * read that preceded it, or two simultaneous activations of the same
   * draft could both believe they won.
   */
  activate(listingId: string, publishedAt: Date, expiresAt: Date): Promise<boolean>;
}
