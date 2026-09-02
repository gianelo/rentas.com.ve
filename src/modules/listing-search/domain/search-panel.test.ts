import { describe, expect, it } from "vitest";
import {
  buildSearchPanel,
  relaxableFilters,
  reliefHref,
  type SearchPanelInput,
  toPanelZones,
  withoutFilter,
} from "./search-panel";
import { toSearchZones } from "./zone-catalogue";

const COUNTS = {
  total: 16,
  byZone: { chacao: 12, altamira: 9, castellana: 7, rosal: 0 },
  byMinRooms: { 1: 16, 2: 9, 3: 4, 4: 0 },
  byAttribute: {
    hasPowerPlant: 9,
    hasRegularWater: 12,
    isFurnished: 4,
    hasSecurity: 0,
    hasAppliances: 3,
  },
  byPropertyType: { apartamento: 10, casa: 3, quinta: 1, anexo: 1, habitacion: 1 },
  byPublisherType: { owner: 11, broker: 5 },
  // Las nueve relajaciones y el total pelado de la ciudad viajan en la MISMA
  // consulta que las facetas (14.11), y son la otra mitad del conteo en vivo:
  // cuántos quedarían al soltar cada filtro (14.34).
  withoutFilter: {
    zone: 40,
    price: 22,
    rooms: 31,
    publisherType: 25,
    hasPowerPlant: 18,
    hasRegularWater: 19,
    isFurnished: 20,
    hasSecurity: 21,
    hasAppliances: 23,
  },
  byPriceBucket: [
    { count: 1, lowestUsd: 200, highestUsd: 240 },
    { count: 2, lowestUsd: 300, highestUsd: 380 },
    { count: 4, lowestUsd: 400, highestUsd: 495 },
    { count: 3, lowestUsd: 505, highestUsd: 590 },
    { count: 3, lowestUsd: 610, highestUsd: 690 },
    { count: 1, lowestUsd: 720, highestUsd: 780 },
    { count: 1, lowestUsd: 880, highestUsd: 880 },
    { count: 1, lowestUsd: 1000, highestUsd: 1000 },
  ],
  cityTotal: 70,
} as const;

const BASE: SearchPanelInput = {
  basePath: "/alquiler/distrito-capital",
  cityPath: "/alquiler/distrito-capital",
  query: {},
  cityId: "dc",
  cities: [
    { id: "dc", name: "Distrito Capital", path: "/alquiler/distrito-capital", count: 47 },
    { id: "mcbo", name: "Maracaibo", path: "/alquiler/maracaibo", count: 23 },
  ],
  zones: [
    { id: "chacao", name: "Chacao", slug: "chacao", path: "/alquiler/distrito-capital/chacao" },
    {
      id: "altamira",
      name: "Altamira",
      slug: "altamira",
      path: "/alquiler/distrito-capital/altamira",
    },
    {
      id: "castellana",
      name: "La Castellana",
      slug: "la-castellana",
      path: "/alquiler/distrito-capital/la-castellana",
    },
    {
      id: "rosal",
      name: "El Rosal",
      slug: "el-rosal",
      path: "/alquiler/distrito-capital/el-rosal",
    },
  ],
  chosenZoneIds: [],
  counts: COUNTS,
  criteria: {},
};

function panel(overrides: Partial<SearchPanelInput> = {}) {
  return buildSearchPanel({ ...BASE, ...overrides });
}

describe("el panel entero", () => {
  it("dibuja los cuatro grupos que quedaron (14.32, 14.36)", () => {
    expect(panel().steps.map((step) => step.id)).toEqual([
      "precio",
      "habitaciones",
      "publica",
      "atributos",
    ]);
  });

  it("el botón lleva el total real adentro", () => {
    expect(panel().confirm.label).toBe("Ver 16 avisos");
  });

  it("confirmar cierra el acordeón, y nada más", () => {
    const confirm = panel({ query: { filtros: "precio", min: "250" } }).confirm;

    expect(confirm.kind).toBe("results");
    expect(confirm.kind === "results" && confirm.href).toBe("/alquiler/distrito-capital?min=250");
  });
});

