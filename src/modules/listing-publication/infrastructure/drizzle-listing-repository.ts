import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type * as schema from "../../../shared/db/schema";
import { cities, listingPhotos, listings, zones } from "../../../shared/db/schema";
import type {
  ListingRepositoryPort,
  NewListing,
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

  async save(listing: NewListing): Promise<{ readonly id: string }> {
    // Generated here rather than by the database so the photo rows can name
    // their parent inside the same transaction without a round trip to read
    // back what was just written.
    const id = randomUUID();
    const createdAt = listing.publishedAt;

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
        publishedAt: listing.publishedAt,
        expiresAt: listing.expiresAt,
      });

      await tx.insert(listingPhotos).values(
        listing.photos.map((photo) => ({
          id: randomUUID(),
          listingId: id,
          position: photo.position,
          thumbnailKey: photo.thumbnailKey,
          detailKey: photo.detailKey,
          thumbnailBytes: photo.thumbnailBytes,
          detailBytes: photo.detailBytes,
          createdAt,
        })),
      );
    });

    return { id };
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
