import { describe, expect, it, vi } from "vitest";
import type { SessionPort } from "../../identity/application/ports/session.port";
import { UnauthenticatedError } from "../../identity/application/require-authenticated-session";
import {
  EditListingNotFoundError,
  EditListingRejectedError,
  editListing,
  loadListingForEdit,
} from "./edit-listing";
import type { EditableListing, ListingEditPort } from "./ports/listing-edit.port";
import type { ZoneCataloguePort } from "./ports/zone-catalogue.port";

/**
 * tasks.md 18.14 — el camino de escritura de una edición, probado contra
 * dobles.
 *
 * **Lo que un doble NO puede probar, y por eso hay además una integración**
 * (`tests/integration/listing-edit.test.ts`): que el `UPDATE` de verdad lleva
 * `publisher_id` y `status = 'active'` en su `WHERE`. Un doble prueba el
 * doble. Acá se prueba lo que este caso de uso decide: el orden de las
 * puertas, que un aviso ajeno se conteste igual que uno inexistente, y que
 * ninguna negativa escriba.
 */

const OWNER = "user-owner";
const STRANGER = "user-stranger";
const CITY = "city-distrito-capital";
const ZONE = "zone-chacao";
const LISTING = "listing-1";

const VALID_DESCRIPTION =
  "Apartamento en piso alto con vista abierta, cocina equipada con linea blanca, " +
  "planta electrica del edificio, vigilancia 24 horas y agua regular por tanque propio.";

