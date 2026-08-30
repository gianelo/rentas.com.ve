import { describe, expect, it } from "vitest";
import {
  type EditableListingSnapshot,
  type ListingEditPlan,
  type ListingEditViolation,
  type ListingEditWrite,
  planListingEdit,
} from "./listing-edit";
import type { CuratedZone } from "./publishable-listing";

/**
 * tasks.md 18.14 — la tabla que el fundador decidió el 2026-08-29, campo por
 * campo, probada como regla y no como formulario.
 *
 * **Por qué la negativa vive acá y no en la pantalla.** Un formulario que
 * simplemente no dibuja «quién publica» no es una garantía: es una omisión.
 * La importación de cartera y el camino de publicar llaman al mismo
 * validador, y una regla escrita en un `<form>` es una regla que ninguno de
 * los dos tiene (AGENTS.md §1).
 */

const CITY = "city-distrito-capital";
const ZONE = "zone-chacao";

const ZONES: readonly CuratedZone[] = [{ id: ZONE, cityId: CITY }];

const VALID_DESCRIPTION =
  "Apartamento en piso alto con vista abierta, cocina equipada con linea blanca, " +
  "planta electrica del edificio, vigilancia 24 horas y agua regular por tanque propio.";

function published(overrides: Partial<EditableListingSnapshot> = {}): EditableListingSnapshot {
  return {
    publisherType: "owner",
    propertyType: "apartamento",
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

function rejectionOf(plan: ListingEditPlan): readonly ListingEditViolation[] {
  if (plan.ok) throw new Error("se esperaba un rechazo y la edición fue aceptada");
  return plan.violations;
}

function writeOf(plan: ListingEditPlan): ListingEditWrite {
  if (!plan.ok) throw new Error(`se esperaba aceptación y hubo rechazo: ${plan.violations.join()}`);
  return plan.write;
}

describe("planListingEdit — quién publica no se puede cambiar después (18.14)", () => {
  it("rechaza un tipo de publicador distinto del que el aviso ya declaró, y no escribe nada", () => {
    const plan = planListingEdit(published({ publisherType: "owner" }), ZONES, {
      publisherType: "broker",
    });

    expect(rejectionOf(plan)).toContain("publisherType.immutable");
  });

  it("repetir el MISMO tipo de publicador no es un cambio, y no se rechaza", () => {
    // Sin esta prueba la anterior aceptaría las dos respuestas: un validador
    // que rechazara cualquier mención de `publisherType` la pasaría igual, y
    // nadie sabría si lo prohibido es cambiarlo o nombrarlo.
    const plan = planListingEdit(published({ publisherType: "broker" }), ZONES, {
      publisherType: "broker",
      priceUsd: 700,
    });

    expect(writeOf(plan).priceUsd).toBe(700);
  });

  it("lo que la edición escribe son ocho campos y ninguno más: ni quién publica, ni la zona, ni el tipo", () => {
    const plan = planListingEdit(published(), ZONES, { title: "Otro título del aviso" });

    expect(Object.keys(writeOf(plan)).sort()).toEqual([
      "areaM2",
      "bathrooms",
      "contactMethod",
      "contactValue",
      "description",
      "priceUsd",
      "rooms",
      "title",
    ]);
  });
});

describe("planListingEdit — lo que la oferta sí puede tocar (18.14)", () => {
  it("una edición vacía devuelve el aviso exactamente como estaba", () => {
    const current = published();

    expect(writeOf(planListingEdit(current, ZONES, {}))).toEqual({
      title: current.title,
      description: current.description,
      priceUsd: current.priceUsd,
      rooms: current.rooms,
      bathrooms: current.bathrooms,
      areaM2: current.areaM2,
      contactMethod: current.contactMethod,
      contactValue: current.contactValue,
    });
  });

  it("el contacto de ESTE aviso se cambia, que es lo que el fundador autorizó", () => {
    // «El que reveló, reveló. Si entra de nuevo que vea el contacto nuevo.»
    const write = writeOf(
      planListingEdit(published(), ZONES, {
        contactMethod: "email",
        contactValue: "dueno@example.com",
      }),
    );

    expect(write.contactMethod).toBe("email");
    expect(write.contactValue).toBe("dueno@example.com");
  });

  it("corregir habitaciones, baños y metros² a la vez escribe los tres", () => {
    const write = writeOf(
      planListingEdit(published(), ZONES, { rooms: 4, bathrooms: 3, areaM2: 150 }),
    );

    expect([write.rooms, write.bathrooms, write.areaM2]).toEqual([4, 3, 150]);
  });
});

describe("planListingEdit — edita con las MISMAS reglas con las que se publica (18.14)", () => {
  it("un precio en cero se rechaza al editar con la misma violación que al publicar", () => {
    expect(rejectionOf(planListingEdit(published(), ZONES, { priceUsd: 0 }))).toContain(
      "priceUsd.invalid",
    );
  });

  it("un título más largo que el máximo se rechaza al editar", () => {
    expect(rejectionOf(planListingEdit(published(), ZONES, { title: "a".repeat(91) }))).toContain(
      "title.tooLong",
    );
  });

  it("devuelve TODAS las violaciones de una edición, no la primera", () => {
    const plan = planListingEdit(published(), ZONES, {
      title: "   ",
      priceUsd: -1,
      contactMethod: "email",
      contactValue: "no-es-un-correo",
    });

    expect([...rejectionOf(plan)].sort()).toEqual([
      "contactValue.invalid",
      "priceUsd.invalid",
      "title.required",
    ]);
  });

  it("una edición no puede dejar el aviso por debajo del piso de fotos que rige al activar", () => {
    // El piso y el tope son los que ya shipean (`MIN_PHOTOS_FOR_ACTIVATION`,
    // `MAX_PHOTOS_PER_LISTING`), no un número reescrito acá: editar valida en
    // etapa `"activation"`, igual que activar.
    expect(
      rejectionOf(planListingEdit(published({ photoCount: 0 }), ZONES, { priceUsd: 700 })),
    ).toContain("photos.required");
  });

  it("una edición no puede dejar el aviso por encima del tope de fotos", () => {
    expect(
      rejectionOf(planListingEdit(published({ photoCount: 7 }), ZONES, { priceUsd: 700 })),
    ).toContain("photos.tooMany");
  });

  it("la zona del aviso se valida contra el catálogo aunque la edición no la toque", () => {
    expect(
      rejectionOf(planListingEdit(published({ zoneId: "zone-que-ya-no-existe" }), ZONES, {})),
    ).toContain("zoneId.notInCity");
  });
});
