import { describe, expect, it, vi } from "vitest";
import type { SessionPort } from "../../identity/application/ports/session.port";
import { UnauthenticatedError } from "../../identity/application/require-authenticated-session";
import type {
  NewPhotoHash,
  PhotoHashMatch,
  PhotoHashPort,
} from "../../listing-trust/application/ports/photo-hash.port";
import { toPerceptualHash } from "../../listing-trust/domain/perceptual-hash";
import { MAX_PHOTOS_PER_LISTING } from "../domain/publishable-listing";
import {
  AttachPhotoToDraftLimitReachedError,
  AttachPhotoToDraftNotFoundError,
  AttachPhotoToDraftNotOwnedError,
  attachPhotoToDraft,
} from "./attach-photo-to-draft";
import type { DraftForActivation, ListingActivationPort } from "./ports/listing-activation.port";
import type { ListingPhotoAttachmentPort } from "./ports/listing-photo-attachment.port";
import type { PhotoDerivationPort } from "./ports/photo-derivation.port";
import type { PhotoHashComputationPort } from "./ports/photo-hash-computation.port";
import type { PhotoStoragePort, StoredObject, UploadTarget } from "./ports/photo-storage.port";
import { RejectedUploadError } from "./process-uploaded-photo";

/**
 * broker-bulk-import spec, "Photos Attached Through the Existing Upload
 * Path" (tasks.md 9.20/9.21). Task 9.20's own words — "broker B cannot
 * attach a photo to broker A's draft" — is the ownership test below, and it
 * is the scenario the spec names verbatim: "Photos cannot be attached to
 * another account's draft".
 *
 * Storage and derivation are both ports here for the exact reason
 * `process-uploaded-photo.test.ts` already establishes: every guarantee is
 * assertable without a bucket, a credential or a network. What is proven
 * HERE and not there is the layer `processUploadedPhoto` cannot see for
 * itself — WHICH draft a photo lands on, and whether the caller is allowed
 * to put one there at all.
 */

const OWNER = "broker-1";
const STRANGER = "broker-2";
const DRAFT_ID = "draft-1";
const TOKEN = "9c1d4e6f8a2b0c3d5e7f9a1b3c5d7e9f";
const INCOMING_KEY = `incoming/${OWNER}/${TOKEN}`;
const NOW = new Date("2026-08-25T12:00:00.000Z");

/** A real PNG header, so the reused guard sees what it actually reads. */
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]);

function draft(overrides: Partial<DraftForActivation> = {}): DraftForActivation {
  return {
    id: DRAFT_ID,
    publisherId: OWNER,
    publisherType: "broker",
    propertyType: "apartamento",
    cityId: "city-1",
    zoneId: "zone-1",
    title: "Aviso importado",
    description: "Descripcion suficientemente larga para pasar validacion, aunque no se usa aqui.",
    priceUsd: 450,
    rooms: 2,
    areaM2: 78,
    bathrooms: 2,
    parkingSpots: 0,
    hasPowerPlant: false,
    hasRegularWater: false,
    isFurnished: false,
    hasSecurity: false,
    hasAppliances: false,
    contactMethod: "whatsapp",
    contactValue: "04121234567",
    photoCount: 0,
    ...overrides,
  };
}

function sessionPortReturning(userId: string | null): SessionPort {
  return {
    async getSession() {
      return userId ? { userId, email: null, name: null } : null;
    },
  };
}

function activationPort(row: DraftForActivation | null): ListingActivationPort {
  return {
    findDraftById: vi.fn(async () => row),
    activate: vi.fn(async () => {
      throw new Error("not used by this use case");
    }),
  };
}