describe("paso 1 · la ciudad (F3)", () => {
  it("cada ciudad lleva su conteo", () => {
    expect(panel().cities.map((city) => city.count)).toEqual([47, 23]);
  });

  it("la ciudad activa se ve elegida, y sólo ella", () => {
    expect(
      panel()
        .cities.filter((city) => city.chosen)
        .map((city) => city.id),
    ).toEqual(["dc"]);
  });

  it("cambiar de ciudad avisa que se pierden las zonas, antes de tocarla", () => {
    const other = panel({
      chosenZoneIds: ["chacao", "altamira"],
      query: { zona: "chacao,altamira" },
    }).cities.find((city) => city.id === "mcbo");

    expect(other?.warning).toContain("Chacao");
    expect(other?.warning).toContain("Altamira");
  });

  it("y la dirección a la que lleva no arrastra ninguna zona", () => {
    const other = panel({
      chosenZoneIds: ["chacao"],
      query: { zona: "chacao", min: "250" },
    }).cities.find((city) => city.id === "mcbo");

    expect(other?.href).not.toContain("zona=");
    expect(other?.href).toContain("/alquiler/maracaibo");
    // El precio no depende de la ciudad, así que sobrevive.
    expect(other?.href).toContain("min=250");
  });

  it("quedarse en la misma ciudad no avisa nada", () => {
    const same = panel({ chosenZoneIds: ["chacao"] }).cities.find((city) => city.id === "dc");

    expect(same?.warning).toBeNull();
  });

  it("elegir ciudad lleva a la otra ciudad, sin abrir ningún grupo", () => {
    const other = panel().cities.find((city) => city.id === "mcbo");

    // Cambiar de ciudad LLEVA a la otra ciudad; ya no abre ningún grupo,
    // porque el panel dejó de tener paso de ciudad (14.36).
    expect(other?.href).not.toContain("filtros=");
  });
});

describe("paso 2 · las zonas (F4)", () => {
  it("cada zona lleva su conteo, y la vacía no lleva número", () => {
    const zones = panel().zones;

    expect(zones.find((zone) => zone.id === "chacao")?.countLabel).toBe("12");
    expect(zones.find((zone) => zone.id === "rosal")?.countLabel).toBeNull();
  });

  it("una sola zona elegida cae en su ruta canónica, sin query de zona", () => {
    const chacao = panel().zones.find((zone) => zone.id === "chacao");

    expect(chacao?.href).toContain("/alquiler/distrito-capital/chacao");
    expect(chacao?.href).not.toContain("zona=");
  });

  it("dos zonas se combinan con O sobre la ruta de la ciudad", () => {
    const altamira = panel({ chosenZoneIds: ["chacao"], query: {} }).zones.find(
      (zone) => zone.id === "altamira",
    );

    expect(altamira?.href).toContain("/alquiler/distrito-capital?");
    expect(altamira?.href).toContain("zona=chacao%2Caltamira");
  });

  it("soltar la única zona vuelve a la ciudad entera", () => {
    const chacao = panel({
      basePath: "/alquiler/distrito-capital/chacao",
      chosenZoneIds: ["chacao"],
    }).zones.find((zone) => zone.id === "chacao");

    expect(chacao?.href).not.toContain("chacao");
    expect(chacao?.href).toContain("/alquiler/distrito-capital");
  });

  it("soltar una de dos deja la ruta canónica de la que queda", () => {
    const chacao = panel({ chosenZoneIds: ["chacao", "altamira"] }).zones.find(
      (zone) => zone.id === "chacao",
    );

    expect(chacao?.href).toContain("/alquiler/distrito-capital/altamira");
  });
});

/**
 * Los ids de este bloque tienen forma de hash porque los de verdad la tienen:
 * `territoryId` los emite así. El fixture de arriba usa ids legibles, y por eso
 * este defecto vivió meses sin que nadie lo viera — con `id === slug` una
 * dirección armada con ids se lee igual de bien que una armada con slugs.
 */
