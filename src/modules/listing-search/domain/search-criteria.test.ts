import { describe, expect, it } from "vitest";
import { buildSearchCriteria, type CuratedZone } from "./search-criteria";

const MARACAIBO = "city-maracaibo";
const DISTRITO = "city-distrito";

/**
 * Both cities have a zone called "Centro" — so both carry the same `slug`, and
 * only the ids differ. That is the whole point: a slug alone does not tell the
 * two apart, and the city always does.
 */
const ZONES: readonly CuratedZone[] = [
  { id: "zone-mcbo-centro", cityId: MARACAIBO, slug: "centro" },
  { id: "zone-mcbo-norte", cityId: MARACAIBO, slug: "norte" },
  { id: "zone-dc-centro", cityId: DISTRITO, slug: "centro" },
];

describe("buildSearchCriteria — city scope (task 5.1, design.md D5)", () => {
  it("refuses to produce criteria without a city", () => {
    expect(buildSearchCriteria({ city: undefined }, ZONES)).toBeNull();
    expect(buildSearchCriteria({ city: null }, ZONES)).toBeNull();
    expect(buildSearchCriteria({ city: "" }, ZONES)).toBeNull();
    expect(buildSearchCriteria({ city: "   " }, ZONES)).toBeNull();
  });

  it("carries the submitted city through as the required scope", () => {
    expect(buildSearchCriteria({ city: MARACAIBO }, ZONES)).toEqual({ cityId: MARACAIBO });
  });

  it("keeps the city scope even when every other parameter is garbage", () => {
    // El aislamiento de ciudad no depende de que el resto de la URL esté sana.
    // Todo lo demás se descarta campo por campo y la ciudad sigue en pie.
    expect(
      buildSearchCriteria(
        {
          city: MARACAIBO,
          zone: "inventada,otra-inventada",
          minPrice: "abc",
          propertyType: "castillo",
          publisherType: "nadie",
          hasPowerPlant: "quizá",
          page: "-1",
        },
        ZONES,
      ),
    ).toEqual({ cityId: MARACAIBO });
  });
});

describe("buildSearchCriteria — stale zone (task 5.0)", () => {
  it("keeps a zone that belongs to the submitted city", () => {
    const criteria = buildSearchCriteria({ city: MARACAIBO, zone: "zone-mcbo-centro" }, ZONES);

    expect(criteria).toEqual({ cityId: MARACAIBO, zoneIds: ["zone-mcbo-centro"] });
  });

  it("ignores the previous city's zone rather than searching for it", () => {
    // The exact pair the GET form sends when someone switches city without
    // touching the zone select (components/molecules/CityZoneSelect.tsx).
    // Dropping the zone means "all of Maracaibo", which is what the visitor
    // just asked for; keeping it would mean an empty result page for a city
    // that has listings, and the visitor has no way to tell why.
    const criteria = buildSearchCriteria({ city: MARACAIBO, zone: "zone-dc-centro" }, ZONES);

    expect(criteria).toEqual({ cityId: MARACAIBO });
  });

  it("ignores a zone id that is not in the curated taxonomy at all", () => {
    // A hand-edited URL. Same rule, same reason.
    expect(buildSearchCriteria({ city: MARACAIBO, zone: "made-up" }, ZONES)).toEqual({
      cityId: MARACAIBO,
    });
  });

  it("checks membership against the submitted city, not against the caller's list", () => {
    // Handed EVERY curated zone including the other city's, the builder must
    // still refuse the mismatched one. A pre-filtered list would make this
    // guarantee the caller's to keep, and D5 puts it in the narrowest API.
    expect(buildSearchCriteria({ city: DISTRITO, zone: "zone-mcbo-norte" }, ZONES)).toEqual({
      cityId: DISTRITO,
    });
  });
});

