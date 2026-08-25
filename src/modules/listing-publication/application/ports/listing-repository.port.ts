import type { ContactMethod, PropertyType, PublisherType } from "../../domain/publishable-listing";
import type { DerivativeName } from "./photo-derivation.port";

/**
 * Persistence for a published listing and its photos.
 *
 * **One method taking both, on purpose.** A listing with no photo row is not
 * a valid listing — `photos.required` is a publish rule — so a port offering
 * `saveListing` and `savePhoto` separately would let a caller create exactly
 * that state whenever the second call failed, and nothing would ever notice.
 * Handing the adapter everything at once is what lets it use one transaction.
 */

export interface NewPhotoDerivative {
  readonly name: DerivativeName;
  readonly key: string;
  readonly byteLength: number;
}

export interface NewListingPhoto {
  /** Orden de exhibición, base cero: lo eligió quien publica y debe sobrevivir. */
  readonly position: number;
  /**
   * **Una lista, no cuatro campos planos.** Eran `thumbnailKey`,
   * `detailKey` y sus dos tamaños, y esa forma congelaba el número de
   * derivadas en dos. El diseño nuevo pide cinco, y agregar una sexta mañana
   * ya no toca ni este tipo ni el esquema.
   */
  readonly derivatives: readonly NewPhotoDerivative[];
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
  readonly propertyType: PropertyType;
  readonly cityId: string;
  readonly zoneId: string;
  readonly title: string;
  readonly description: string;
  readonly priceUsd: number;
  readonly rooms: number;
  readonly areaM2: number;
  readonly bathrooms: number;
  /**
   * Los cinco de la F6. Sin `?`, por la misma razón que el resto de este
   * archivo: registran una DECLARACIÓN, y "no lo declaró" es `false`, no
   * ausente. Un opcional acá dejaría a la importación de cartera publicando
   * filas donde nadie distingue lo uno de lo otro.
   */
  readonly hasPowerPlant: boolean;
  readonly hasRegularWater: boolean;
  readonly isFurnished: boolean;
  readonly hasSecurity: boolean;
  readonly hasAppliances: boolean;
  /**
   * Required HERE even though the draft may omit it: by this layer the form's
   * default has already been applied, and a row without it renders a blank
   * cell in artboard 2b's four-cell strip.
   */
  readonly parkingSpots: number;
  /** Copied at publish time; editing the account default never rewrites it. */
  readonly contactMethod: ContactMethod;
  readonly contactValue: string;
  /**
   * `"active"` from the single-listing flow (`publishListing` always sets
   * this). `"draft"` from broker bulk import (tasks.md 9.15/9.17) — a row
   * that exists but is not yet searchable, revealable, or on the expiry
   * clock (broker-bulk-import spec, "Drafts Are Not Published Listings").
   * Widened here rather than adding a second write path, per Phase 9's own
   * header note: "Creates no write path of its own into `listing`."
   */
  readonly status: "active" | "draft";
  readonly publishedAt: Date;
  readonly expiresAt: Date;
  readonly photos: readonly NewListingPhoto[];
  /**
   * broker-bulk-import spec, "Idempotent Import by External Reference"
   * (tasks.md 9.1/9.17). `undefined` for the single-listing flow — never set
   * by `publishListing` — and the value the unique
   * `(publisher_id, external_reference)` index enforces for an imported row.
   */
  readonly externalReference?: string;
}

export interface ListingRepositoryPort {
  save(listing: NewListing): Promise<{ readonly id: string }>;
}
