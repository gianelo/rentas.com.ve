import { describe, expect, it } from "vitest";
import {
  buildSearchPanel,
  relaxableFilters,
  reliefHref,
  type SearchPanelInput,
  withoutFilter,
} from "./search-panel";

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
    { id: "chacao", name: "Chacao", path: "/alquiler/distrito-capital/chacao" },
    { id: "altamira", name: "Altamira", path: "/alquiler/distrito-capital/altamira" },
    { id: "castellana", name: "La Castellana", path: "/alquiler/distrito-capital/la-castellana" },
    { id: "rosal", name: "El Rosal", path: "/alquiler/distrito-capital/el-rosal" },
  ],
  chosenZoneIds: [],
  counts: COUNTS,
  criteria: {},
};

function panel(overrides: Partial<SearchPanelInput> = {}) {
  return buildSearchPanel({ ...BASE, ...overrides });
}

describe("el panel entero", () => {
  it("dibuja los cuatro pasos", () => {
    expect(panel().steps.map((step) => step.id)).toEqual([
      "ciudad",
      "zona",
      "precio",
      "habitaciones",
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

  it("elegir ciudad abre el paso siguiente", () => {
    const other = panel().cities.find((city) => city.id === "mcbo");

    expect(other?.href).toContain("filtros=zona");
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

  it("el buscador se lleva el resto del estado, para no perderlo al enviar", () => {
    const form = panel({ query: { min: "250", hab: "2" } }).zoneSearch;

    expect(form.action).toBe("/alquiler/distrito-capital");
    expect(form.hidden).toContainEqual({ name: "min", value: "250" });
    expect(form.hidden).toContainEqual({ name: "hab", value: "2" });
    // El campo que el propio formulario manda no puede ir además escondido.
    expect(form.hidden.map((field) => field.name)).not.toContain("busca");
  });

  it("el buscador deja el acordeón en el paso de la zona", () => {
    expect(panel().zoneSearch.hidden).toContainEqual({ name: "filtros", value: "zona" });
  });

  it("con un texto que no nombra ninguna zona, lo dice en vez de mostrarlas todas", () => {
    const result = panel({ query: { busca: "maracaibo" } });

    expect(result.zones).toEqual([]);
    expect(result.zoneSearch.noMatches).toBe(true);
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

  it("al enviarlo el acordeón pasa a las habitaciones", () => {
    expect(panel().price.hidden).toContainEqual({ name: "filtros", value: "habitaciones" });
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
