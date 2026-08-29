import { describe, expect, it, vi } from "vitest";
import type { SessionPort } from "../../identity/application/ports/session.port";
import type {
  ContactVerificationEvidencePort,
  NewVerifiedContact,
  VerifiedContactPort,
} from "../../identity/application/ports/verified-contact.port";
import { UnauthenticatedError } from "../../identity/application/require-authenticated-session";
import type {
  NewPhotoHash,
  PhotoHashMatch,
  PhotoHashPort,
} from "../../listing-trust/application/ports/photo-hash.port";
import { toPerceptualHash } from "../../listing-trust/domain/perceptual-hash";
import { MAX_PHOTOS_PER_LISTING } from "../domain/publishable-listing";
import type { ListingRepositoryPort, NewListing } from "./ports/listing-repository.port";
import type { PhotoDerivationPort } from "./ports/photo-derivation.port";
import type { PhotoHashComputationPort } from "./ports/photo-hash-computation.port";
import type { PhotoStoragePort, StoredObject, UploadTarget } from "./ports/photo-storage.port";
import type { ZoneCataloguePort } from "./ports/zone-catalogue.port";
import { RejectedUploadError } from "./process-uploaded-photo";
import {
  LISTING_ACTIVE_DAYS,
  type PublishListingDependencies,
  PublishRejectedError,
  present,
  publishListing,
} from "./publish-listing";

/**
 * Task 3.5 — the use case that finally joins the pieces: the session gate,
 * the publish rules, the photo pipeline and the write.
 *
 * The rules themselves are proven in publishable-listing.test.ts and the
 * photo pipeline in process-uploaded-photo.test.ts. What is asserted HERE is
 * only what this layer decides: the ORDER those run in, where each value
 * comes from, and what must not happen when one of them refuses.
 */

const PUBLISHER = "usr_9a4c";
const CITY = "city-distrito-capital";
const ZONE = "zone-chacao";
const NOW = new Date("2026-08-17T15:00:00.000Z");

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]);
const DESCRIPTION = "a".repeat(140);

function photoKey(index: number): string {
  return `incoming/${PUBLISHER}/${String(index).padStart(32, "0")}`;
}

function submittedPhotos(count: number) {
  return Array.from({ length: count }, (_unused, index) => ({
    incomingKey: photoKey(index),
    declaredContentType: "image/png",
  }));
}

const PUBLISHER_EMAIL = "publisher@example.com";
const EMAIL_VERIFIED_AT = new Date("2026-06-01T07:00:00.000Z");

const sessionPort: SessionPort = {
  async getSession() {
    return { userId: PUBLISHER, email: PUBLISHER_EMAIL, name: "Publisher" };
  },
};

/** La cuenta entró por el enlace del correo, así que Auth.js dejó el instante. */
const contactEvidence: ContactVerificationEvidencePort = {
  async findEvidence() {
    return {
      verifiedAt: null,
      accountEmail: PUBLISHER_EMAIL,
      accountEmailVerifiedAt: EMAIL_VERIFIED_AT,
    };
  },
};

function makeVerifiedContacts(): VerifiedContactPort & { readonly written: NewVerifiedContact[] } {
  const written: NewVerifiedContact[] = [];
  return {
    written,
    async record(verified) {
      written.push(verified);
    },
  };
}

const zones: ZoneCataloguePort = {
  async listZonesForCity(cityId: string) {
    return cityId === CITY ? [{ id: ZONE, cityId: CITY }] : [];
  },
};

/** Records how many derivations were ever in flight at the same time. */
function makeDerive() {
  let inFlight = 0;
  let peak = 0;
  const derive: PhotoDerivationPort = async () => {
    inFlight += 1;
    peak = Math.max(peak, inFlight);
    await Promise.resolve();
    inFlight -= 1;
    // Real-length buffers, because the size that reaches `listing_photo` is
    // the one storage MEASURES, not the one the derivation claims — a stub
    // whose two numbers disagreed is what proved that.
    return {
      thumb: { bytes: new Uint8Array(4000), byteLength: 4000 },
      card: { bytes: new Uint8Array(12000), byteLength: 12000 },
      strip: { bytes: new Uint8Array(30000), byteLength: 30000 },
      detail: { bytes: new Uint8Array(50000), byteLength: 50000 },
      full: { bytes: new Uint8Array(110000), byteLength: 110000 },
    };
  };
  return { derive, peak: () => peak };
}