describe("buildSearchCriteria — varias zonas a la vez (task 14.6, F4)", () => {
  it("lee la lista separada por comas que trae la URL", () => {
    const criteria = buildSearchCriteria(
      { city: MARACAIBO, zone: "zone-mcbo-centro,zone-mcbo-norte" },
      ZONES,
    );

    expect(criteria).toEqual({
      cityId: MARACAIBO,
      zoneIds: ["zone-mcbo-centro", "zone-mcbo-norte"],
    });
  });

  it("tolera espacios y comas de más alrededor de los ids", () => {
    // Una lista escrita a mano, o recortada al copiarla de un chat.
    expect(
      buildSearchCriteria(
        { city: MARACAIBO, zone: " zone-mcbo-centro , ,zone-mcbo-norte," },
        ZONES,
      ),
    ).toEqual({ cityId: MARACAIBO, zoneIds: ["zone-mcbo-centro", "zone-mcbo-norte"] });
  });

  it("no repite una zona que la URL trae dos veces", () => {
    // `IN (a, a)` da el mismo resultado, pero el criterio es lo que la
    // pantalla vuelve a dibujar: dos veces la misma zona marcada es un
    // filtro que se ve roto aunque cuente bien.
    expect(
      buildSearchCriteria({ city: MARACAIBO, zone: "zone-mcbo-centro,zone-mcbo-centro" }, ZONES),
    ).toEqual({ cityId: MARACAIBO, zoneIds: ["zone-mcbo-centro"] });
  });

  it("descarta la zona que ya no existe y deja viva el resto de la búsqueda", () => {
    // **La regla que carga el peso.** El enlace pegado en un WhatsApp de hace
    // un mes lleva una zona que la taxonomía ya no tiene. Perder la búsqueda
    // entera por eso es una página vacía sin explicación; perder esa zona es
    // una búsqueda más ancha que la pedida, y eso sí se ve.
    expect(
      buildSearchCriteria({ city: MARACAIBO, zone: "zone-mcbo-centro,zona-borrada" }, ZONES),
    ).toEqual({ cityId: MARACAIBO, zoneIds: ["zone-mcbo-centro"] });
  });

  it("descarta también la zona de otra ciudad sin llevarse las buenas", () => {
    expect(
      buildSearchCriteria({ city: MARACAIBO, zone: "zone-dc-centro,zone-mcbo-norte" }, ZONES),
    ).toEqual({ cityId: MARACAIBO, zoneIds: ["zone-mcbo-norte"] });
  });
});

describe("buildSearchCriteria — `?zona=` escrita con slugs (F12)", () => {
  it("lee el slug, que es la forma que el panel emite", () => {
    expect(buildSearchCriteria({ city: MARACAIBO, zone: "centro,norte" }, ZONES)).toEqual({
      cityId: MARACAIBO,
      zoneIds: ["zone-mcbo-centro", "zone-mcbo-norte"],
    });
  });

  it("el mismo slug resuelve a otra zona en otra ciudad, y ésa es la trampa", () => {
    // «Centro» existe en las dos. El slug solo no las distingue; la ciudad,
    // que siempre está en la ruta, sí.
    expect(buildSearchCriteria({ city: DISTRITO, zone: "centro" }, ZONES)).toEqual({
      cityId: DISTRITO,
      zoneIds: ["zone-dc-centro"],
    });
  });

  it("no cruza la homónima de la otra ciudad ni cuando la suya no existe", () => {
    // Distrito Capital no tiene «Norte». La respuesta honesta es la ciudad
    // entera, nunca el «Norte» de Maracaibo.
    expect(buildSearchCriteria({ city: DISTRITO, zone: "norte" }, ZONES)).toEqual({
      cityId: DISTRITO,
    });
  });

  it("sigue leyendo el id, porque hay direcciones compartidas que lo llevan", () => {
    // La dirección es el estado de la búsqueda: romper los enlaces que ya
    // circulan por WhatsApp devolvería la ciudad entera sin decir por qué.
    expect(buildSearchCriteria({ city: MARACAIBO, zone: "zone-mcbo-centro" }, ZONES)).toEqual({
      cityId: MARACAIBO,
      zoneIds: ["zone-mcbo-centro"],
    });
  });

  it("mezcla las dos formas sin marcar dos veces la misma zona", () => {
    expect(
      buildSearchCriteria({ city: MARACAIBO, zone: "zone-mcbo-centro,centro" }, ZONES),
    ).toEqual({ cityId: MARACAIBO, zoneIds: ["zone-mcbo-centro"] });
  });

  it("cae en toda la ciudad cuando no sobrevive ni una zona", () => {
    // Ninguna zona válida no es "ninguna zona": es el criterio sin zona, que
    // busca en toda la ciudad. Una lista vacía en el criterio sería un
    // `IN ()` — SQL inválido en el mejor caso y cero resultados en el peor.
    expect(buildSearchCriteria({ city: MARACAIBO, zone: "a,b,c" }, ZONES)).toEqual({
      cityId: MARACAIBO,
    });
  });
});

