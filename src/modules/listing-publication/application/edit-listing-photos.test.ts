import { describe, expect, it, vi } from "vitest";
import type {
  AuthenticatedSession,
  SessionPort,
} from "../../identity/application/ports/session.port";
import type { PhotoHashPort } from "../../listing-trust/application/ports/photo-hash.port";
import { toPerceptualHash } from "../../listing-trust/domain/perceptual-hash";
import { MAX_PHOTOS_PER_LISTING } from "../domain/publishable-listing";
import { EditListingNotFoundError } from "./edit-listing";
import {
  attachPhotoToListing,
  detachPhotoFromListing,
  ListingPhotoLimitReachedError,
  ListingPhotoRemovalRefusedError,
  loadListingPhotosForEdit,
  requestListingPhotoUpload,
} from "./edit-listing-photos";
import type { EditableListing, ListingEditPort } from "./ports/listing-edit.port";
import type { ListingPhotoAttachmentPort } from "./ports/listing-photo-attachment.port";
import type {
  ListingPhotoDetachmentPort,
  ListingPhotoOrderPort,
  ListingPhotoThumbnail,
  ListingPhotoThumbnailPort,
} from "./ports/listing-photo-set.port";
import type { PhotoDerivationPort } from "./ports/photo-derivation.port";
import type { PhotoHashComputationPort } from "./ports/photo-hash-computation.port";
import type { PhotoStoragePort, StoredObject } from "./ports/photo-storage.port";

/**
 * tasks.md 18.21 — agregar y quitar fotos de un aviso YA publicado.
 *
 * **Los dobles prueban el orden de las puertas, nunca el `WHERE`.** Que un
 * aviso ajeno vuelva `null`, que el índice único refuse dos fotos en la misma
 * posición y que renumerar no choque son afirmaciones sobre Postgres, y viven
 * en `tests/integration/listing-photo-editing.test.ts`.
 */

const OWNER = "owner-1";

function sessionFor(userId: string): SessionPort {
  const session: AuthenticatedSession = { userId, email: null, name: null };
  return { getSession: async () => session };
}

function editableListing(overrides: Partial<EditableListing> = {}): EditableListing {
  return {
    id: "listing-1",
    publisherId: OWNER,
    publisherType: "owner",
    propertyType: "apartamento",
    cityId: "city-1",
    zoneId: "zone-1",
    title: "Apartamento amoblado en La Castellana",
    description: "x".repeat(120),
    priceUsd: 610,
    rooms: 3,
    areaM2: 128,
    bathrooms: 2,
    parkingSpots: 1,
    contactMethod: "whatsapp",
    contactValue: "04121234567",
    photoCount: 2,
    ...overrides,
  };
}

function listingsThatFind(
  listing: EditableListing | null,
): Pick<ListingEditPort, "findEditableById"> {
  return { findEditableById: vi.fn(async () => listing) };
}

const TOKEN = "9c1d4e6f8a2b0c3d5e7f9a1b3c5d7e9f";
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]);

function incomingKeyFor(publisherId: string): string {
  return `incoming/${publisherId}/${TOKEN}`;
}

function fakeStorage(): PhotoStoragePort {
  return {
    createUploadTarget: vi.fn(async () => ({
      key: incomingKeyFor(OWNER),
      url: "https://r2.example/put",
      expiresAt: new Date("2026-03-01T00:10:00.000Z"),
    })),
    read: vi.fn(async () => PNG),
    put: vi.fn(
      async (key: string, bytes: Uint8Array): Promise<StoredObject> => ({
        key,
        byteLength: bytes.byteLength,
      }),
    ),
    remove: vi.fn(async () => {}),
  };
}

const fakeDerive: PhotoDerivationPort = async () => ({
  thumb: { bytes: new Uint8Array([1]), byteLength: 1 },
  card: { bytes: new Uint8Array([1]), byteLength: 1 },
  strip: { bytes: new Uint8Array([1]), byteLength: 1 },
  detail: { bytes: new Uint8Array([1]), byteLength: 1 },
  full: { bytes: new Uint8Array([1]), byteLength: 1 },
});

const fakeComputeHash: PhotoHashComputationPort = async () => toPerceptualHash(1n);

function photoHashes(matches: readonly string[] = []): PhotoHashPort {
  return {
    findMatchesFromOtherPublishers: vi.fn(async () => matches.map((photoId) => ({ photoId }))),
    record: vi.fn(async () => {}),
  } as unknown as PhotoHashPort;
}

function attachmentPort(photoId = "photo-new"): ListingPhotoAttachmentPort {
  return { attachPhoto: vi.fn(async () => ({ photoId })) };
}

function orderPort(ids: readonly string[]): ListingPhotoOrderPort {
  return { listPhotoIdsInOrder: vi.fn(async () => ids) };
}