function makeStorage(): PhotoStoragePort & { readonly reads: string[] } {
  const reads: string[] = [];
  return {
    reads,
    async createUploadTarget(): Promise<UploadTarget> {
      throw new Error("not used by this use case");
    },
    async read(key: string) {
      reads.push(key);
      return PNG;
    },
    async put(key: string, bytes: Uint8Array): Promise<StoredObject> {
      return { key, byteLength: bytes.byteLength };
    },
    async remove() {},
  };
}

function makeRepository(): ListingRepositoryPort & { readonly saved: NewListing[] } {
  const saved: NewListing[] = [];
  return {
    saved,
    async save(listing: NewListing) {
      saved.push(listing);
      // One id per submitted photo, in order — the same shape
      // DrizzleListingRepository.save now returns (task 4.7).
      return {
        id: "lst_001",
        photoIds: listing.photos.map((_photo, index) => `photo_${index}`),
      };
    },
  };
}

/** design.md D4 — an arbitrary, fixed 64-bit value. */
const SOME_HASH = toPerceptualHash(0x00000000000000ffn);
const computeHash: PhotoHashComputationPort = async () => SOME_HASH;

/** No stored photo ever matches, and every `record` call is kept for assertions. */
function noMatchPhotoHashes(): PhotoHashPort & { readonly recorded: NewPhotoHash[] } {
  const recorded: NewPhotoHash[] = [];
  return {
    recorded,
    async findMatchesFromOtherPublishers(): Promise<PhotoHashMatch[]> {
      return [];
    },
    async record(newHash: NewPhotoHash): Promise<void> {
      recorded.push(newHash);
    },
  };
}

/**
 * Generic in the overrides so a test that replaces one dependency keeps the
 * recording types of the others — `dependencies.listings.saved` stays visible
 * without a cast, and a cast is what would let a stub silently lose its
 * recorder.
 */
function deps<T extends Partial<PublishListingDependencies>>(overrides: T = {} as T) {
  return {
    sessionPort,
    zones,
    listings: makeRepository(),
    storage: makeStorage(),
    derive: makeDerive().derive,
    computeHash,
    photoHashes: noMatchPhotoHashes(),
    contactEvidence,
    verifiedContacts: makeVerifiedContacts(),
    now: () => NOW,
    ...overrides,
  };
}

function request(overrides: Record<string, unknown> = {}) {
  return {
    publisherType: "owner" as const,
    propertyType: "apartamento" as const,
    title: "Apartamento 2 habitaciones con puesto de estacionamiento",
    description: DESCRIPTION,
    priceUsd: 520,
    cityId: CITY,
    zoneId: ZONE,
    rooms: 2,
    areaM2: 78,
    bathrooms: 2,
    parkingSpots: 1,
    contactMethod: "whatsapp" as const,
    contactValue: "04121234567",
    photos: submittedPhotos(1),
    ...overrides,
  };
}

