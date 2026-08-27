import { describe, expect, it, vi } from "vitest";
import type { SessionPort } from "../../identity/application/ports/session.port";
import { UnauthenticatedError } from "../../identity/application/require-authenticated-session";
import {
  AttachPhotoToDraftLimitReachedError,
  AttachPhotoToDraftNotFoundError,
  AttachPhotoToDraftNotOwnedError,
} from "./attach-photo-to-draft";
import type { DraftForActivation, ListingActivationPort } from "./ports/listing-activation.port";
import type { PhotoStoragePort } from "./ports/photo-storage.port";
import { requestDraftPhotoUpload } from "./request-draft-photo-upload";

/**
 * tasks.md 9.28 — la firma que la pantalla de «Mis avisos» necesita antes de
 * poder subir una foto a un borrador.
 *
 * **Falla cerrado (AGENTS.md §7).** Un permiso de escritura presignado se
 * entrega ANTES de que exista foto alguna, así que las tres preguntas —
 * ¿hay sesión?, ¿el borrador existe?, ¿es de quien pregunta?— se contestan
 * antes de firmar. `attachPhotoToDraft` vuelve a hacerlas después, y esa
 * duplicación es deliberada: la de acá evita repartir permisos que nadie va a
 * poder usar; la de allá impide que uno repartido de más sirva de algo.
 */

const PUBLISHER = "broker-1";
const OTHER = "broker-2";
const DRAFT_ID = "draft-1";

function sessionPortReturning(userId: string | null): SessionPort {
  return {
    async getSession() {
      return userId ? { userId, email: null, name: null } : null;
    },
  };
}

function draft(overrides: Partial<DraftForActivation> = {}): DraftForActivation {
  return {
    id: DRAFT_ID,
    publisherId: PUBLISHER,
    publisherType: "broker",
    propertyType: "apartamento",
    cityId: "city-1",
    zoneId: "zone-1",
    title: "Aviso importado",
    description: "d",
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

function listingsPort(row: DraftForActivation | null): ListingActivationPort {
  return { findDraftById: vi.fn(async () => row), activate: vi.fn(async () => true) };
}

function storagePort(): PhotoStoragePort & {
  readonly createUploadTarget: ReturnType<typeof vi.fn>;
} {
  return {
    createUploadTarget: vi.fn(async () => ({
      key: "incoming/broker-1/token",
      url: "https://r2.example/put",
      expiresAt: new Date("2026-08-27T12:05:00Z"),
    })),
    read: vi.fn(),
    put: vi.fn(),
    remove: vi.fn(),
  } as unknown as PhotoStoragePort & { readonly createUploadTarget: ReturnType<typeof vi.fn> };
}

const REQUEST = { listingId: DRAFT_ID, contentType: "image/webp", byteLength: 38_000 };

describe("requestDraftPhotoUpload", () => {
  it("refusa sin sesión antes de leer el borrador y antes de firmar nada", async () => {
    const listings = listingsPort(draft());
    const storage = storagePort();

    await expect(
      requestDraftPhotoUpload(REQUEST, {
        sessionPort: sessionPortReturning(null),
        listings,
        storage,
      }),
    ).rejects.toBeInstanceOf(UnauthenticatedError);

    expect(listings.findDraftById).not.toHaveBeenCalled();
    expect(storage.createUploadTarget).not.toHaveBeenCalled();
  });

  it("refusa un borrador que no existe, sin firmar", async () => {
    const storage = storagePort();

    await expect(
      requestDraftPhotoUpload(REQUEST, {
        sessionPort: sessionPortReturning(PUBLISHER),
        listings: listingsPort(null),
        storage,
      }),
    ).rejects.toBeInstanceOf(AttachPhotoToDraftNotFoundError);

    expect(storage.createUploadTarget).not.toHaveBeenCalled();
  });

  /**
   * El mismo orden que `attachPhotoToDraft`: la propiedad se comprueba antes
   * que el tope, para que el borrador de otro ni siquiera revele cuántas
   * fotos tiene.
   */
  it("refusa el borrador de otra cuenta, y nunca firma un permiso para él", async () => {
    const storage = storagePort();

    await expect(
      requestDraftPhotoUpload(REQUEST, {
        sessionPort: sessionPortReturning(OTHER),
        listings: listingsPort(draft()),
        storage,
      }),
    ).rejects.toBeInstanceOf(AttachPhotoToDraftNotOwnedError);

    expect(storage.createUploadTarget).not.toHaveBeenCalled();
  });

  it("refusa cuando el borrador ya llegó al tope de fotos, antes de firmar", async () => {
    const storage = storagePort();

    await expect(
      requestDraftPhotoUpload(REQUEST, {
        sessionPort: sessionPortReturning(PUBLISHER),
        listings: listingsPort(draft({ photoCount: 6 })),
        storage,
      }),
    ).rejects.toBeInstanceOf(AttachPhotoToDraftLimitReachedError);

    expect(storage.createUploadTarget).not.toHaveBeenCalled();
  });

  /**
   * **El prefijo sale de la sesión, nunca del pedido.** Es lo que hace que la
   * URL firmada de una cuenta no sirva para escribir en el espacio de otra
   * aunque se filtre, y la razón por la que este caso de uso no tiene ningún
   * parámetro de publicador.
   */
  it("firma con el publicador de la sesión, el tipo pedido y el largo exacto", async () => {
    const storage = storagePort();

    const target = await requestDraftPhotoUpload(REQUEST, {
      sessionPort: sessionPortReturning(PUBLISHER),
      listings: listingsPort(draft()),
      storage,
    });

    expect(storage.createUploadTarget).toHaveBeenCalledWith({
      publisherId: PUBLISHER,
      contentType: "image/webp",
      byteLength: 38_000,
      maxBytes: expect.any(Number),
    });
    expect(target.key).toBe("incoming/broker-1/token");
    expect(target.url).toBe("https://r2.example/put");
  });
});