function thumbnailPort(photos: readonly ListingPhotoThumbnail[]): ListingPhotoThumbnailPort {
  return { listPhotoThumbnailsInOrder: vi.fn(async () => photos) };
}

function detachmentPort(detached = true): ListingPhotoDetachmentPort {
  return { detachPhoto: vi.fn(async () => detached) };
}

describe("requestListingPhotoUpload", () => {
  it("un aviso ajeno o inexistente no obtiene permiso de escritura, y se contesta como el mismo error que editar", async () => {
    const storage = fakeStorage();

    await expect(
      requestListingPhotoUpload(
        { listingId: "listing-1", contentType: "image/webp", byteLength: 38_000 },
        { sessionPort: sessionFor("stranger"), listings: listingsThatFind(null), storage },
      ),
    ).rejects.toBeInstanceOf(EditListingNotFoundError);

    expect(storage.createUploadTarget).not.toHaveBeenCalled();
  });

  it("un aviso que ya llegó al tope no obtiene permiso de escritura", async () => {
    const storage = fakeStorage();

    await expect(
      requestListingPhotoUpload(
        { listingId: "listing-1", contentType: "image/webp", byteLength: 38_000 },
        {
          sessionPort: sessionFor(OWNER),
          listings: listingsThatFind(editableListing({ photoCount: MAX_PHOTOS_PER_LISTING })),
          storage,
        },
      ),
    ).rejects.toBeInstanceOf(ListingPhotoLimitReachedError);

    expect(storage.createUploadTarget).not.toHaveBeenCalled();
  });

  it("firma bajo el prefijo del dueño del aviso, que la puerta ya probó que es el de la sesión", async () => {
    const storage = fakeStorage();

    const target = await requestListingPhotoUpload(
      { listingId: "listing-1", contentType: "image/webp", byteLength: 38_000 },
      {
        sessionPort: sessionFor(OWNER),
        listings: listingsThatFind(editableListing()),
        storage,
      },
    );

    expect(target.key).toBe(incomingKeyFor(OWNER));
    expect(storage.createUploadTarget).toHaveBeenCalledWith(
      expect.objectContaining({
        publisherId: OWNER,
        contentType: "image/webp",
        byteLength: 38_000,
      }),
    );
  });
});

describe("attachPhotoToListing", () => {
  it("un aviso ajeno o inexistente no acepta fotos, y no se lee un solo byte", async () => {
    const storage = fakeStorage();
    const photos = attachmentPort();

    await expect(
      attachPhotoToListing(
        {
          listingId: "listing-1",
          incomingKey: incomingKeyFor("stranger"),
          declaredContentType: "image/png",
        },
        {
          sessionPort: sessionFor("stranger"),
          listings: listingsThatFind(null),
          photos,
          storage,
          derive: fakeDerive,
          computeHash: fakeComputeHash,
          photoHashes: photoHashes(),
        },
      ),
    ).rejects.toBeInstanceOf(EditListingNotFoundError);

    expect(storage.read).not.toHaveBeenCalled();
    expect(photos.attachPhoto).not.toHaveBeenCalled();
  });

  it("el tope refusa antes de leer un solo byte", async () => {
    const storage = fakeStorage();
    const photos = attachmentPort();

    await expect(
      attachPhotoToListing(
        {
          listingId: "listing-1",
          incomingKey: incomingKeyFor(OWNER),
          declaredContentType: "image/png",
        },
        {
          sessionPort: sessionFor(OWNER),
          listings: listingsThatFind(editableListing({ photoCount: MAX_PHOTOS_PER_LISTING })),
          photos,
          storage,
          derive: fakeDerive,
          computeHash: fakeComputeHash,
          photoHashes: photoHashes(),
        },
      ),
    ).rejects.toBeInstanceOf(ListingPhotoLimitReachedError);

    expect(storage.read).not.toHaveBeenCalled();
    expect(photos.attachPhoto).not.toHaveBeenCalled();
  });

  it("adjunta en la posición que sigue a las fotos contadas, nunca en una que el pedido diga", async () => {
    const photos = attachmentPort();

    const result = await attachPhotoToListing(
      {
        listingId: "listing-1",
        incomingKey: incomingKeyFor(OWNER),
        declaredContentType: "image/png",
      },
      {
        sessionPort: sessionFor(OWNER),
        listings: listingsThatFind(editableListing({ photoCount: 4 })),
        photos,
        storage: fakeStorage(),
        derive: fakeDerive,
        computeHash: fakeComputeHash,
        photoHashes: photoHashes(),
        now: () => new Date("2026-03-01T00:00:00.000Z"),
      },
    );

    expect(result).toEqual({ listingId: "listing-1", position: 4 });
    expect(photos.attachPhoto).toHaveBeenCalledWith(
      "listing-1",
      expect.objectContaining({ position: 4 }),
      new Date("2026-03-01T00:00:00.000Z"),
    );
  });

  it("pasa por processUploadedPhoto: una foto de otra cuenta se rechaza y no se escribe ninguna fila", async () => {
    const photos = attachmentPort();
    const hashes = photoHashes(["photo-de-otra-cuenta"]);

    await expect(
      attachPhotoToListing(
        {
          listingId: "listing-1",
          incomingKey: incomingKeyFor(OWNER),
          declaredContentType: "image/png",
        },
        {
          sessionPort: sessionFor(OWNER),
          listings: listingsThatFind(editableListing()),
          photos,
          storage: fakeStorage(),
          derive: fakeDerive,
          computeHash: fakeComputeHash,
          photoHashes: hashes,
        },
      ),
    ).rejects.toThrowError(/photo.duplicateAcrossPublishers/);

    expect(hashes.findMatchesFromOtherPublishers).toHaveBeenCalled();
    expect(photos.attachPhoto).not.toHaveBeenCalled();
  });

  it("graba el hash sólo después de que attachPhoto devolvió el id que le tocó", async () => {
    const order: string[] = [];
    const photos: ListingPhotoAttachmentPort = {
      attachPhoto: vi.fn(async () => {
        order.push("attachPhoto");
        return { photoId: "photo-7" };
      }),
    };
    const hashes = {
      findMatchesFromOtherPublishers: vi.fn(async () => []),
      record: vi.fn(async (newHash: { readonly photoId: string }) => {
        order.push(`record:${newHash.photoId}`);
      }),
    } as unknown as PhotoHashPort;

    await attachPhotoToListing(
      {
        listingId: "listing-1",
        incomingKey: incomingKeyFor(OWNER),
        declaredContentType: "image/png",
      },
      {
        sessionPort: sessionFor(OWNER),
        listings: listingsThatFind(editableListing()),
        photos,
        storage: fakeStorage(),
        derive: fakeDerive,
        computeHash: fakeComputeHash,
        photoHashes: hashes,
      },
    );

    expect(order).toEqual(["attachPhoto", "record:photo-7"]);
  });
});