describe("publishListing", () => {
  it("writes one active listing dated from the session's clock", async () => {
    const dependencies = deps();

    const { listingId } = await publishListing(request(), dependencies);

    expect(listingId).toBe("lst_001");
    const [saved] = dependencies.listings.saved;
    expect(saved).toMatchObject({
      publisherId: PUBLISHER,
      publisherType: "owner",
      cityId: CITY,
      zoneId: ZONE,
      priceUsd: 520,
      rooms: 2,
      areaM2: 78,
      status: "active",
      publishedAt: NOW,
    });
  });

  it("stores zero parking when the draft never mentioned it", async () => {
    const dependencies = deps();

    await publishListing(request({ parkingSpots: undefined }), dependencies);

    // The one field read through `??` instead of `present()`. Every other
    // column throws when it arrives undefined, because a missing value there
    // means the validator stopped covering it -- but "no parking" is a real
    // answer, so a draft that omits it is complete, and the row still gets
    // the number artboard 2b's strip has to render.
    expect(dependencies.listings.saved[0]?.parkingSpots).toBe(0);
    expect(dependencies.listings.saved[0]?.bathrooms).toBe(2);
  });

  it("expires the listing 30 days after publication", async () => {
    const dependencies = deps();

    await publishListing(request(), dependencies);

    const { publishedAt, expiresAt } = dependencies.listings.saved[0] as NewListing;
    const elapsedDays = (expiresAt.getTime() - publishedAt.getTime()) / 86_400_000;
    expect(elapsedDays).toBe(LISTING_ACTIVE_DAYS);
  });

  it("takes the publisher from the session, never from the request body", async () => {
    const dependencies = deps();

    await publishListing({ ...request(), publisherId: "usr_someone_else" } as never, dependencies);

    // A publisher id accepted from the request is an account-impersonation
    // hole one careless form field wide.
    expect(dependencies.listings.saved[0]?.publisherId).toBe(PUBLISHER);
  });

  it("refuses an unauthenticated caller before reading anything", async () => {
    const dependencies = deps({
      sessionPort: {
        async getSession() {
          return null;
        },
      },
    });

    await expect(publishListing(request(), dependencies)).rejects.toThrow(UnauthenticatedError);
    expect(dependencies.storage.reads).toEqual([]);
    expect(dependencies.listings.saved).toEqual([]);
  });

  it("reports every publish violation without touching a single photo", async () => {
    const dependencies = deps();
    const spy = vi.fn(dependencies.derive);

    const failure = await publishListing(
      request({ publisherType: undefined, priceUsd: -5, rooms: undefined }),
      { ...dependencies, derive: spy },
    ).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(PublishRejectedError);
    expect((failure as PublishRejectedError).violations).toEqual(
      expect.arrayContaining(["publisherType.required", "priceUsd.invalid", "rooms.required"]),
    );
    // Validation is cheap and photo processing is not: a network read and a
    // decode per photo. Running them for a draft that was never publishable
    // spends a serverless invocation on an answer already known.
    expect(dependencies.storage.reads).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
    expect(dependencies.listings.saved).toEqual([]);
  });

  it("counts photos from the submitted array, so an empty one is rejected", async () => {
    const dependencies = deps();

    const failure = await publishListing(request({ photos: [] }), dependencies).catch(
      (error: unknown) => error,
    );

    expect((failure as PublishRejectedError).violations).toContain("photos.required");
  });

  it("refuses more photos than a listing may hold, before processing any", async () => {
    const dependencies = deps();

    const failure = await publishListing(
      request({ photos: submittedPhotos(MAX_PHOTOS_PER_LISTING + 1) }),
      dependencies,
    ).catch((error: unknown) => error);

    expect((failure as PublishRejectedError).violations).toContain("photos.tooMany");
    expect(dependencies.storage.reads).toEqual([]);
  });

  it("numbers photo positions from zero in submission order", async () => {
    const dependencies = deps();

    await publishListing(request({ photos: submittedPhotos(3) }), dependencies);

    expect(dependencies.listings.saved[0]?.photos.map((photo) => photo.position)).toEqual([
      0, 1, 2,
    ]);
    expect(dependencies.storage.reads).toEqual([photoKey(0), photoKey(1), photoKey(2)]);
  });

  it("stores the keys and measured sizes the pipeline produced", async () => {
    const dependencies = deps();

    await publishListing(request(), dependencies);

    const token = photoKey(0).split("/")[2];
    expect(dependencies.listings.saved[0]?.photos[0]).toEqual({
      position: 0,
      // Las cinco, cada una a su propia clave. Antes eran dos campos planos, y
      // esa forma congelaba el número de derivadas en el tipo.
      derivatives: [
        { name: "thumb", key: `photos/${PUBLISHER}/${token}/thumb.webp`, byteLength: 4000 },
        { name: "card", key: `photos/${PUBLISHER}/${token}/card.webp`, byteLength: 12000 },
        { name: "strip", key: `photos/${PUBLISHER}/${token}/strip.webp`, byteLength: 30000 },
        { name: "detail", key: `photos/${PUBLISHER}/${token}/detail.webp`, byteLength: 50000 },
        { name: "full", key: `photos/${PUBLISHER}/${token}/full.webp`, byteLength: 110000 },
      ],
    });
  });

  it("decodes photos one at a time", async () => {
    const { derive, peak } = makeDerive();
    const dependencies = deps({ derive });

    await publishListing(request({ photos: submittedPhotos(4) }), dependencies);

    // Six concurrent `sharp` decodes against a serverless function's fixed
    // memory ceiling is how the publish route dies under its own load, and it
    // would die on the largest uploads — the ones that matter most.
    expect(peak()).toBe(1);
  });

  it("writes nothing when one photo is refused", async () => {
    const dependencies = deps({
      storage: {
        ...makeStorage(),
        async read() {
          return new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
        },
      },
    });

    await expect(publishListing(request(), dependencies)).rejects.toThrow();
    expect(dependencies.listings.saved).toEqual([]);
  });

  it("does not consult the zone catalogue when no city was chosen", async () => {
    const listZonesForCity = vi.fn(zones.listZonesForCity);

    const failure = await publishListing(
      request({ cityId: undefined }),
      deps({
        zones: { listZonesForCity },
      }),
    ).catch((error: unknown) => error);

    expect((failure as PublishRejectedError).violations).toContain("cityId.required");
    expect(listZonesForCity).not.toHaveBeenCalled();
  });

  it("uses the real clock when none is injected", async () => {
    const { now: _injected, ...dependencies } = deps();
    const before = Date.now();

    await publishListing(request(), dependencies);

    const publishedAt = (dependencies.listings.saved[0] as NewListing).publishedAt.getTime();
    expect(publishedAt).toBeGreaterThanOrEqual(before);
    expect(publishedAt).toBeLessThanOrEqual(Date.now());
  });

  describe("present — the backstop for a defect already shipped", () => {
    // Unreachable through `publishListing`, and that is the point: every path
    // is supposed to make it unreachable. Proven directly instead, because a
    // backstop nothing exercises is not a backstop — which is precisely how
    // rooms and area_m2 went unvalidated in the first place.
    it("throws naming the field the validator stopped covering", () => {
      expect(() => present(undefined, "areaM2")).toThrow(/areaM2/);
      expect(() => present(undefined, "areaM2")).toThrow(/no longer covers/);
    });

    it("passes falsy-but-present values through untouched", () => {
      // Zero and the empty string are refused by the validator, not by this.
      // A truthiness check here would turn a validation failure into an
      // unexplained 500 at exactly the wrong layer.
      expect(present(0, "priceUsd")).toBe(0);
      expect(present("", "title")).toBe("");
    });
  });

  it("asks only for the zones of the city being published to", async () => {
    const listZonesForCity = vi.fn(zones.listZonesForCity);

    await publishListing(request(), deps({ zones: { listZonesForCity } }));

    // Loading every curated zone in the country to validate one of them grows
    // with the catalogue for no gain.
    expect(listZonesForCity).toHaveBeenCalledExactlyOnceWith(CITY);
  });

  /**
   * Task 4.7 — the wiring listing-trust spec's own headline requirements
   * ("Cross-Account Duplicate Photo Rejection", "Same-Publisher Photo Reuse
   * Exemption") depended on and never had. `PublishListingUseCase` is
   * design.md D4's own named choke point for this check.
   */
  describe("D4 — cross-account perceptual-hash duplicate rejection", () => {
    it("rejects the WHOLE submission when a photo matches another publisher's, and creates no listing", async () => {
      const photoHashes: PhotoHashPort = {
        async findMatchesFromOtherPublishers() {
          return [
            { photoId: "stolen", listingId: "listing-x", publisherId: "someone-else", distance: 1 },
          ];
        },
        async record() {
          throw new Error("record must never fire when the submission is rejected");
        },
      };
      const dependencies = deps({ photoHashes });

      await expect(publishListing(request(), dependencies)).rejects.toBeInstanceOf(
        RejectedUploadError,
      );

      // The spec's own words: "rejects the listing submission" — not just
      // the offending photo. No row anywhere.
      expect(dependencies.listings.saved).toEqual([]);
    });

    it("records every photo's hash AFTER listings.save resolves, keyed to the real persisted photo id", async () => {
      const photoHashes = noMatchPhotoHashes();
      const dependencies = deps({ photoHashes });

      await publishListing(request({ photos: submittedPhotos(2) }), dependencies);

      expect(photoHashes.recorded).toEqual([
        { photoId: "photo_0", hash: SOME_HASH, recordedAt: NOW },
        { photoId: "photo_1", hash: SOME_HASH, recordedAt: NOW },
      ]);
    });

    it("never records before the listing exists — recording follows save, not the other way around", async () => {
      const order: string[] = [];
      const listings: ListingRepositoryPort = {
        async save(listing) {
          order.push("save");
          return { id: "lst_001", photoIds: listing.photos.map((_p, i) => `photo_${i}`) };
        },
      };
      const photoHashes: PhotoHashPort = {
        async findMatchesFromOtherPublishers() {
          return [];
        },
        async record() {
          order.push("record");
        },
      };

      await publishListing(request(), deps({ listings, photoHashes }));

      expect(order).toEqual(["save", "record"]);
    });

    it("passes the same-publisher exemption from the session, so republishing one's own photo is allowed", async () => {
      const seenExclusions: string[] = [];
      const photoHashes: PhotoHashPort = {
        async findMatchesFromOtherPublishers(_hash, excludePublisherId) {
          seenExclusions.push(excludePublisherId);
          return [];
        },
        async record() {},
      };

      const { listingId } = await publishListing(request(), deps({ photoHashes }));

      expect(listingId).toBe("lst_001");
      expect(seenExclusions).toEqual([PUBLISHER]);
    });
  });

  /**
   * tasks.md 19.9/19.10. Lo que se prueba acá NO es la regla —eso vive en
   * `contact-verification.test.ts`— sino que este caso de uso le pasa el
   * triple de verdad: el `userId` de la SESIÓN y el contacto que además copia
   * al aviso. Es la trampa que este proyecto ya se comió: un módulo con todas
   * sus pruebas verdes y muerto en producción porque quien lo llama nunca le
   * pasó el argumento.
   */
  describe("verificación del contacto (19.9/19.10)", () => {
    it("registra el correo de la cuenta con el mismo triple que copia al aviso", async () => {
      const verifiedContacts = makeVerifiedContacts();

      await publishListing(
        request({ contactMethod: "email", contactValue: PUBLISHER_EMAIL }),
        deps({ verifiedContacts }),
      );

      expect(verifiedContacts.written).toEqual([
        {
          userId: PUBLISHER,
          contact: { method: "email", value: PUBLISHER_EMAIL },
          verifiedAt: EMAIL_VERIFIED_AT,
        },
      ]);
    });

    it("no deja ninguna fila cuando el contacto es un teléfono, y publica igual", async () => {
      // El canal de WhatsApp está diferido al final del proyecto (fundador,
      // 2026-08-29). Cerrar la publicación por teléfono sería un retroceso de
      // producto, no un cierre en falso; lo que cierra en falso es que no
      // quede fila, porque sin fila nada puede dibujar «verificado».
      const verifiedContacts = makeVerifiedContacts();

      const { listingId } = await publishListing(
        request({ contactMethod: "whatsapp", contactValue: "04121234567" }),
        deps({ verifiedContacts }),
      );

      expect(listingId).toBe("lst_001");
      expect(verifiedContacts.written).toEqual([]);
    });
  });
});
