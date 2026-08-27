import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * tasks.md 9.28 — **el cable, no la regla.**
 *
 * `activateListing`, `attachPhotoToDraft` y `requestDraftPhotoUpload` ya
 * tienen sus propias pruebas de lo que deciden. Este archivo prueba lo único
 * que no estaba probado en ninguna parte, porque no existía: que una ruta los
 * llame. Los dos primeros llevaban una porción entera construidos y con CERO
 * llamadores fuera de sus pruebas — el mismo defecto que este trabajo ya
 * encontró en el anti-fraude de fotos, en la pastilla de búsqueda y en
 * `canImportListings`.
 */

const { activateListing, attachPhotoToDraft, requestDraftPhotoUpload, redirect, revalidatePath } =
  vi.hoisted(() => ({
    activateListing: vi.fn(),
    attachPhotoToDraft: vi.fn(),
    requestDraftPhotoUpload: vi.fn(),
    redirect: vi.fn((destination: string) => {
      // `redirect` de Next funciona tirando; imitarlo es lo que prueba que
      // nada después de él corre.
      throw new Error(`NEXT_REDIRECT:${destination}`);
    }),
    revalidatePath: vi.fn(),
  }));

vi.mock("next/navigation", () => ({ redirect }));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("../../src/modules/identity/infrastructure/session-port", () => ({
  nextAuthSessionPort: { getSession: async () => null },
}));
vi.mock("../../src/shared/db/client", () => ({ db: {} }));
vi.mock("../../src/shared/db/transactional-client", () => ({
  getTransactionalDatabase: () => ({}),
}));
vi.mock("../../src/modules/listing-publication/infrastructure/r2-photo-storage", () => ({
  createR2PhotoStorage: () => ({}),
}));
vi.mock("../../src/modules/listing-publication/infrastructure/photo-derivatives", () => ({
  deriveListingPhoto: vi.fn(),
}));
vi.mock("../../src/modules/listing-trust/infrastructure/drizzle-photo-hash", () => ({
  DrizzlePhotoHash: class {},
}));

/**
 * **`importActual` y no una fábrica que reemplace el módulo entero.**
 * `ActivateListingRejectedError` tiene que ser la clase REAL: con una copia
 * local, un renombre en producción dejaría este archivo verde comparando
 * contra un error que ya no existe, y el `instanceof` de la acción daría
 * falso justo donde importa.
 */
vi.mock("../../src/modules/listing-publication/application/activate-listing", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  activateListing,
}));
vi.mock(
  "../../src/modules/listing-publication/application/attach-photo-to-draft",
  async (original) => ({
    ...(await original<Record<string, unknown>>()),
    attachPhotoToDraft,
  }),
);
vi.mock("../../src/modules/listing-publication/application/request-draft-photo-upload", () => ({
  requestDraftPhotoUpload,
}));

import { ActivateListingRejectedError } from "../../src/modules/listing-publication/application/activate-listing";
import { activarBorrador, adjuntarFotoAlBorrador, pedirDestinoDeFoto } from "./actions";

beforeEach(() => {
  activateListing.mockReset();
  attachPhotoToDraft.mockReset();
  requestDraftPhotoUpload.mockReset();
  redirect.mockClear();
  revalidatePath.mockClear();
});

function formDataWith(listingId: string): FormData {
  const form = new FormData();
  form.set("listingId", listingId);
  return form;
}

describe("activarBorrador — el disparador que ninguna ruta tenía", () => {
  it("llama a activateListing con el id del formulario y vuelve a la lista", async () => {
    activateListing.mockResolvedValueOnce({
      listingId: "borrador-1",
      publishedAt: new Date(),
      expiresAt: new Date(),
    });

    await expect(activarBorrador(formDataWith("borrador-1"))).rejects.toThrow(
      "NEXT_REDIRECT:/mis-avisos",
    );

    expect(activateListing).toHaveBeenCalledTimes(1);
    expect(activateListing.mock.calls[0]?.[0]).toEqual({ listingId: "borrador-1" });
    expect(revalidatePath).toHaveBeenCalledWith("/mis-avisos");
  });

  /**
   * La negativa de `activateListing` es lo que la pantalla dibuja. Viaja como
   * CÓDIGO y no como frase: la copia se decide en una tabla, y una URL con
   * castellano adentro sería una segunda tabla que nadie mantiene.
   */
  it("cuando el validador se niega, vuelve con el aviso y sus códigos, no con una frase", async () => {
    activateListing.mockRejectedValueOnce(
      new ActivateListingRejectedError(["photos.required", "zoneId.notInCity"]),
    );

    await expect(activarBorrador(formDataWith("borrador-1"))).rejects.toThrow(
      "NEXT_REDIRECT:/mis-avisos?fallo=borrador-1&motivos=photos.required%2CzoneId.notInCity",
    );
  });

  /**
   * Un borrador que no existe o que es de otra cuenta NO produce una
   * explicación: sube. Decirle a un desconocido «ese borrador no es tuyo» ya
   * sería contarle que existe (AGENTS.md §7, la misma forma que
   * `attachPhotoToDraft` documenta para su propio orden de comprobaciones).
   */
  it("cualquier otro error sube, y no se convierte en una negativa dibujable", async () => {
    activateListing.mockRejectedValueOnce(new Error("ese borrador no es tuyo"));

    await expect(activarBorrador(formDataWith("ajeno"))).rejects.toThrow("ese borrador no es tuyo");
    expect(redirect).not.toHaveBeenCalled();
  });
});

describe("las dos mitades de subir una foto", () => {
  it("pide el destino por el caso de uso y devuelve la fecha serializada", async () => {
    requestDraftPhotoUpload.mockResolvedValueOnce({
      key: "incoming/broker-1/token",
      url: "https://r2.example/put",
      expiresAt: new Date("2026-08-27T12:05:00.000Z"),
    });

    const destino = await pedirDestinoDeFoto({
      listingId: "borrador-1",
      contentType: "image/webp",
      byteLength: 38_000,
    });

    expect(requestDraftPhotoUpload.mock.calls[0]?.[0]).toEqual({
      listingId: "borrador-1",
      contentType: "image/webp",
      byteLength: 38_000,
    });
    // Una `Date` no sobrevive el cruce hacia el componente cliente.
    expect(destino.expiresAt).toBe("2026-08-27T12:05:00.000Z");
  });

  /**
   * **Adjuntar pasa por `attachPhotoToDraft` y por ningún otro lado**, que es
   * lo que mantiene la foto dentro de `processUploadedPhoto` — el único punto
   * donde vive el rechazo por foto duplicada entre cuentas (tarea 4.7). Un
   * camino que escribiera la fila de foto por su cuenta reabriría ese
   * agujero.
   */
  it("adjunta por attachPhotoToDraft y refresca la lista, que cuenta fotos", async () => {
    attachPhotoToDraft.mockResolvedValueOnce({ listingId: "borrador-1", position: 0 });

    const resultado = await adjuntarFotoAlBorrador({
      listingId: "borrador-1",
      key: "incoming/broker-1/token",
      contentType: "image/webp",
    });

    expect(attachPhotoToDraft.mock.calls[0]?.[0]).toEqual({
      listingId: "borrador-1",
      incomingKey: "incoming/broker-1/token",
      declaredContentType: "image/webp",
    });
    expect(resultado.position).toBe(0);
    expect(revalidatePath).toHaveBeenCalledWith("/mis-avisos");
  });
});
