import { randomUUID } from "node:crypto";
import { and, count, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type * as schema from "../../../shared/db/schema";
import {
  cities,
  listingPhotoDerivatives,
  listingPhotos,
  listings,
  zones,
} from "../../../shared/db/schema";
import type {
  DraftForActivation,
  ListingActivationPort,
} from "../application/ports/listing-activation.port";
import type { ListingPhotoAttachmentPort } from "../application/ports/listing-photo-attachment.port";
import type {
  ListingRepositoryPort,
  NewListing,
  NewListingPhoto,
} from "../application/ports/listing-repository.port";
import type { ZoneCataloguePort } from "../application/ports/zone-catalogue.port";
import type { CuratedZone } from "../domain/publishable-listing";

/**
 * Drizzle adapters for the two publication ports (task 3.13).
 *
 * The database handle is injected rather than imported, and that is what
 * makes the integration test worth running: the deployment hands it a Neon
 * client, the test hands it a `node-postgres` client pointed at a real
 * Postgres container, and **both run this exact code**. Importing the client
 * here would have forced the test to prove something else.
 *
 * Typed as `PgDatabase` rather than either concrete driver for the same
 * reason — it is the shape both share.
 */
export type PublicationDatabase = PgDatabase<PgQueryResultHKT, typeof schema>;

export class DrizzleListingRepository implements ListingRepositoryPort {
  constructor(private readonly db: PublicationDatabase) {}

  async save(
    listing: NewListing,
  ): Promise<{ readonly id: string; readonly photoIds: readonly string[] }> {
    // Generated here rather than by the database so the photo rows can name
    // their parent inside the same transaction without a round trip to read
    // back what was just written.
    const id = randomUUID();
    const createdAt = listing.publishedAt;

    // Hoisted out of the transaction closure (task 4.7): the ids below
    // depend on nothing the database returns, so they are just as valid
    // read back out here, and `save`'s caller needs them in submission
    // order to record each photo's perceptual hash afterwards — see
    // `ListingRepositoryPort.save`'s own doc for why the order matters.
    const photoRows = listing.photos.map((photo) => ({
      id: randomUUID(),
      listingId: id,
      position: photo.position,
      createdAt,
    }));

    // One transaction, because a listing with no photo row is a state the
    // publish rules forbid — `photos.required`. Without this, a failure on
    // the second statement leaves exactly that state in the catalogue, and
    // nothing would ever report it.
    //
    // This is the call `neon-http` cannot serve, and the whole reason
    // transactional-client.ts exists.
    await this.db.transaction(async (tx) => {
      await tx.insert(listings).values({
        id,
        publisherId: listing.publisherId,
        // No `?? "owner"` here, ever. The column is NOT NULL with no default
        // precisely so a missing value fails loudly instead of publishing
        // someone as an owner they never claimed to be.
        publisherType: listing.publisherType,
        // Misma regla, misma razón: sin default, para que el olvido sea un
        // error al insertar y no un anexo publicado como apartamento.
        propertyType: listing.propertyType,
        cityId: listing.cityId,
        zoneId: listing.zoneId,
        title: listing.title,
        description: listing.description,
        priceUsd: listing.priceUsd,
        rooms: listing.rooms,
        areaM2: listing.areaM2,
        bathrooms: listing.bathrooms,
        parkingSpots: listing.parkingSpots,
        hasPowerPlant: listing.hasPowerPlant,
        hasRegularWater: listing.hasRegularWater,
        isFurnished: listing.isFurnished,
        hasSecurity: listing.hasSecurity,
        hasAppliances: listing.hasAppliances,
        contactMethod: listing.contactMethod,
        contactValue: listing.contactValue,
        status: listing.status,
        // broker-bulk-import spec, "Idempotent Import by External
        // Reference" (tasks.md 9.17): `?? null`, never omitted — Drizzle
        // would otherwise leave the column at its schema default (also
        // `NULL` here), but writing it explicitly is what makes it visible
        // at this call site that the single-listing flow's `undefined`
        // really does mean "no reference", not "forgot to pass one".
        externalReference: listing.externalReference ?? null,
        publishedAt: listing.publishedAt,
        expiresAt: listing.expiresAt,
      });

      // `photoRows` is generated above, outside this transaction — las
      // derivadas necesitan apuntar a su foto, y volver a leerlas de la base
      // para averiguar qué id les tocó sería un viaje de red por una
      // respuesta que ya tenemos.
      //
      // A published listing always has at least one photo (`photos.required`
      // — see publishable-listing.ts), so this was never empty before now.
      // An imported DRAFT (tasks.md 9.15/9.17) is created with zero — photos
      // attach afterwards through the existing upload path (9.20-9.23) — and
      // `.values([])` is a Drizzle error, not a no-op, so the empty case has
      // to be guarded explicitly rather than assumed away.
      if (photoRows.length > 0) {
        await tx.insert(listingPhotos).values(photoRows);
      }

      // Dentro de la MISMA transacción, que es la razón por la que el
      // repositorio recibe todo junto: una foto sin sus derivadas es una foto
      // que ninguna pantalla puede dibujar.
      const derivativeRows = listing.photos.flatMap((photo, index) =>
        photo.derivatives.map((derivative) => ({
          photoId: photoRows[index]!.id,
          name: derivative.name,
          key: derivative.key,
          bytes: derivative.byteLength,
        })),
      );
      if (derivativeRows.length > 0) {
        await tx.insert(listingPhotoDerivatives).values(derivativeRows);
      }
    });

    return { id, photoIds: photoRows.map((row) => row.id) };
  }
}

/**
 * broker-bulk-import spec, "Drafts Are Not Published Listings" (tasks.md
 * 9.18/9.19) — the read/write pair `activate-listing.ts` needs, kept
 * separate from `DrizzleListingRepository` per AGENTS.md §3: `save` inserts,
 * this reads-then-flips an existing row, and the two never need to change
 * together.
 */
export class DrizzleListingActivation implements ListingActivationPort, ListingPhotoAttachmentPort {
  constructor(private readonly db: PublicationDatabase) {}

  /**
   * `status = 'draft'` lives IN the `WHERE`, exactly like `findRevealable`'s
   * `status = 'active'` (contact-reveal) — never a plain `id = $1` filtered
   * afterwards in TypeScript. An already-active, expired, hidden, or
   * nonexistent id all come back `null` here, which is what lets
   * `activateListing` treat "not a draft" and "does not exist" as the exact
   * same case.
   */
  async findDraftById(listingId: string): Promise<DraftForActivation | null> {
    const rows = await this.db
      .select({
        id: listings.id,
        publisherId: listings.publisherId,
        publisherType: listings.publisherType,
        propertyType: listings.propertyType,
        cityId: listings.cityId,
        zoneId: listings.zoneId,
        title: listings.title,
        description: listings.description,
        priceUsd: listings.priceUsd,
        rooms: listings.rooms,
        areaM2: listings.areaM2,
        bathrooms: listings.bathrooms,
        parkingSpots: listings.parkingSpots,
        hasPowerPlant: listings.hasPowerPlant,
        hasRegularWater: listings.hasRegularWater,
        isFurnished: listings.isFurnished,
        hasSecurity: listings.hasSecurity,
        hasAppliances: listings.hasAppliances,
        contactMethod: listings.contactMethod,
        contactValue: listings.contactValue,
      })
      .from(listings)
      .where(and(eq(listings.id, listingId), eq(listings.status, "draft")))
      .limit(1);

    const row = rows[0];
    if (!row) return null;

    const photoCountRows = await this.db
      .select({ photoCount: count() })
      .from(listingPhotos)
      .where(eq(listingPhotos.listingId, listingId));

    return { ...row, photoCount: photoCountRows[0]?.photoCount ?? 0 };
  }

  /**
   * Compare-and-swap, same idiom as `DrizzleLifecycleListings.renew`:
   * `status = 'draft'` guards the `UPDATE` itself, not only the read that
   * preceded it, so two simultaneous activations of the same draft cannot
   * both believe they won.
   */
  async activate(listingId: string, publishedAt: Date, expiresAt: Date): Promise<boolean> {
    const updated = await this.db
      .update(listings)
      .set({ status: "active", publishedAt, expiresAt })
      .where(and(eq(listings.id, listingId), eq(listings.status, "draft")))
      .returning({ id: listings.id });

    return updated.length > 0;
  }

  /**
   * broker-bulk-import spec, "Photos Attached Through the Existing Upload
   * Path" (tasks.md 9.20/9.21) — `ListingPhotoAttachmentPort`'s only method.
   * Same shape as `save`'s photo insert (one transaction, guarded against
   * `.values([])`), except this targets an EXISTING listing row one photo
   * at a time rather than inserting a brand-new one — `attachPhotoToDraft`
   * already proved ownership and the ceiling before this is ever called,
   * so this method carries no lookup of its own.
   */
  async attachPhoto(
    listingId: string,
    photo: NewListingPhoto,
    createdAt: Date,
  ): Promise<{ readonly photoId: string }> {
    const photoId = randomUUID();

    await this.db.transaction(async (tx) => {
      await tx.insert(listingPhotos).values({
        id: photoId,
        listingId,
        position: photo.position,
        createdAt,
      });

      const derivativeRows = photo.derivatives.map((derivative) => ({
        photoId,
        name: derivative.name,
        key: derivative.key,
        bytes: derivative.byteLength,
      }));
      // Mirrors `save`'s own guard: `.values([])` is a Drizzle runtime
      // error, not a no-op (tasks.md 9.15's own lesson, slice C).
      if (derivativeRows.length > 0) {
        await tx.insert(listingPhotoDerivatives).values(derivativeRows);
      }
    });

    return { photoId };
  }
}

export class DrizzleZoneCatalogue implements ZoneCataloguePort {
  constructor(private readonly db: PublicationDatabase) {}

  /**
   * Joined against `city` rather than read from `zone` alone. A zone row
   * whose city has been removed would otherwise still validate a draft, and
   * the insert would then fail on `listing`'s foreign key — a 500 in place of
   * the `cityId.unknown` the publisher can act on.
   */
  async listZonesForCity(cityId: string): Promise<readonly CuratedZone[]> {
    return this.db
      .select({ id: zones.id, cityId: zones.cityId })
      .from(zones)
      .innerJoin(cities, eq(cities.id, zones.cityId))
      .where(eq(zones.cityId, cityId));
  }
}