function attachmentPort(): ListingPhotoAttachmentPort & {
  readonly attachCalls: ReadonlyArray<readonly [string, unknown, Date]>;
} {
  const attachCalls: Array<readonly [string, unknown, Date]> = [];
  let nextPhotoId = 0;
  return {
    attachCalls,
    attachPhoto: vi.fn(async (listingId: string, photo: unknown, createdAt: Date) => {
      attachCalls.push([listingId, photo, createdAt]);
      nextPhotoId += 1;
      return { photoId: `attached-photo-${nextPhotoId}` };
    }),
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

function makeStorage(): PhotoStoragePort & { readonly reads: string[] } {
  const reads: string[] = [];
  return {
    reads,
    async createUploadTarget(): Promise<UploadTarget> {
      throw new Error("not used by this use case");
    },
    async read(key: string): Promise<Uint8Array> {
      reads.push(key);
      return PNG;
    },
    async put(key: string, bytes: Uint8Array): Promise<StoredObject> {
      return { key, byteLength: bytes.byteLength };
    },
    async remove(): Promise<void> {},
  };
}

const derive: PhotoDerivationPort = async () => ({
  thumb: { bytes: new Uint8Array([1]), byteLength: 1 },
  card: { bytes: new Uint8Array([1]), byteLength: 1 },
  strip: { bytes: new Uint8Array([1]), byteLength: 1 },
  detail: { bytes: new Uint8Array([1]), byteLength: 1 },
  full: { bytes: new Uint8Array([1]), byteLength: 1 },
});

function request(
  overrides: Partial<Parameters<typeof attachPhotoToDraft>[0]> = {},
): Parameters<typeof attachPhotoToDraft>[0] {
  return {
    listingId: DRAFT_ID,
    incomingKey: INCOMING_KEY,
    declaredContentType: "image/png",
    ...overrides,
  };
}

describe("attachPhotoToDraft", () => {
  it("rejects with UnauthenticatedError before reading the draft", async () => {
    const listings = activationPort(draft());
    const photos = attachmentPort();
    const storage = makeStorage();

    await expect(
      attachPhotoToDraft(request(), {
        sessionPort: sessionPortReturning(null),
        listings,
        photos,
        storage,
        derive,
        computeHash,
        photoHashes: noMatchPhotoHashes(),
        now: () => NOW,
      }),
    ).rejects.toBeInstanceOf(UnauthenticatedError);

    expect(listings.findDraftById).not.toHaveBeenCalled();
    expect(storage.reads).toEqual([]);
  });

  it("throws AttachPhotoToDraftNotFoundError when the draft does not exist (or is not a draft)", async () => {
    const listings = activationPort(null);
    const photos = attachmentPort();
    const storage = makeStorage();

    await expect(
      attachPhotoToDraft(request(), {
        sessionPort: sessionPortReturning(OWNER),
        listings,
        photos,
        storage,
        derive,
        computeHash,
        photoHashes: noMatchPhotoHashes(),
        now: () => NOW,
      }),
    ).rejects.toBeInstanceOf(AttachPhotoToDraftNotFoundError);

    expect(storage.reads).toEqual([]);
    expect(photos.attachCalls).toEqual([]);
  });

  // tasks.md 9.20's own words: "broker B cannot attach a photo to broker
  // A's draft". Mutation-check target: ownership must be checked BEFORE
  // storage is ever touched, and must refuse rather than silently attach.
  it("throws AttachPhotoToDraftNotOwnedError for another broker's draft, and never touches storage", async () => {
    const listings = activationPort(draft({ publisherId: OWNER }));
    const photos = attachmentPort();
    const storage = makeStorage();

    await expect(
      attachPhotoToDraft(request(), {
        sessionPort: sessionPortReturning(STRANGER),
        listings,
        photos,
        storage,
        derive,
        computeHash,
        photoHashes: noMatchPhotoHashes(),
        now: () => NOW,
      }),
    ).rejects.toBeInstanceOf(AttachPhotoToDraftNotOwnedError);

    expect(storage.reads).toEqual([]);
    expect(photos.attachCalls).toEqual([]);
  });

  it("throws AttachPhotoToDraftLimitReachedError at the ceiling, and never touches storage", async () => {
    const listings = activationPort(draft({ photoCount: MAX_PHOTOS_PER_LISTING }));
    const photos = attachmentPort();
    const storage = makeStorage();

    await expect(
      attachPhotoToDraft(request(), {
        sessionPort: sessionPortReturning(OWNER),
        listings,
        photos,
        storage,
        derive,
        computeHash,
        photoHashes: noMatchPhotoHashes(),
        now: () => NOW,
      }),
    ).rejects.toBeInstanceOf(AttachPhotoToDraftLimitReachedError);

    expect(storage.reads).toEqual([]);
    expect(photos.attachCalls).toEqual([]);
  });

  it("attaches at position = current photo count, using the caller's clock", async () => {
    const listings = activationPort(draft({ photoCount: 2 }));
    const photos = attachmentPort();
    const storage = makeStorage();

    const result = await attachPhotoToDraft(request(), {
      sessionPort: sessionPortReturning(OWNER),
      listings,
      photos,
      storage,
      derive,
      computeHash,
      photoHashes: noMatchPhotoHashes(),
      now: () => NOW,
    });

    expect(result).toEqual({ listingId: DRAFT_ID, position: 2 });
    expect(storage.reads).toEqual([INCOMING_KEY]);
    expect(photos.attachCalls).toHaveLength(1);
    const [listingId, photo, createdAt] = photos.attachCalls[0]!;
    expect(listingId).toBe(DRAFT_ID);
    expect(photo).toMatchObject({ position: 2 });
    expect(createdAt).toEqual(NOW);
  });

  it("reuses the SAME upload guard the single-listing flow uses, and never attaches a rejected upload", async () => {
    const listings = activationPort(draft());
    const photos = attachmentPort();
    const storage = makeStorage();
    // A ZIP header, not an image — the exact "not an image" case
    // process-uploaded-photo.test.ts already proves in isolation.
    const notAnImage = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00, 0x00, 0x00]);
    storage.read = async (key: string) => {
      storage.reads.push(key);
      return notAnImage;
    };

    await expect(
      attachPhotoToDraft(request(), {
        sessionPort: sessionPortReturning(OWNER),
        listings,
        photos,
        storage,
        derive,
        computeHash,
        photoHashes: noMatchPhotoHashes(),
        now: () => NOW,
      }),
    ).rejects.toBeInstanceOf(RejectedUploadError);

    expect(photos.attachCalls).toEqual([]);
  });

  /**
   * broker-bulk-import spec, "Duplicate photo rules still apply to imported
   * drafts" — this file's own docstring named this as the known gap task
   * 4.7 closes. Same choke point (`processUploadedPhoto`) this file already
   * reuses for the byte-level guard, so the check itself is not retested
   * here — only what THIS layer adds: attaching, then recording against
   * the real photo id `photos.attachPhoto` returns.
   */
  describe("D4 — cross-account perceptual-hash duplicate rejection", () => {
    it("rejects a photo matching another publisher's, and attaches nothing", async () => {
      const listings = activationPort(draft());
      const photos = attachmentPort();
      const storage = makeStorage();
      const photoHashes: PhotoHashPort = {
        async findMatchesFromOtherPublishers() {
          return [
            { photoId: "stolen", listingId: "listing-x", publisherId: "someone-else", distance: 3 },
          ];
        },
        async record() {
          throw new Error("record must never fire when the attach is rejected");
        },
      };

      const failure = await attachPhotoToDraft(request(), {
        sessionPort: sessionPortReturning(OWNER),
        listings,
        photos,
        storage,
        derive,
        computeHash,
        photoHashes,
        now: () => NOW,
      }).catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(RejectedUploadError);
      expect((failure as RejectedUploadError).violations).toEqual([
        "photo.duplicateAcrossPublishers",
      ]);
      expect(photos.attachCalls).toEqual([]);
    });

    it("records the hash AFTER attachPhoto resolves, keyed to the id it returned", async () => {
      const listings = activationPort(draft({ photoCount: 1 }));
      const photos = attachmentPort();
      const storage = makeStorage();
      const photoHashes = noMatchPhotoHashes();

      await attachPhotoToDraft(request(), {
        sessionPort: sessionPortReturning(OWNER),
        listings,
        photos,
        storage,
        derive,
        computeHash,
        photoHashes,
        now: () => NOW,
      });

      expect(photoHashes.recorded).toEqual([
        { photoId: "attached-photo-1", hash: SOME_HASH, recordedAt: NOW },
      ]);
    });

    it("never records before attachPhoto resolves — recording follows the write, not the other way around", async () => {
      const listings = activationPort(draft());
      const order: string[] = [];
      const photos: ListingPhotoAttachmentPort = {
        async attachPhoto() {
          order.push("attach");
          return { photoId: "photo-1" };
        },
      };
      const storage = makeStorage();
      const photoHashes: PhotoHashPort = {
        async findMatchesFromOtherPublishers() {
          return [];
        },
        async record() {
          order.push("record");
        },
      };

      await attachPhotoToDraft(request(), {
        sessionPort: sessionPortReturning(OWNER),
        listings,
        photos,
        storage,
        derive,
        computeHash,
        photoHashes,
        now: () => NOW,
      });

      expect(order).toEqual(["attach", "record"]);
    });

    it("allows the owner's own photo, active or expired — the same-publisher exemption reaches this path too", async () => {
      const listings = activationPort(draft());
      const photos = attachmentPort();
      const storage = makeStorage();
      const seenExclusions: string[] = [];
      const photoHashes: PhotoHashPort = {
        async findMatchesFromOtherPublishers(_hash, excludePublisherId) {
          seenExclusions.push(excludePublisherId);
          return [];
        },
        async record() {},
      };

      const result = await attachPhotoToDraft(request(), {
        sessionPort: sessionPortReturning(OWNER),
        listings,
        photos,
        storage,
        derive,
        computeHash,
        photoHashes,
        now: () => NOW,
      });

      expect(result).toEqual({ listingId: DRAFT_ID, position: 0 });
      expect(seenExclusions).toEqual([OWNER]);
    });
  });
});