describe("paso 2 · qué viaja en `?zona=` cuando el id es un hash (F12)", () => {
  const CHACAO = "9f1c0d2e-0000-4000-8000-000000000001";
  const ALTAMIRA = "4da5ef52-0000-4000-8000-000000000002";

  const HASHED: SearchPanelInput = {
    ...BASE,
    zones: [
      { id: CHACAO, name: "Chacao", slug: "chacao", path: "/alquiler/distrito-capital/chacao" },
      {
        id: ALTAMIRA,
        name: "Altamira",
        slug: "altamira",
        path: "/alquiler/distrito-capital/altamira",
      },
    ],
    counts: { ...COUNTS, byZone: { [CHACAO]: 12, [ALTAMIRA]: 9 } },
  };

  it("la dirección de dos zonas se lee: `?zona=chacao,altamira`, no dos hashes", () => {
    const altamira = buildSearchPanel({ ...HASHED, chosenZoneIds: [CHACAO] }).zones.find(
      (zone) => zone.id === ALTAMIRA,
    );

    expect(altamira?.href).toContain("zona=chacao%2Caltamira");
    expect(altamira?.href).not.toContain(CHACAO);
    expect(altamira?.href).not.toContain(ALTAMIRA);
  });

  it("el id sigue siendo la clave del conteo, y por eso no se puede reemplazar", () => {
    // Si el slug hubiera reemplazado al id, `byZone` no encontraría la entrada
    // y las dos zonas quedarían en cero — deshabilitadas y sin número.
    const zones = buildSearchPanel(HASHED).zones;

    expect(zones.find((zone) => zone.id === CHACAO)?.countLabel).toBe("12");
    expect(zones.find((zone) => zone.id === ALTAMIRA)?.countLabel).toBe("9");
  });

  it("`toPanelZones` conserva el id y le suma el slug, y recorta por ciudad", () => {
    const panelZones = toPanelZones(
      "/alquiler/distrito-capital",
      toSearchZones([
        { id: CHACAO, cityId: "dc", name: "Chacao" },
        { id: ALTAMIRA, cityId: "dc", name: "Altamira" },
        { id: "otra-ciudad", cityId: "mcbo", name: "Centro" },
      ]),
      "dc",
    );

    expect(panelZones).toEqual([
      { id: CHACAO, name: "Chacao", slug: "chacao", path: "/alquiler/distrito-capital/chacao" },
      {
        id: ALTAMIRA,
        name: "Altamira",
        slug: "altamira",
        path: "/alquiler/distrito-capital/altamira",
      },
    ]);
  });

  it("armado con `toPanelZones`, el conteo sigue encontrándose por id", () => {
    // **La mutación que esto pone en rojo**: reemplazar el id por el slug en
    // `toPanelZones`. `byZone` está indexado por el id real, así que las dos
    // zonas quedarían en cero — deshabilitadas y sin número — sin que nada más
    // falle.
    const zones = buildSearchPanel({
      ...HASHED,
      zones: toPanelZones(
        "/alquiler/distrito-capital",
        toSearchZones([
          { id: CHACAO, cityId: "dc", name: "Chacao" },
          { id: ALTAMIRA, cityId: "dc", name: "Altamira" },
        ]),
        "dc",
      ),
    }).zones;

    expect(zones.find((zone) => zone.id === CHACAO)?.countLabel).toBe("12");
    expect(zones.find((zone) => zone.id === ALTAMIRA)?.countLabel).toBe("9");
    expect(zones.every((zone) => zone.disabled)).toBe(false);
  });

  it("con una sola zona sigue cayendo en su ruta canónica, sin parámetro", () => {
    // Éste es el caso que escondía el defecto: con UNA zona el parámetro
    // desaparece, así que el hash nunca llegaba a verse.
    const chacao = buildSearchPanel(HASHED).zones.find((zone) => zone.id === CHACAO);

    expect(chacao?.href).toContain("/alquiler/distrito-capital/chacao");
    expect(chacao?.href).not.toContain("zona=");
  });
});