describe("buildSearchCriteria — price and characteristics", () => {
  it("reads the numeric filters a query string carries as text", () => {
    const criteria = buildSearchCriteria(
      {
        city: MARACAIBO,
        minPrice: "200",
        maxPrice: "500",
        minRooms: "2",
        minBathrooms: "3",
        minAreaM2: "60",
      },
      ZONES,
    );

    expect(criteria).toEqual({
      cityId: MARACAIBO,
      minPriceUsd: 200,
      maxPriceUsd: 500,
      minRooms: 2,
      // **Un mínimo, igual que las habitaciones** (14.45): `3` en la dirección
      // es "tres baños o más", que es lo que el botón «3+» promete.
      minBathrooms: 3,
      minAreaM2: 60,
    });
  });

  it("drops values that are not whole non-negative numbers", () => {
    const criteria = buildSearchCriteria(
      {
        city: MARACAIBO,
        minPrice: "abc",
        maxPrice: "-1",
        minRooms: "1.5",
        minBathrooms: "dos",
        minAreaM2: "",
      },
      ZONES,
    );

    expect(criteria).toEqual({ cityId: MARACAIBO });
  });

  /**
   * **Este test afirmaba lo contrario, y lo contrario era la decisión vieja.**
   *
   * Decía «keeps an inverted price range instead of silently widening it», con
   * el argumento de que "nada cuesta entre 900 y 200" es una respuesta
   * verdadera. El documento maestro decide al revés y es explícito — F5: «si
   * el mínimo supera al máximo, **se intercambian en vez de dar error**» — y
   * donde el maestro difiere, manda el maestro.
   *
   * El argumento nuevo es el que el maestro sostiene: una respuesta verdadera
   * que nadie puede usar sigue siendo una pantalla vacía, y la regla
   * transversal 5 dice que ninguna pantalla termina sin salida. El caso está
   * cubierto entero en «buildSearchCriteria — precio al revés (F5)».
   */
  it("intercambia un rango invertido en vez de devolver vacío (F5)", () => {
    expect(
      buildSearchCriteria({ city: MARACAIBO, minPrice: "900", maxPrice: "200" }, ZONES),
    ).toEqual({ cityId: MARACAIBO, minPriceUsd: 200, maxPriceUsd: 900 });
  });
});

describe("buildSearchCriteria — tipo de publicador (task 14.7, F6)", () => {
  it("acepta los dos valores que la columna admite", () => {
    expect(buildSearchCriteria({ city: MARACAIBO, publisherType: "owner" }, ZONES)).toEqual({
      cityId: MARACAIBO,
      publisherType: "owner",
    });
    expect(buildSearchCriteria({ city: MARACAIBO, publisherType: "broker" }, ZONES)).toEqual({
      cityId: MARACAIBO,
      publisherType: "broker",
    });
  });

  it("descarta cualquier otra cosa en vez de mandarla al WHERE", () => {
    // `publisher_type` es texto libre en el esquema: un valor inventado no
    // rompe la consulta, devuelve cero filas y parece que no hay avisos.
    for (const value of ["dueno", "OWNER", "", "   ", "owner'", "propietario"]) {
      expect(buildSearchCriteria({ city: MARACAIBO, publisherType: value }, ZONES)).toEqual({
        cityId: MARACAIBO,
      });
    }
  });
});

/**
 * F5: «Si el mínimo supera al máximo, se intercambian en vez de dar error.»
 *
 * Vive acá y no en la pantalla del filtro a propósito: es la MISMA regla para
 * el formulario del acordeón, para la barra lateral de escritorio y para una
 * dirección pegada de un chat con los dos números al revés. Escrita en el
 * componente, la tercera de esas tres entradas se la saltaría.
 */
