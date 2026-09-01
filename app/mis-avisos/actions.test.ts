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

const {
  activateListing,
  attachPhotoToDraft,
  editListing,
  requestDraftPhotoUpload,
  attachPhotoToListing,
  detachPhotoFromListing,
  requestListingPhotoUpload,
  redirect,
  revalidatePath,
} = vi.hoisted(() => ({
  activateListing: vi.fn(),
  attachPhotoToDraft: vi.fn(),
  editListing: vi.fn(),
  requestDraftPhotoUpload: vi.fn(),
  attachPhotoToListing: vi.fn(),
  detachPhotoFromListing: vi.fn(),
  requestListingPhotoUpload: vi.fn(),
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
// Misma razón que arriba: `EditListingRejectedError` tiene que ser la clase
// REAL, o el `instanceof` de la acción daría falso justo donde importa.
vi.mock("../../src/modules/listing-publication/application/edit-listing", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  editListing,
}));
// Y otra vez: `ListingPhotoRemovalRefusedError` tiene que ser la clase REAL.
vi.mock(
  "../../src/modules/listing-publication/application/edit-listing-photos",
  async (original) => ({
    ...(await original<Record<string, unknown>>()),
    attachPhotoToListing,
    detachPhotoFromListing,
    requestListingPhotoUpload,
  }),
);

import { ActivateListingRejectedError } from "../../src/modules/listing-publication/application/activate-listing";
import {
  EditListingNotFoundError,
  EditListingRejectedError,
} from "../../src/modules/listing-publication/application/edit-listing";
import { ListingPhotoRemovalRefusedError } from "../../src/modules/listing-publication/application/edit-listing-photos";
import type { ListingEdit } from "../../src/modules/listing-publication/domain/listing-edit";
import {
  activarBorrador,
  adjuntarFotoAlAviso,
  adjuntarFotoAlBorrador,
  guardarEdicion,
  pedirDestinoDeFoto,
  pedirDestinoDeFotoDelAviso,
  quitarFotoDelAviso,
} from "./actions";

beforeEach(() => {
  activateListing.mockReset();
  attachPhotoToDraft.mockReset();
  attachPhotoToListing.mockReset();
  detachPhotoFromListing.mockReset();
  requestListingPhotoUpload.mockReset();
  editListing.mockReset();
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

/**
 * tasks.md 18.20 — **el llamador que no existía.**
 *
 * `editListing`, `planListingEdit`, `ListingEditPort` y `DrizzleListingEdit`
 * shipearon enteros, probados y sin una sola ruta que los invocara: un dueño
 * no podía corregir su precio aunque el dominio supiera cómo. Es la sexta vez
 * que este trabajo encuentra la misma forma de defecto. **Lo que este bloque
 * prueba es exactamente eso y nada más**: que un POST del formulario llega al
 * caso de uso. Qué campos se pueden tocar lo prueba `listing-edit.test.ts`,
 * en el dominio y bajo el piso del 90%.
 */
function edicionDe(campos: Record<string, string>): FormData {
  const form = new FormData();
  form.set("listingId", "aviso-1");
  for (const [key, value] of Object.entries(campos)) form.set(key, value);
  return form;
}

const CAMPOS = {
  title: "Apartamento amoblado en La Castellana",
  description: "Una descripción larga que el dominio ya valida en su propia prueba.",
  priceUsd: "700",
  rooms: "3",
  bathrooms: "2",
  areaM2: "128",
  parkingSpots: "1",
  propertyType: "apartamento",
  reference: "Frente a la panadería",
  contactMethod: "whatsapp",
  contactValue: "04121234567",
};

describe("guardarEdicion — la ruta que le faltaba a editListing (18.20)", () => {
  it("llama a editListing con el id del formulario y los once campos editables, y vuelve a la lista", async () => {
    editListing.mockResolvedValueOnce({ listingId: "aviso-1" });

    await expect(guardarEdicion(edicionDe(CAMPOS))).rejects.toThrow("NEXT_REDIRECT:/mis-avisos");

    expect(editListing).toHaveBeenCalledTimes(1);
    expect(editListing.mock.calls[0]?.[0]).toEqual({
      listingId: "aviso-1",
      edit: {
        title: CAMPOS.title,
        description: CAMPOS.description,
        priceUsd: 700,
        rooms: 3,
        bathrooms: 2,
        areaM2: 128,
        parkingSpots: 1,
        propertyType: "apartamento",
        reference: "Frente a la panadería",
        contactMethod: "whatsapp",
        contactValue: "04121234567",
        publisherType: undefined,
      },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/mis-avisos");
  });

  /**
   * `Number("")` es 0, y ese cero silencioso es la diferencia entre no tocar
   * el precio y publicar un alquiler gratis. Los lectores se reusan de
   * `step-values.ts` justamente para no volver a escribir esta decisión.
   */
  it("un campo vacío viaja como ausente y nunca como cero", async () => {
    editListing.mockResolvedValueOnce({ listingId: "aviso-1" });

    await expect(guardarEdicion(edicionDe({ ...CAMPOS, priceUsd: "", rooms: "" }))).rejects.toThrow(
      "NEXT_REDIRECT:/mis-avisos",
    );

    const [pedido] = editListing.mock.calls[0] as [{ edit: Record<string, unknown> }];
    const edit = pedido.edit;
    expect(edit.priceUsd).toBeUndefined();
    expect(edit.rooms).toBeUndefined();
  });

  /**
   * **El POST lo lleva al dominio y esta capa no lo juzga** — ni siquiera desde
   * la 18.38, que abre una de las dos direcciones. Una acción de servidor es un
   * endpoint HTTP público: decidir acá cuál sentido pasa pondría la mitad de la
   * regla fuera del piso del 90 % (AGENTS.md §1), y un aviso de inmobiliaria
   * podría volver a dueño por un POST que esta pantalla no dibuja.
   */
  it("un tipo de publicador que llegue en el POST viaja al dominio, que es quien decide", async () => {
    editListing.mockResolvedValueOnce({ listingId: "aviso-1" });

    await expect(guardarEdicion(edicionDe({ ...CAMPOS, publisherType: "broker" }))).rejects.toThrow(
      "NEXT_REDIRECT:/mis-avisos",
    );

    const [pedido] = editListing.mock.calls[0] as [{ edit: Record<string, unknown> }];
    const edit = pedido.edit;
    expect(edit.publisherType).toBe("broker");
  });

  /**
   * tasks.md 18.27 — **la referencia es el único campo con dos ausencias.** El
   * dominio decide qué hacer con cada una; lo que se prueba acá es que la acción
   * no las aplasta en una sola antes de llegar: `formText` devuelve `undefined`
   * para lo vacío, y mandarlo así haría que `?? current` diera la seña de ayer
   * por buena y que borrarla fuera imposible desde la pantalla.
   */
  it("la referencia en blanco viaja como cadena vacía, y ausente del POST viaja como ausente", async () => {
    editListing.mockResolvedValueOnce({ listingId: "aviso-1" });
    await expect(guardarEdicion(edicionDe({ ...CAMPOS, reference: "  " }))).rejects.toThrow(
      "NEXT_REDIRECT:/mis-avisos",
    );
    const [primero] = editListing.mock.calls[0] as [{ edit: ListingEdit }];
    expect(primero.edit.reference).toBe("");

    editListing.mockResolvedValueOnce({ listingId: "aviso-1" });
    const { reference: _sin, ...sinReferencia } = CAMPOS;
    await expect(guardarEdicion(edicionDe(sinReferencia))).rejects.toThrow(
      "NEXT_REDIRECT:/mis-avisos",
    );
    const [segundo] = editListing.mock.calls[1] as [{ edit: ListingEdit }];
    expect(segundo.edit.reference).toBeUndefined();
  });

  /** Cero puestos es una respuesta, y llega como cero y no como ausente: es el
   *  único campo numérico del aviso donde el vacío significa algo. */
  it("dejar los puestos en blanco viaja como cero, no como «no contestó»", async () => {
    editListing.mockResolvedValueOnce({ listingId: "aviso-1" });

    await expect(guardarEdicion(edicionDe({ ...CAMPOS, parkingSpots: "" }))).rejects.toThrow(
      "NEXT_REDIRECT:/mis-avisos",
    );

    const [pedido] = editListing.mock.calls[0] as [{ edit: ListingEdit }];
    expect(pedido.edit.parkingSpots).toBe(0);
  });

  it("una negativa del dominio vuelve a la pantalla de editar con los códigos, no con la frase", async () => {
    editListing.mockRejectedValueOnce(
      new EditListingRejectedError(["publisherType.immutable", "priceUsd.invalid"]),
    );

    await expect(guardarEdicion(edicionDe(CAMPOS))).rejects.toThrow(
      "NEXT_REDIRECT:/mis-avisos/aviso-1/editar?motivos=publisherType.immutable%2CpriceUsd.invalid&largoTitulo=37&largoDescripcion=67",
    );
  });

  /**
   * tasks.md 18.25 — **la negativa vuelve con la medida de lo que se envió.**
   *
   * El contador decía «Vas 0» sobre una descripción de 24 caracteres porque lo
   * único que volvía eran los códigos, y la corrección obvia —leer la
   * descripción guardada— habría dicho el largo de otra. Vuelve el número, que
   * es lo único que la frase dibuja, y por eso cabe en una dirección: es la
   * misma asimetría que la 18.19 midió del otro lado.
   */
  it("la negativa lleva la medida de lo que se envió, jamás el texto", async () => {
    const description = "Corta, muy corta de más.";
    editListing.mockRejectedValueOnce(new EditListingRejectedError(["description.tooShort"]));

    await expect(guardarEdicion(edicionDe({ ...CAMPOS, description }))).rejects.toThrow(
      "NEXT_REDIRECT:/mis-avisos/aviso-1/editar?motivos=description.tooShort&largoTitulo=37&largoDescripcion=24",
    );

    const [destino] = redirect.mock.calls.at(-1) as [string];
    expect(destino).not.toContain("Corta");
    expect(destino.length).toBeLessThan(120);
  });

  it("mide en puntos de código, igual que el validador que la rechazó", async () => {
    editListing.mockRejectedValueOnce(new EditListingRejectedError(["description.tooShort"]));

    await expect(
      guardarEdicion(edicionDe({ ...CAMPOS, description: "🏠".repeat(10) })),
    ).rejects.toThrow("largoDescripcion=10");
  });

  it("un campo vacío no manda una medida, porque no se envió ninguno", async () => {
    editListing.mockRejectedValueOnce(new EditListingRejectedError(["description.required"]));

    const [destino] = await guardarEdicion(edicionDe({ ...CAMPOS, description: "" }))
      .then(() => [""])
      .catch(() => redirect.mock.calls.at(-1) as [string]);

    expect(destino).toContain("motivos=description.required");
    expect(destino).not.toContain("largoDescripcion");
  });

  /**
   * Un aviso ajeno y uno inexistente tiran el MISMO error, y ninguno se
   * convierte en una negativa dibujable: sube, y Next contesta como ante
   * cualquier otro fallo (AGENTS.md §7).
   */
  it("un aviso ajeno o inexistente sube, y no se convierte en una explicación", async () => {
    editListing.mockRejectedValueOnce(new EditListingNotFoundError("aviso-1"));

    await expect(guardarEdicion(edicionDe(CAMPOS))).rejects.toBeInstanceOf(
      EditListingNotFoundError,
    );
    expect(redirect).not.toHaveBeenCalled();
  });
});

/**
 * tasks.md 18.21 — **el cable de las fotos de un aviso publicado.**
 *
 * Otra vez el cable y no la regla: el piso, el tope, el ascenso de la portada y
 * la puerta ya están probados en `edit-listing-photos.test.ts` y en la prueba
 * de integración. Acá sólo se prueba que una ruta los llame y qué dirección
 * devuelve.
 */
describe("las fotos de un aviso publicado (18.21)", () => {
  it("adjuntar pasa por el caso de uso del aviso, no por el del borrador", async () => {
    attachPhotoToListing.mockResolvedValue({ listingId: "aviso-1", position: 2 });

    const result = await adjuntarFotoAlAviso({
      listingId: "aviso-1",
      key: "incoming/dueno-1/9c1d4e6f8a2b0c3d5e7f9a1b3c5d7e9f",
      contentType: "image/webp",
    });

    expect(result).toEqual({ position: 2 });
    expect(attachPhotoToListing).toHaveBeenCalledWith(
      {
        listingId: "aviso-1",
        incomingKey: "incoming/dueno-1/9c1d4e6f8a2b0c3d5e7f9a1b3c5d7e9f",
        declaredContentType: "image/webp",
      },
      expect.anything(),
    );
    // El de un borrador NO se llama: son dos puertas distintas sobre la misma
    // tabla, y confundirlas sería ensanchar el `WHERE` de `findDraftById`.
    expect(attachPhotoToDraft).not.toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith("/mis-avisos/aviso-1/editar");
  });

  it("firmar pasa por el caso de uso del aviso y devuelve la fecha serializada", async () => {
    requestListingPhotoUpload.mockResolvedValue({
      key: "incoming/dueno-1/token",
      url: "https://r2.example/put",
      expiresAt: new Date("2026-03-01T00:10:00.000Z"),
    });

    const destino = await pedirDestinoDeFotoDelAviso({
      listingId: "aviso-1",
      contentType: "image/webp",
      byteLength: 38_000,
    });

    expect(destino.expiresAt).toBe("2026-03-01T00:10:00.000Z");
    expect(requestDraftPhotoUpload).not.toHaveBeenCalled();
  });

  it("quitar una foto vuelve a la pantalla de editar, sin decir nada cuando la portada no se movió", async () => {
    detachPhotoFromListing.mockResolvedValue({ listingId: "aviso-1", coverChangedTo: null });

    const formData = new FormData();
    formData.set("listingId", "aviso-1");
    formData.set("photoId", "foto-c");

    await expect(quitarFotoDelAviso(formData)).rejects.toThrow(
      "NEXT_REDIRECT:/mis-avisos/aviso-1/editar",
    );
    expect(detachPhotoFromListing).toHaveBeenCalledWith(
      { listingId: "aviso-1", photoId: "foto-c" },
      expect.anything(),
    );
  });

  it("cuando la portada se movió lo dice en la dirección, que es el par de la anterior", async () => {
    detachPhotoFromListing.mockResolvedValue({ listingId: "aviso-1", coverChangedTo: "foto-b" });

    const formData = new FormData();
    formData.set("listingId", "aviso-1");
    formData.set("photoId", "foto-a");

    await expect(quitarFotoDelAviso(formData)).rejects.toThrow(
      "NEXT_REDIRECT:/mis-avisos/aviso-1/editar?portada=1",
    );
  });

  it("una negativa del dominio vuelve como código, jamás como frase", async () => {
    detachPhotoFromListing.mockRejectedValue(
      new ListingPhotoRemovalRefusedError("aviso-1", "lastPhoto"),
    );

    const formData = new FormData();
    formData.set("listingId", "aviso-1");
    formData.set("photoId", "foto-a");

    await expect(quitarFotoDelAviso(formData)).rejects.toThrow(
      "NEXT_REDIRECT:/mis-avisos/aviso-1/editar?foto=lastPhoto",
    );
  });

  it("un aviso ajeno o inexistente sube, y no se convierte en una explicación", async () => {
    detachPhotoFromListing.mockRejectedValue(new Error("cualquier otra cosa"));

    const formData = new FormData();
    formData.set("listingId", "aviso-1");
    formData.set("photoId", "foto-a");

    await expect(quitarFotoDelAviso(formData)).rejects.toThrow("cualquier otra cosa");
    expect(redirect).not.toHaveBeenCalled();
  });
});