describe("paso 3 · el precio (F5)", () => {
  it("es un formulario con los dos extremos, y los dos son opcionales", () => {
    const form = panel({ query: { min: "250" }, criteria: { minPriceUsd: 250 } }).price;

    expect(form.minName).toBe("min");
    expect(form.maxName).toBe("max");
    expect(form.min).toBe("250");
    expect(form.max).toBe("");
  });

  it("los campos muestran el criterio y no lo que la dirección traía", () => {
    // Dos consecuencias, las dos queridas: un `?min=abc` deja el campo vacío en
    // vez de repetir la basura, y un rango invertido se ve YA intercambiado —
    // que es lo que F5 dice que pasó.
    const form = panel({
      query: { min: "900", max: "300" },
      criteria: { minPriceUsd: 300, maxPriceUsd: 900 },
    }).price;

    expect(form.min).toBe("300");
    expect(form.max).toBe("900");
  });

  it("se lleva el resto del estado escondido, menos sus propios campos", () => {
    const form = panel({ query: { min: "250", hab: "2", pag: "3" } }).price;

    expect(form.hidden).toContainEqual({ name: "hab", value: "2" });
    expect(form.hidden.map((field) => field.name)).not.toContain("min");
    expect(form.hidden.map((field) => field.name)).not.toContain("max");
    // Cambiar el precio es cambiar de búsqueda: la página vieja no viaja.
    expect(form.hidden.map((field) => field.name)).not.toContain("pag");
  });

  it("al enviarlo el panel se queda en el precio", () => {
    // El panel queda donde estaba: enviar el precio no salta a otro grupo.
    expect(panel().price.hidden).toContainEqual({ name: "filtros", value: "precio" });
  });
});

describe("paso 4 · habitaciones y atributos (F6)", () => {
  it("los cuatro escalones con su conteo, y el «4+» del último", () => {
    expect(panel().rooms.map((room) => room.label)).toEqual(["1", "2", "3", "4+"]);
    expect(panel().rooms.find((room) => room.step === 2)?.count).toBe(9);
  });

  it("el escalón sin resultados queda deshabilitado", () => {
    expect(panel().rooms.find((room) => room.step === 4)?.disabled).toBe(true);
  });

  it("los cinco atributos con su conteo sobre el total", () => {
    const planta = panel().attributes.find((a) => a.attribute === "hasPowerPlant");

    expect(planta?.note).toBe("9 de 16");
  });

  it("el atributo que ningún resultado cumple queda deshabilitado", () => {
    expect(panel().attributes.find((a) => a.attribute === "hasSecurity")?.disabled).toBe(true);
  });

  it("los atributos se combinan con Y: marcar uno no apaga al otro", () => {
    const marked = panel({ criteria: { attributes: ["hasPowerPlant"] } });
    const agua = marked.attributes.find((a) => a.attribute === "hasRegularWater");

    // El enlace de «agua» agrega agua y no toca la planta que ya está puesta.
    expect(agua?.href).toContain("agua=1");
    expect(marked.attributes.find((a) => a.attribute === "hasPowerPlant")?.chosen).toBe(true);
  });

  it("«sólo de dueños» lleva su propio conteo", () => {
    expect(panel().publisher.count).toBe(11);
  });
});

