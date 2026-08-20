import type { ContactMethod, PublisherType } from "../../domain/publishable-listing";

/**
 * Persistence for a published listing and its photos.
 *
 * **One method taking both, on purpose.** A listing with no photo row is not
 * a valid listing — `photos.required` is a publish rule — so a port offering
 * `saveListing` and `savePhoto` separately would let a caller create exactly
 * that state whenever the second call failed, and nothing would ever notice.
 * Handing the adapter everything at once is what lets it use one transaction.
 */

export interface NewListingPhoto {
  /** Zero-based display order; the publisher chose it and it must survive. */
  readonly position: number;
  readonly thumbnailKey: string;
  readonly detailKey: string;
  readonly thumbnailBytes: number;
  readonly detailBytes: number;
}

/**
 * Every column `listing` requires, with no optional field anywhere. That is
 * deliberate: `publisher_type` is NOT NULL with no default precisely so a
 * forgotten value fails loudly instead of publishing everyone as an owner,
 * and an optional property here would hand that back at the type level.
 */
export interface NewListing {
  readonly publisherId: string;
  readonly publisherType: PublisherType;
  readonly cityId: string;
  readonly zoneId: string;
  readonly title: string;
  readonly description: string;
  readonly priceUsd: number;
  readonly rooms: number;
  readonly areaM2: number;
  readonly bathrooms: number;
  /**
   * Required HERE even though the draft may omit it: by this layer the form's
   * default has already been applied, and a row without it renders a blank
   * cell in artboard 2b's four-cell strip.
   */
  readonly parkingSpots: number;
  /** Only `active` is reachable from publication; the rest are lifecycle. */
  /** Copied at publish time; editing the account default never rewrites it. */
  readonly contactMethod: ContactMethod;
  readonly contactValue: string;
  readonly status: "active";
  readonly publishedAt: Date;
  readonly expiresAt: Date;
  readonly photos: readonly NewListingPhoto[];
}

export interface ListingRepositoryPort {
  save(listing: NewListing): Promise<{ readonly id: string }>;
}