describe("loadListingPhotosForEdit", () => {
  it("un aviso ajeno o inexistente no muestra sus fotos, ni siquiera cuántas son", async () => {
    const thumbnails = thumbnailPort([{ photoId: "a", thumbKey: "promoted/a/thumb.webp" }]);

    await expect(
      loadListingPhotosForEdit(
        { listingId: "listing-1" },
        { sessionPort: sessionFor("stranger"), listings: listingsThatFind(null), thumbnails },
      ),
    ).rejects.toBeInstanceOf(EditListingNotFoundError);

    expect(thumbnails.listPhotoThumbnailsInOrder).not.toHaveBeenCalled();
  });

  it("un aviso que llegó al tope sigue mostrando sus fotos: leer no es agregar", async () => {
    const fotos = await loadListingPhotosForEdit(
      { listingId: "listing-1" },
      {
        sessionPort: sessionFor(OWNER),
        listings: listingsThatFind(editableListing({ photoCount: MAX_PHOTOS_PER_LISTING })),
        thumbnails: thumbnailPort([
          { photoId: "a", thumbKey: "promoted/a/thumb.webp" },
          { photoId: "b", thumbKey: "promoted/b/thumb.webp" },
          { photoId: "c", thumbKey: "promoted/c/thumb.webp" },
        ]),
      },
    );

    expect(fotos.map((foto) => foto.photoId)).toEqual(["a", "b", "c"]);
  });

  /**
   * tasks.md 18.26 — **la lectura que une las dos mitades.** El id solo
   * alcanzaba para el formulario de quitar; la clave de la miniatura es lo
   * único que le falta a la pantalla para dibujar CUÁL foto es. Vuelven juntas
   * y en el orden del aviso, que es el orden en que se muestran.
   */
  it("cada foto vuelve con la clave de su miniatura al lado de su id, en el orden del aviso", async () => {
    const fotos = await loadListingPhotosForEdit(
      { listingId: "listing-1" },
      {
        sessionPort: sessionFor(OWNER),
        listings: listingsThatFind(editableListing()),
        thumbnails: thumbnailPort([
          { photoId: "a", thumbKey: "promoted/a/thumb.webp" },
          { photoId: "b", thumbKey: "promoted/b/thumb.webp" },
        ]),
      },
    );

    expect(fotos).toEqual([
      { photoId: "a", thumbKey: "promoted/a/thumb.webp" },
      { photoId: "b", thumbKey: "promoted/b/thumb.webp" },
    ]);
  });

  /**
   * **Una foto sin derivada NO desaparece de la lista, y es lo contrario de un
   * detalle.** La única manera de quitar una foto es su renglón, así que
   * filtrar la que no tiene miniatura dejaría una fila de `listing_photo` que
   * el aviso muestra y su dueño no puede sacar — un fallo abierto justo donde
   * AGENTS.md §7 pide el cerrado. Vuelve con `thumbKey` en `null` y la pantalla
   * decide qué dibujar.
   */
  it("una foto sin miniatura vuelve igual, no se filtra de la lista", async () => {
    const fotos = await loadListingPhotosForEdit(
      { listingId: "listing-1" },
      {
        sessionPort: sessionFor(OWNER),
        listings: listingsThatFind(editableListing()),
        thumbnails: thumbnailPort([
          { photoId: "a", thumbKey: null },
          { photoId: "b", thumbKey: "promoted/b/thumb.webp" },
        ]),
      },
    );

    expect(fotos).toEqual([
      { photoId: "a", thumbKey: null },
      { photoId: "b", thumbKey: "promoted/b/thumb.webp" },
    ]);
  });
});