describe("la salida del vacío (F7 · F11)", () => {
  it("sólo se pregunta por los filtros que están puestos", () => {
    expect(relaxableFilters({ minRooms: 2, attributes: ["hasPowerPlant"] }, ["chacao"])).toEqual([
      "zone",
      "rooms",
      "hasPowerPlant",
    ]);
    expect(relaxableFilters({}, [])).toEqual([]);
  });

  it("el precio cuenta como uno solo, aunque sean dos números", () => {
    expect(relaxableFilters({ minPriceUsd: 250, maxPriceUsd: 700 }, [])).toEqual(["price"]);
  });

  it("cada salida es una dirección con ese filtro quitado y ningún otro", () => {
    const place = {
      basePath: "/alquiler/distrito-capital/chacao",
      cityPath: "/alquiler/distrito-capital",
      query: { min: "250", max: "700", hab: "2", planta: "1", zona: "altamira" },
    };

    // La zona vuelve a la ciudad entera: la de la RUTA también es un filtro.
    expect(reliefHref(place, "zone")).toBe(
      "/alquiler/distrito-capital?min=250&max=700&hab=2&planta=1",
    );
    expect(reliefHref(place, "price")).not.toContain("min=");
    expect(reliefHref(place, "price")).toContain("hab=2");
    expect(reliefHref(place, "rooms")).not.toContain("hab=");
    expect(reliefHref(place, "hasPowerPlant")).not.toContain("planta=");
  });

  it("soltar «sólo de dueños» se queda en la misma ruta, porque no es un lugar", () => {
    // La zona es el único filtro que además cambia de ruta. Este no: quitarlo
    // desde la página de una zona tiene que dejar a quien busca donde estaba,
    // y no devolverlo a la ciudad entera por un filtro que no es un sitio.
    const place = {
      basePath: "/alquiler/distrito-capital/chacao",
      cityPath: "/alquiler/distrito-capital",
      query: { pub: "owner", hab: "2" },
    };

    expect(reliefHref(place, "publisherType")).toBe("/alquiler/distrito-capital/chacao?hab=2");
  });

  it("soltar un filtro deja el criterio sin él y con todo lo demás intacto", () => {
    const criteria = {
      cityId: "dc",
      zoneIds: ["chacao"],
      minPriceUsd: 250,
      maxPriceUsd: 700,
      minRooms: 2,
      publisherType: "owner",
      attributes: ["hasPowerPlant", "hasRegularWater"],
    } as const;

    expect(withoutFilter(criteria, "zone").zoneIds).toBeUndefined();
    expect(withoutFilter(criteria, "zone").minRooms).toBe(2);
    // El precio se suelta entero: soltar sólo un extremo es media salida.
    expect(withoutFilter(criteria, "price").minPriceUsd).toBeUndefined();
    expect(withoutFilter(criteria, "price").maxPriceUsd).toBeUndefined();
    expect(withoutFilter(criteria, "rooms").minRooms).toBeUndefined();
    expect(withoutFilter(criteria, "publisherType").publisherType).toBeUndefined();
    // Un atributo se cae solo, y los otros siguen: se combinan con Y.
    expect(withoutFilter(criteria, "hasPowerPlant").attributes).toEqual(["hasRegularWater"]);
  });

  it("la ciudad sobrevive a cualquier soltada: no es un filtro", () => {
    const criteria = { cityId: "dc", zoneIds: ["chacao"] } as const;

    expect(withoutFilter(criteria, "zone").cityId).toBe("dc");
  });

  it("con cero resultados el panel ofrece la salida elegida", () => {
    const result = panel({
      counts: { ...COUNTS, total: 0 },
      relief: {
        label: "Quitar el precio y ver 14",
        resultCount: 14,
        href: "/alquiler/distrito-capital",
      },
    });

    expect(result.confirm.kind).toBe("empty");
    expect(result.confirm.kind === "empty" && result.confirm.relief?.href).toBe(
      "/alquiler/distrito-capital",
    );
  });
});

describe("«Limpiar todo» conserva la ciudad (F8)", () => {
  it("vuelve a la ruta de la ciudad, sin ningún filtro", () => {
    const href = panel({
      basePath: "/alquiler/distrito-capital/chacao",
      query: { min: "250", hab: "2", zona: "altamira", pag: "2" },
    }).clearAllHref;

    expect(href).toBe("/alquiler/distrito-capital");
  });

  it("nunca se lleva la ciudad puesta", () => {
    expect(panel({ query: { min: "250" } }).clearAllHref).toContain("/alquiler/distrito-capital");
  });
});

/**
 * **El modelo lleva los dos conteos, y por eso ninguna pantalla tiene que
 * restar.** El engranaje de la barra resumen cuenta la zona; el filtro de la
 * pastilla no (14i/14.36). Una página que hiciera `activeFilters - 1` estaría
 * escribiendo esa regla en `app/`, donde el suelo de cobertura no llega.
 */
describe("los dos conteos de filtros del modelo", () => {
  it("con una zona elegida, el engranaje cuenta uno más que la pastilla", () => {
    const model = buildSearchPanel({ ...BASE, chosenZoneIds: ["chacao"] });

    expect(model.activeFilters).toBe(1);
    expect(model.pillFilters).toBe(0);
  });

  it("el caso de la lámina 7c: la pastilla dice 3 y el engranaje 4", () => {
    const model = buildSearchPanel({
      ...BASE,
      chosenZoneIds: ["chacao", "altamira"],
      criteria: { minPriceUsd: 250, maxPriceUsd: 700, minRooms: 2, publisherType: "owner" },
    });

    expect(model.pillFilters).toBe(3);
    expect(model.activeFilters).toBe(4);
  });

  it("sin nada elegido los dos son cero: la ciudad no es un filtro (F8)", () => {
    const model = buildSearchPanel(BASE);

    expect(model.activeFilters).toBe(0);
    expect(model.pillFilters).toBe(0);
  });
});

