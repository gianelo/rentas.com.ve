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

  it("lo que la edición escribe son once campos y ninguno más: ni quién publica, ni la zona, ni la ciudad", () => {
    const plan = planListingEdit(published(), ZONES, { title: "Otro título del aviso" });

    expect(Object.keys(writeOf(plan)).sort()).toEqual([
      "areaM2",
      "bathrooms",
      "contactMethod",
      "contactValue",
      "description",
      "parkingSpots",
      "priceUsd",
      "propertyType",
      "reference",
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
      propertyType: current.propertyType,
      parkingSpots: current.parkingSpots,
      reference: current.reference,
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

/**
 * tasks.md 18.27 — **la regla general del fundador, dicha el 2026-09-01:** «Se
 * puede corregir cualquier dato menos el de la zona, y eso porque va con la URL
 * del SEO y eso no puede cambiar.»
 *
 * Es más ancha que la tabla campo por campo del 2026-08-29 y la reemplaza. Lo que
 * abre acá son los tres campos del aviso que estaban cerrados sin una razón de
 * integridad: la referencia, el tipo de inmueble y los puestos.
 */
describe("planListingEdit — los tres campos que la regla del fundador abre (18.27)", () => {
  it("la referencia, el tipo de inmueble y los puestos se corrigen", () => {
    const write = writeOf(
      planListingEdit(published(), ZONES, {
        reference: "A dos calles de la plaza Altamira",
        propertyType: "anexo",
        parkingSpots: 2,
      }),
    );

    expect(write.reference).toBe("A dos calles de la plaza Altamira");
    expect(write.propertyType).toBe("anexo");
    expect(write.parkingSpots).toBe(2);
  });

  /**
   * **El único campo opcional de la edición, y por eso el único con dos
   * ausencias distintas.** Mandarlo en blanco es «no tengo ninguna» y tiene que
   * borrar la que había; no mandarlo es «no lo contesté» y deja la de ayer. Sin
   * esto, una seña equivocada se corrige pero no se saca.
   */
  it("la referencia en blanco borra la que había, y no mandarla la deja como estaba", () => {
    const con = published({ reference: "Frente a la panadería" });

    expect(writeOf(planListingEdit(con, ZONES, { reference: "   " })).reference).toBeUndefined();
    expect(writeOf(planListingEdit(con, ZONES, {})).reference).toBe("Frente a la panadería");
  });

  /** Cero puestos es un HECHO, no un campo sin contestar: un anexo sin puesto es
   *  un aviso normal, y `?? current` lo tiene que dejar pasar. */
  it("bajar los puestos a cero se guarda como cero, no como «no contestó»", () => {
    expect(writeOf(planListingEdit(published(), ZONES, { parkingSpots: 0 })).parkingSpots).toBe(0);
  });

  it("los tres se validan con las MISMAS reglas con las que se publican", () => {
    expect(
      rejectionOf(planListingEdit(published(), ZONES, { reference: "a".repeat(121) })),
    ).toContain("reference.tooLong");
    expect(
      rejectionOf(planListingEdit(published(), ZONES, { propertyType: "galpón" as never })),
    ).toContain("propertyType.invalid");
    expect(rejectionOf(planListingEdit(published(), ZONES, { parkingSpots: -1 }))).toContain(
      "parkingSpots.invalid",
    );
  });

  /**
   * **La zona y la ciudad siguen cerradas, y ésta es la prueba que se rompe si
   * alguien las abre.** Van en la URL —`/alquiler/<ciudad>/<zona>/<slug>-<id>`— y
   * la ciudad la determina la zona. El título también va en esa URL y sí es
   * editable: el último segmento termina en el id y `listingIdFromSlug` resuelve
   * por id, así que la dirección vieja sigue encontrando el aviso. La zona no
   * tiene ese rescate — es su propio segmento y no lleva ningún id adentro.
   *
   * Un pedido con zona ajena entra por un `as never` a propósito: el tipo ya la
   * prohíbe, y esto prueba que **una acción de servidor —que es un endpoint HTTP
   * público— tampoco la aplica** aunque alguien la mande igual.
   */
  it("una zona o una ciudad mandadas igual no llegan al aviso ni lo rechazan", () => {
    const write = writeOf(
      planListingEdit(published(), ZONES, {
        zoneId: "zone-de-otra-ciudad",
        cityId: "city-inventada",
      } as never),
    );

    // Si `writeFor` las copiara, el validador vería una zona que no está en el
    // catálogo de esta ciudad y esto sería un rechazo, no una escritura.
    expect(write).not.toHaveProperty("zoneId");
    expect(write).not.toHaveProperty("cityId");
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
