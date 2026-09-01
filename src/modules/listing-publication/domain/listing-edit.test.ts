import { describe, expect, it } from "vitest";
import {
  type EditableListingSnapshot,
  editablePublisherTypes,
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
    // Los cinco de la F6 tal como la fila los tiene: `NOT NULL DEFAULT false`,
    // así que un aviso siempre trae los cinco booleanos y nunca un hueco.
    hasPowerPlant: false,
    hasRegularWater: true,
    isFurnished: true,
    hasSecurity: false,
    hasAppliances: true,
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

/** Los cinco de la F6 en el orden de `ListingFeatures`, para leerlos de un tirón. */
function atributos(write: ListingEditWrite): readonly boolean[] {
  return [
    write.hasPowerPlant,
    write.hasRegularWater,
    write.isFurnished,
    write.hasSecurity,
    write.hasAppliances,
  ];
}

function writeOf(plan: ListingEditPlan): ListingEditWrite {
  if (!plan.ok) throw new Error(`se esperaba aceptación y hubo rechazo: ${plan.violations.join()}`);
  return plan.write;
}

/**
 * tasks.md 18.38 — **quién publica se corrige en UNA sola dirección**, decisión
 * del fundador del 2026-09-01.
 *
 * La asimetría es a propósito y su razón vive en `listing-edit.ts`: corregir
 * hacia la honestidad no cuesta nada, y la dirección contraria es exactamente
 * cómo alguien aprende que mentir sale barato. **Las dos mitades hacen falta**:
 * una sola pasa con la guarda entera borrada.
 */
describe("planListingEdit — quién publica, en una sola dirección (18.38)", () => {
  it("de dueño a inmobiliaria se aplica, y se escribe", () => {
    const plan = planListingEdit(published({ publisherType: "owner" }), ZONES, {
      publisherType: "broker",
    });

    expect(writeOf(plan).publisherType).toBe("broker");
  });

  it("de inmobiliaria a dueño se refusa, y no escribe nada", () => {
    const plan = planListingEdit(published({ publisherType: "broker" }), ZONES, {
      publisherType: "owner",
      priceUsd: 700,
    });

    expect(rejectionOf(plan)).toContain("publisherType.immutable");
  });

  /**
   * **Hacia dónde puede moverse lo contesta el dominio, no la pantalla.** Un
   * `<fieldset>` que se dibujara según un `if` de la pantalla sería una regla
   * fuera del piso del 90 % (AGENTS.md §1) — y la lista vacía es lo que hace
   * que a una inmobiliaria no se le ofrezca un control que la guarda va a negar.
   */
  it("un dueño tiene a dónde ir; una inmobiliaria, a ningún lado", () => {
    expect(editablePublisherTypes("owner")).toEqual(["owner", "broker"]);
    expect(editablePublisherTypes("broker")).toEqual([]);
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

  it("lo que la edición escribe son dieciséis campos y ninguno más: ni quién publica, ni la zona, ni la ciudad", () => {
    const plan = planListingEdit(published(), ZONES, { title: "Otro título del aviso" });

    expect(Object.keys(writeOf(plan)).sort()).toEqual([
      "areaM2",
      "bathrooms",
      "contactMethod",
      "contactValue",
      "description",
      "hasAppliances",
      "hasPowerPlant",
      "hasRegularWater",
      "hasSecurity",
      "isFurnished",
      "parkingSpots",
      "priceUsd",
      "propertyType",
      "publisherType",
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
      publisherType: current.publisherType,
      hasPowerPlant: current.hasPowerPlant,
      hasRegularWater: current.hasRegularWater,
      isFurnished: current.isFurnished,
      hasSecurity: current.hasSecurity,
      hasAppliances: current.hasAppliances,
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

/**
 * tasks.md 18.37 — **los cinco atributos de la F6, que la regla general del
 * fundador abre y la 18.27 no llegó a cerrar.** Duelen más que los otros tres
 * porque se filtran: un aviso que declaró «sin planta eléctrica» porque el
 * edificio todavía no la tenía queda fuera de la búsqueda de quien la pide.
 *
 * Lo que estas tres afirman, y ninguna pantalla puede afirmar por su cuenta:
 * que `undefined` sigue siendo «no lo contesté» también para un booleano.
 */
describe("planListingEdit — los cinco atributos de la F6 (18.37)", () => {
  it("declara los cinco cuando el pedido los trae, sin tocar nada más", () => {
    const write = writeOf(
      planListingEdit(published(), ZONES, {
        hasPowerPlant: true,
        hasRegularWater: true,
        isFurnished: true,
        hasSecurity: true,
        hasAppliances: true,
      }),
    );

    expect(atributos(write)).toEqual([true, true, true, true, true]);
  });

  /** **La mitad que hace que la anterior pregunte algo.** Un `writeFor` que
   *  escribiera `edit.hasPowerPlant === true` pasaría la de arriba y borraría
   *  acá las cuatro que el aviso ya declaraba. */
  it("no mandar los atributos deja los cinco como el aviso los tenía", () => {
    const current = published({
      hasPowerPlant: true,
      hasRegularWater: true,
      isFurnished: false,
      hasSecurity: true,
      hasAppliances: false,
    });

    const write = writeOf(planListingEdit(current, ZONES, { priceUsd: 700 }));

    expect(atributos(write)).toEqual([true, true, false, true, false]);
  });

  /** **Y su contrario.** Quien destildó las cinco está declarando que no tiene
   *  ninguna, y eso se escribe: un `?? current` reemplazado por «sólo escribo
   *  los `true`» dejaría un atributo imposible de sacar. */
  it("un false que el pedido trae se escribe, y no se confunde con no haberlo mandado", () => {
    const current = published({ hasPowerPlant: true, hasSecurity: true });

    const write = writeOf(
      planListingEdit(current, ZONES, { hasPowerPlant: false, hasSecurity: false }),
    );

    expect([write.hasPowerPlant, write.hasSecurity]).toEqual([false, false]);
  });
});