/**
 * **El panel dejó de ser una barra lateral y pasó a ser un estado de la página**
 * (14.33, lámina 7c: *"Sin barra lateral: los filtros viven solo en el modal"*).
 *
 * Lo que decide si está abierto es la dirección, y por eso está en el modelo:
 * escribirlo en las dos páginas serían dos copias de la misma condición, y la
 * segunda deja de coincidir en el próximo parámetro.
 */
describe("el panel como estado de la dirección (14.33)", () => {
  it("sin el parámetro está cerrado", () => {
    expect(panel().open).toBe(false);
    expect(panel().openNotice).toBeNull();
  });

  it("el token de la pastilla lo abre, y abre el primer grupo sin contestar", () => {
    const model = panel({ query: { filtros: "todos" } });

    expect(model.open).toBe(true);
    expect(model.steps.filter((step) => step.open).map((step) => step.id)).toEqual(["precio"]);
  });

  it("un grupo viejo lo abre igual y lo dice, en vez de romper la página", () => {
    const model = panel({ query: { filtros: "zona" } });

    expect(model.open).toBe(true);
    expect(model.openNotice).toContain("ya no existe");
  });

  it("cada grupo trae la dirección que lo abre, y la arma el dominio", () => {
    // El componente no compone direcciones: el punto de quiebre decide si se
    // ven los cuatro a la vez, y la dirección es la misma en los dos anchos.
    const model = panel({ query: { filtros: "todos", min: "250" } });

    expect(model.steps.map((step) => step.href)).toEqual([
      "/alquiler/distrito-capital?filtros=precio&min=250",
      "/alquiler/distrito-capital?filtros=habitaciones&min=250",
      "/alquiler/distrito-capital?filtros=publica&min=250",
      "/alquiler/distrito-capital?filtros=atributos&min=250",
    ]);
  });

  it("cerrarlo es la misma búsqueda sin el parámetro, y no toca ningún filtro", () => {
    expect(panel({ query: { filtros: "precio", min: "250", hab: "2" } }).closeHref).toBe(
      "/alquiler/distrito-capital?min=250&hab=2",
    );
  });
});

/**
 * **Las fichas quitables de la lámina 7c.** Con la barra lateral afuera, la
 * pantalla de resultados se quedaba sin decir qué filtros están puestos: la
 * `SearchSummaryBar` ya se había ido en la 14.41 y `panel.summary` no lo dibuja
 * nadie. La lámina las pone en la lista — «Chacao × Altamira × $250 – $700 × 2
 * habitaciones × Solo de dueños ×» — y se saca una sin abrir nada.
 *
 * Cada zona es su propia ficha, y ahí está la diferencia con `describeFilter`,
 * que nombra las zonas juntas: quitar «Chacao» tiene que dejar Altamira viva.
 */