describe("buildSearchCriteria — precio al revés (F5)", () => {
  it("intercambia los extremos en vez de dar error", () => {
    const criteria = buildSearchCriteria(
      { city: MARACAIBO, minPrice: "900", maxPrice: "300" },
      ZONES,
    );

    expect(criteria?.minPriceUsd).toBe(300);
    expect(criteria?.maxPriceUsd).toBe(900);
  });

  it("nunca devuelve `null` por unos números al revés", () => {
    // Un rango imposible es un error de tipeo, no una búsqueda inválida:
    // `min > max` en SQL da cero resultados y una pantalla vacía sin causa.
    expect(
      buildSearchCriteria({ city: MARACAIBO, minPrice: "900", maxPrice: "300" }, ZONES),
    ).not.toBeNull();
  });

  it("los deja como están cuando ya están en orden", () => {
    const criteria = buildSearchCriteria(
      { city: MARACAIBO, minPrice: "300", maxPrice: "900" },
      ZONES,
    );

    expect(criteria?.minPriceUsd).toBe(300);
    expect(criteria?.maxPriceUsd).toBe(900);
  });

  it("iguales no se tocan: es un precio exacto, no un error", () => {
    const criteria = buildSearchCriteria(
      { city: MARACAIBO, minPrice: "400", maxPrice: "400" },
      ZONES,
    );

    expect(criteria?.minPriceUsd).toBe(400);
    expect(criteria?.maxPriceUsd).toBe(400);
  });

  it("con un solo extremo no hay nada que intercambiar", () => {
    const soloMin = buildSearchCriteria({ city: MARACAIBO, minPrice: "900" }, ZONES);
    const soloMax = buildSearchCriteria({ city: MARACAIBO, maxPrice: "300" }, ZONES);

    expect(soloMin?.minPriceUsd).toBe(900);
    expect(soloMin?.maxPriceUsd).toBeUndefined();
    expect(soloMax?.maxPriceUsd).toBe(300);
    expect(soloMax?.minPriceUsd).toBeUndefined();
  });
});

describe("buildSearchCriteria — tipo de propiedad (task 14.8)", () => {
  it("acepta los cinco tipos del esquema", () => {
    for (const type of ["apartamento", "casa", "quinta", "anexo", "habitacion"] as const) {
      expect(buildSearchCriteria({ city: MARACAIBO, propertyType: type }, ZONES)).toEqual({
        cityId: MARACAIBO,
        propertyType: type,
      });
    }
  });

  it("descarta un tipo que el esquema no tiene", () => {
    for (const value of ["castillo", "Apartamento", "apto", "", "constructor", "__proto__"]) {
      expect(buildSearchCriteria({ city: MARACAIBO, propertyType: value }, ZONES)).toEqual({
        cityId: MARACAIBO,
      });
    }
  });
});

describe("buildSearchCriteria — atributos declarados (task 14.9, F6)", () => {
  it("acepta los cinco atributos y los combina con Y", () => {
    const criteria = buildSearchCriteria(
      {
        city: MARACAIBO,
        hasPowerPlant: "1",
        hasRegularWater: "1",
        isFurnished: "1",
        hasSecurity: "1",
        hasAppliances: "1",
      },
      ZONES,
    );

    expect(criteria).toEqual({
      cityId: MARACAIBO,
      attributes: [
        "hasPowerPlant",
        "hasRegularWater",
        "isFurnished",
        "hasSecurity",
        "hasAppliances",
      ],
    });
  });

  it("lee un atributo suelto sin arrastrar los otros cuatro", () => {
    expect(buildSearchCriteria({ city: MARACAIBO, isFurnished: "1" }, ZONES)).toEqual({
      cityId: MARACAIBO,
      attributes: ["isFurnished"],
    });
  });

  it("acepta también el «on» que manda una casilla sin valor propio", () => {
    expect(buildSearchCriteria({ city: MARACAIBO, hasSecurity: "on" }, ZONES)).toEqual({
      cityId: MARACAIBO,
      attributes: ["hasSecurity"],
    });
  });

  it("**no puede pedir el falso**, y ésa es la regla entera", () => {
    // `false` en estas columnas significa "no lo declaró", nunca "no lo
    // tiene". Un filtro por `false` afirmaría algo que el sistema no sabe:
    // devolvería avisos que sí tienen planta y no la anotaron.
    for (const value of ["0", "false", "off", "no", "", "   "]) {
      expect(buildSearchCriteria({ city: MARACAIBO, hasPowerPlant: value }, ZONES)).toEqual({
        cityId: MARACAIBO,
      });
    }
  });

  it("no deja una lista vacía en el criterio cuando ninguna casilla viene marcada", () => {
    // Igual que con las zonas: `attributes: []` sería un filtro presente que
    // no filtra, y una pantalla que dibuja "0 atributos elegidos" en vez de
    // ninguno.
    expect(buildSearchCriteria({ city: MARACAIBO, hasPowerPlant: "0" }, ZONES)).toEqual({
      cityId: MARACAIBO,
    });
  });
});