describe("detachPhotoFromListing", () => {
  it("un aviso ajeno o inexistente no desprende nada, y ni siquiera lee sus fotos", async () => {
    const order = orderPort(["a", "b"]);
    const photos = detachmentPort();

    await expect(
      detachPhotoFromListing(
        { listingId: "listing-1", photoId: "a" },
        {
          sessionPort: sessionFor("stranger"),
          listings: listingsThatFind(null),
          order,
          photos,
        },
      ),
    ).rejects.toBeInstanceOf(EditListingNotFoundError);

    expect(order.listPhotoIdsInOrder).not.toHaveBeenCalled();
    expect(photos.detachPhoto).not.toHaveBeenCalled();
  });

  it("quitar la única foto se rechaza y no borra la fila", async () => {
    const photos = detachmentPort();

    await expect(
      detachPhotoFromListing(
        { listingId: "listing-1", photoId: "a" },
        {
          sessionPort: sessionFor(OWNER),
          listings: listingsThatFind(editableListing({ photoCount: 1 })),
          order: orderPort(["a"]),
          photos,
        },
      ),
    ).rejects.toMatchObject({ name: "ListingPhotoRemovalRefusedError", refusal: "lastPhoto" });

    expect(photos.detachPhoto).not.toHaveBeenCalled();
  });

  it("una foto que no está en este aviso se rechaza como notFound, no como la última", async () => {
    const photos = detachmentPort();

    await expect(
      detachPhotoFromListing(
        { listingId: "listing-1", photoId: "de-otro-aviso" },
        {
          sessionPort: sessionFor(OWNER),
          listings: listingsThatFind(editableListing()),
          order: orderPort(["a", "b"]),
          photos,
        },
      ),
    ).rejects.toMatchObject({ name: "ListingPhotoRemovalRefusedError", refusal: "notFound" });

    expect(photos.detachPhoto).not.toHaveBeenCalled();
  });

  it("quitar la portada dice con nombre cuál quedó de portada", async () => {
    const result = await detachPhotoFromListing(
      { listingId: "listing-1", photoId: "a" },
      {
        sessionPort: sessionFor(OWNER),
        listings: listingsThatFind(editableListing({ photoCount: 3 })),
        order: orderPort(["a", "b", "c"]),
        photos: detachmentPort(),
      },
    );

    expect(result).toEqual({ listingId: "listing-1", coverChangedTo: "b" });
  });

  it("quitar una que no es la portada no anuncia ningún cambio de portada", async () => {
    const result = await detachPhotoFromListing(
      { listingId: "listing-1", photoId: "c" },
      {
        sessionPort: sessionFor(OWNER),
        listings: listingsThatFind(editableListing({ photoCount: 3 })),
        order: orderPort(["a", "b", "c"]),
        photos: detachmentPort(),
      },
    );

    expect(result).toEqual({ listingId: "listing-1", coverChangedTo: null });
  });

  it("si la fila dejó de estar entre la lectura y el borrado, se contesta como inexistente", async () => {
    await expect(
      detachPhotoFromListing(
        { listingId: "listing-1", photoId: "b" },
        {
          sessionPort: sessionFor(OWNER),
          listings: listingsThatFind(editableListing({ photoCount: 2 })),
          order: orderPort(["a", "b"]),
          photos: detachmentPort(false),
        },
      ),
    ).rejects.toBeInstanceOf(EditListingNotFoundError);
  });

  it("ListingPhotoRemovalRefusedError lleva la negativa del dominio, no una frase", () => {
    expect(new ListingPhotoRemovalRefusedError("listing-1", "lastPhoto").refusal).toBe("lastPhoto");
  });
});