describe("las fichas quitables de los filtros puestos (14.33, lámina 7c)", () => {
  const CHOSEN = {
    chosenZoneIds: ["chacao", "altamira"],
    query: { zona: "chacao,altamira", max: "700", hab: "2", pub: "owner" },
    criteria: { maxPriceUsd: 700, minRooms: 2, publisherType: "owner" },
  } as const;

  it("sin filtros puestos no hay ninguna ficha", () => {
    expect(panel().chips).toEqual([]);
  });

  it("una ficha por zona, y las demás en el orden en que se pueden soltar", () => {
    expect(panel(CHOSEN).chips.map((chip) => chip.label)).toEqual([
      "Chacao",
      "Altamira",
      "Hasta $700",
      "2 hab",
      "dueños",
    ]);
  });

  it("quitar una zona deja viva a la otra, y la devuelve a su ruta canónica", () => {
    const chacao = panel(CHOSEN).chips.find((chip) => chip.label === "Chacao");

    // Queda una sola zona, así que la dirección vuelve a ser la indexable.
    expect(chacao?.removeHref).toBe("/alquiler/distrito-capital/altamira?max=700&hab=2&pub=owner");
  });

  it("quitar un filtro que no es zona deja la ubicación intacta", () => {
    const rooms = panel(CHOSEN).chips.find((chip) => chip.label === "2 hab");

    expect(rooms?.removeHref).toBe(
      "/alquiler/distrito-capital?zona=chacao%2Caltamira&max=700&pub=owner",
    );
  });

  it("cada ficha dice qué quita, porque «×» solo no se lee en voz alta", () => {
    expect(panel(CHOSEN).chips.map((chip) => chip.removeLabel)).toContain("Quitar Chacao");
    expect(panel(CHOSEN).chips.map((chip) => chip.removeLabel)).toContain("Quitar 2 hab");
  });

  it("cada atributo es su propia ficha: se combinan con Y", () => {
    const labels = panel({
      criteria: { attributes: ["hasPowerPlant", "hasRegularWater"] },
    }).chips.map((chip) => chip.label);

    expect(labels).toEqual(["planta", "agua"]);
  });
});

describe("cada opción lleva el número que va a producir (14.34)", () => {
  it("el escalón de habitaciones adelanta su propia faceta", () => {
    // «Ver 16 avisos» → «Ver 9 avisos» sin esperar la respuesta: el 9 es el
    // conteo real de la faceta de 2 habitaciones, no una estimación.
    const rooms = panel().rooms;
    expect(rooms.map((room) => room.previewLabel)).toEqual([
      "Ver 16 avisos",
      "Ver 9 avisos",
      "Ver 4 avisos",
      null,
    ]);
  });

  it("el escalón elegido adelanta lo que queda al soltarlo, no lo que ya hay", () => {
    // Volver a tocarlo lo suelta, así que su número es el de la relajación (31)
    // y NO el 9 de su propia faceta. Adelantar el 9 acá sería el botón diciendo
    // que quitar un filtro no cambia nada.
    const [uno, dos] = panel({ criteria: { minRooms: 2 } }).rooms;
    expect(dos?.previewLabel).toBe("Ver 31 avisos");
    expect(uno?.previewLabel).toBe("Ver 16 avisos");
  });

  it("los atributos, en los dos sentidos", () => {
    const sinMarcar = panel().attributes.find((option) => option.attribute === "isFurnished");
    expect(sinMarcar?.previewLabel).toBe("Ver 4 avisos");

    const marcado = panel({ criteria: { attributes: ["isFurnished"] } }).attributes.find(
      (option) => option.attribute === "isFurnished",
    );
    expect(marcado?.previewLabel).toBe("Ver 20 avisos");
  });

  it("quién publica, en los dos sentidos", () => {
    expect(panel().publisher.previewLabel).toBe("Ver 11 avisos");
    expect(panel({ criteria: { publisherType: "owner" } }).publisher.previewLabel).toBe(
      "Ver 25 avisos",
    );
  });

  it("«Limpiar todo» adelanta el total de la ciudad", () => {
    expect(panel().clearAllPreviewLabel).toBe("Ver 70 avisos");
  });

  it("una opción apagada no adelanta nada: no se puede tocar", () => {
    // `hasSecurity` cuenta 0 y llega deshabilitada, así que se dibuja como un
    // `<span>` sin dirección. Un número adelantado para algo que nadie puede
    // tocar es marcado que promete una interacción que no existe.
    const apagada = panel().attributes.find((option) => option.attribute === "hasSecurity");
    expect(apagada?.disabled).toBe(true);
    expect(apagada?.previewLabel).toBeNull();
  });

  it("sin los conteos de relajación no inventa un número", () => {
    // Falla cerrado: sin `withoutFilter` el botón se queda con lo que el
    // servidor escribió hasta que llegue la respuesta.
    const { withoutFilter: _sin, ...resto } = COUNTS;
    const sinRelajaciones = panel({
      counts: resto as unknown as SearchPanelInput["counts"],
      criteria: { minRooms: 2 },
    });
    expect(sinRelajaciones.rooms[1]?.previewLabel).toBeNull();
  });
});