function listing(overrides: Partial<EditableListing> = {}): EditableListing {
  return {
    id: LISTING,
    publisherId: OWNER,
    publisherType: "owner",
    propertyType: "apartamento",
    hasPowerPlant: false,
    hasRegularWater: false,
    isFurnished: false,
    hasSecurity: false,
    hasAppliances: false,
    cityId: CITY,
    zoneId: ZONE,
    title: "Apartamento amoblado en La Castellana",
    description: VALID_DESCRIPTION,
    priceUsd: 610,
    rooms: 3,
    areaM2: 128,
    bathrooms: 2,
    parkingSpots: 1,
    contactMethod: "whatsapp",
    contactValue: "04121234567",
    photoCount: 3,
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

const zones: ZoneCataloguePort = {
  async listZonesForCity(cityId) {
    return cityId === CITY ? [{ id: ZONE, cityId: CITY }] : [];
  },
};

function portReturning(found: EditableListing | null, applied = true) {
  const findEditableById = vi.fn(async () => found);
  const applyEdit = vi.fn(async () => applied);
  return { findEditableById, applyEdit } satisfies ListingEditPort;
}

describe("editListing — la puerta, y el aviso ajeno que se contesta como inexistente", () => {
  it("sin sesión no toca el catálogo", async () => {
    const listings = portReturning(listing());

    await expect(
      editListing(
        { listingId: LISTING, edit: {} },
        { sessionPort: sessionPortReturning(null), zones, listings },
      ),
    ).rejects.toBeInstanceOf(UnauthenticatedError);

    expect(listings.findEditableById).not.toHaveBeenCalled();
  });

  it("busca el aviso acotado a QUIEN ESTÁ EN LA SESIÓN, nunca a un id del pedido", async () => {
    const listings = portReturning(listing());

    await editListing(
      { listingId: LISTING, edit: {} },
      { sessionPort: sessionPortReturning(OWNER), zones, listings },
    );

    expect(listings.findEditableById).toHaveBeenCalledWith(LISTING, OWNER);
  });

  it("un aviso que la consulta no devuelve es «no existe», y no escribe nada", async () => {
    const listings = portReturning(null);

    await expect(
      editListing(
        { listingId: LISTING, edit: { priceUsd: 700 } },
        { sessionPort: sessionPortReturning(OWNER), zones, listings },
      ),
    ).rejects.toBeInstanceOf(EditListingNotFoundError);

    expect(listings.applyEdit).not.toHaveBeenCalled();
  });

  it("un aviso de otra cuenta da EXACTAMENTE el mismo error que uno inexistente, y no escribe", async () => {
    // No hay `EditListingNotOwnedError`: decirle a un desconocido «ese aviso
    // no es tuyo» ya le cuenta que existe (AGENTS.md §7).
    const listings = portReturning(listing({ publisherId: STRANGER }));

    await expect(
      editListing(
        { listingId: LISTING, edit: { priceUsd: 700 } },
        { sessionPort: sessionPortReturning(OWNER), zones, listings },
      ),
    ).rejects.toBeInstanceOf(EditListingNotFoundError);

    expect(listings.applyEdit).not.toHaveBeenCalled();
  });

  it("si el UPDATE no encuentra la fila que la lectura vio, contesta «no existe» en vez de mentir", async () => {
    const listings = portReturning(listing(), false);

    await expect(
      editListing(
        { listingId: LISTING, edit: { priceUsd: 700 } },
        { sessionPort: sessionPortReturning(OWNER), zones, listings },
      ),
    ).rejects.toBeInstanceOf(EditListingNotFoundError);
  });
});

describe("editListing — lo que escribe y lo que refusa (18.14)", () => {
  it("escribe los dieciséis campos editables con el catálogo de zonas de SU ciudad", async () => {
    const listings = portReturning(listing());

    const result = await editListing(
      {
        listingId: LISTING,
        edit: { priceUsd: 700, contactMethod: "email", contactValue: "d@example.com" },
      },
      { sessionPort: sessionPortReturning(OWNER), zones, listings },
    );

    expect(result).toEqual({ listingId: LISTING });
    expect(listings.applyEdit).toHaveBeenCalledWith(LISTING, OWNER, {
      title: "Apartamento amoblado en La Castellana",
      description: VALID_DESCRIPTION,
      priceUsd: 700,
      rooms: 3,
      bathrooms: 2,
      areaM2: 128,
      parkingSpots: 1,
      propertyType: "apartamento",
      // Sin seña en el aviso, y se escribe igual: el `set` la lleva SIEMPRE,
      // porque «sin referencia» es un valor y no una columna que no se toca.
      reference: undefined,
      contactMethod: "email",
      contactValue: "d@example.com",
      // Los cinco de la F6 (18.37), tal como el aviso los tenía: el pedido no
      // los trajo, así que `?? current` los deja donde estaban.
      hasPowerPlant: false,
      hasRegularWater: false,
      isFurnished: false,
      hasSecurity: false,
      hasAppliances: false,
    });
  });

  it("cambiar el tipo de publicador se refusa nombrando la violación, y no escribe nada", async () => {
    const listings = portReturning(listing({ publisherType: "owner" }));

    const error = await editListing(
      { listingId: LISTING, edit: { publisherType: "broker", priceUsd: 700 } },
      { sessionPort: sessionPortReturning(OWNER), zones, listings },
    ).catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(EditListingRejectedError);
    expect((error as EditListingRejectedError).violations).toContain("publisherType.immutable");
    expect(listings.applyEdit).not.toHaveBeenCalled();
  });

  it("una violación de publicar refusa la edición entera, no sólo el campo malo", async () => {
    const listings = portReturning(listing());

    const error = await editListing(
      { listingId: LISTING, edit: { priceUsd: 0, title: "Un título nuevo" } },
      { sessionPort: sessionPortReturning(OWNER), zones, listings },
    ).catch((thrown: unknown) => thrown);

    expect((error as EditListingRejectedError).violations).toContain("priceUsd.invalid");
    expect(listings.applyEdit).not.toHaveBeenCalled();
  });
});

/**
 * tasks.md 18.20 — **la lectura que la pantalla precarga**, con las mismas
 * puertas que la escritura y contestando lo mismo cuando refusa.
 *
 * Vive al lado de `editListing` y no en un archivo propio a propósito: son la
 * lectura y la escritura de UNA capacidad, comparten `EditListingNotFoundError`
 * y comparten el puerto. Separarlas invitaría a que la pantalla refusara con
 * un error distinto del que refusa el guardado, y entonces un aviso ajeno
 * sería distinguible de uno inexistente en exactamente una de las dos.
 */
describe("loadListingForEdit — lo que la pantalla precarga (18.20)", () => {
  it("sin sesión no toca el puerto", async () => {
    const listings = portReturning(listing());

    await expect(
      loadListingForEdit(
        { listingId: LISTING },
        { sessionPort: sessionPortReturning(null), listings },
      ),
    ).rejects.toBeInstanceOf(UnauthenticatedError);

    expect(listings.findEditableById).not.toHaveBeenCalled();
  });

  it("devuelve el aviso vigente acotado a quien está en la sesión, y no escribe nada", async () => {
    const listings = portReturning(listing());

    const found = await loadListingForEdit(
      { listingId: LISTING },
      { sessionPort: sessionPortReturning(OWNER), listings },
    );

    expect(found.title).toBe("Apartamento amoblado en La Castellana");
    expect(found.priceUsd).toBe(610);
    expect(found.publisherType).toBe("owner");
    expect(listings.findEditableById).toHaveBeenCalledWith(LISTING, OWNER);
    expect(listings.applyEdit).not.toHaveBeenCalled();
  });

  /**
   * Las dos afirmaciones son distintas y las dos hacen falta: que los dos
   * casos tiren `EditListingNotFoundError` no dice nada si el mensaje de uno
   * nombra al dueño. Se compara el texto exacto de los dos errores, que es lo
   * único que prueba que un desconocido no puede distinguirlos.
   */
  it("un aviso ajeno y uno inexistente dan el MISMO error, con el mismo texto", async () => {
    const ajeno = await loadListingForEdit(
      { listingId: LISTING },
      {
        sessionPort: sessionPortReturning(OWNER),
        listings: portReturning(listing({ publisherId: STRANGER })),
      },
    ).then(
      () => null,
      (thrown: unknown) => thrown as Error,
    );

    const inexistente = await loadListingForEdit(
      { listingId: LISTING },
      { sessionPort: sessionPortReturning(OWNER), listings: portReturning(null) },
    ).then(
      () => null,
      (thrown: unknown) => thrown as Error,
    );

    expect(ajeno).toBeInstanceOf(EditListingNotFoundError);
    expect(inexistente).toBeInstanceOf(EditListingNotFoundError);
    expect(ajeno?.message).toBe(inexistente?.message);
  });
});