describe("buildSearchCriteria — página (task 14.10, F10)", () => {
  it("guarda la página pedida", () => {
    expect(buildSearchCriteria({ city: MARACAIBO, page: "3" }, ZONES)).toEqual({
      cityId: MARACAIBO,
      page: 3,
    });
  });

  it("no guarda la primera, porque la ausencia ya la significa", () => {
    expect(buildSearchCriteria({ city: MARACAIBO, page: "1" }, ZONES)).toEqual({
      cityId: MARACAIBO,
    });
  });

  it("resuelve un número de página imposible como la primera, sin romper", () => {
    for (const value of ["0", "-4", "2.5", "pag", "", "1e3"]) {
      expect(buildSearchCriteria({ city: MARACAIBO, page: value }, ZONES)).toEqual({
        cityId: MARACAIBO,
      });
    }
  });

  it("acepta una página más allá del final: quien sabe el total es la consulta", () => {
    // Este traductor no conoce cuántos avisos hay, y pedirle que lo adivine
    // sería inventarlo. La página 400 es un criterio válido que devuelve
    // vacío, y `resolvePagination` es quien lo dice en pantalla.
    expect(buildSearchCriteria({ city: MARACAIBO, page: "400" }, ZONES)).toEqual({
      cityId: MARACAIBO,
      page: 400,
    });
  });
});

describe("buildSearchCriteria — todo junto", () => {
  it("arma el criterio completo de una URL con cada filtro puesto", () => {
    const criteria = buildSearchCriteria(
      {
        city: MARACAIBO,
        zone: "zone-mcbo-centro,zone-mcbo-norte",
        minPrice: "200",
        maxPrice: "800",
        minRooms: "2",
        minAreaM2: "50",
        propertyType: "casa",
        publisherType: "owner",
        hasPowerPlant: "1",
        hasRegularWater: "1",
        page: "2",
      },
      ZONES,
    );

    expect(criteria).toEqual({
      cityId: MARACAIBO,
      zoneIds: ["zone-mcbo-centro", "zone-mcbo-norte"],
      minPriceUsd: 200,
      maxPriceUsd: 800,
      minRooms: 2,
      minAreaM2: 50,
      propertyType: "casa",
      publisherType: "owner",
      attributes: ["hasPowerPlant", "hasRegularWater"],
      page: 2,
    });
  });
});

describe("el orden de la lista (14.47)", () => {
  it("el de por defecto se OMITE, así que el criterio de siempre no cambia", () => {
    // Ausente = «Recientes», igual que `page` ausente es la primera. Que no
    // aparezca es lo que deja intacto el criterio de todas las búsquedas que
    // ya existían.
    expect(buildSearchCriteria({ city: MARACAIBO }, ZONES)).toEqual({ cityId: MARACAIBO });
    expect(buildSearchCriteria({ city: MARACAIBO, order: "recientes" }, ZONES)).toEqual({
      cityId: MARACAIBO,
    });
  });

  it("los dos órdenes de precio sí llegan al criterio", () => {
    expect(buildSearchCriteria({ city: MARACAIBO, order: "precio-asc" }, ZONES)).toEqual({
      cityId: MARACAIBO,
      order: "priceAsc",
    });
    expect(buildSearchCriteria({ city: MARACAIBO, order: "precio-desc" }, ZONES)).toEqual({
      cityId: MARACAIBO,
      order: "priceDesc",
    });
  });
});
