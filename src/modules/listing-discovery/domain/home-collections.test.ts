import { describe, expect, it } from "vitest";
import {
  buildHome,
  HOME_BUDGET_CEILING_USD,
  HOME_SEARCH_LABEL,
  HOME_STRIP_SIZE,
  type HomeCollectionPage,
  homeCityChips,
  homeCollections,
  homeSearchBar,
  resolveHomeCity,
} from "./home-collections";
import type { GridCover, GridListing } from "./listing-grid";
import { slugify } from "./listing-url";
import { resolveCityRoute } from "./zone-route";

const CITIES = [
  { id: "dc", name: "Distrito Capital" },
  { id: "mcbo", name: "Maracaibo" },
] as const;

const BASE_URL = "https://fotos.rentas.com.ve";

/** Una portada completa: las dos derivadas que la F9 exige. */
function cover(): GridCover {
  return { keys: { thumb: "t.webp", card: "c.webp" } };
}

function listing(id: string, overrides: Partial<GridListing> = {}): GridListing {
  return {
    id,
    title: `Apartamento ${id}`,
    priceUsd: 350,
    rooms: 2,
    areaM2: 65,
    publisherType: "owner",
    cityName: "Distrito Capital",
    zoneName: "Chacao",
    ...overrides,
  };
}

/**
 * `zoneCount` por defecto en 1: la mayoría de estos casos no habla del
 * subtítulo, y dejarlo en 0 apagaría esa línea en todos ellos sin que el caso
 * lo estuviera pidiendo.
 */
function page(ids: readonly string[], total: number, zoneCount = 1): HomeCollectionPage {
  return { rows: ids.map((id) => listing(id)), total, zoneCount };
}

function coversFor(...ids: readonly string[]): ReadonlyMap<string, GridCover> {
  return new Map(ids.map((id) => [id, cover()]));
}

/**
 * Las cuatro claves que `homeCollections` emite para el catálogo de arriba. Se
 * leen de la función y no se escriben a mano: una clave copiada acá haría que
 * los tests siguieran verdes con el índice del inicio roto.
 */
function keyAt(index: number): string {
  const key = homeCollections(CITIES)[index]?.key;
  if (key === undefined) throw new Error(`no hay colección en la posición ${index}`);
  return key;
}

const RECENT = keyAt(0);
const DC = keyAt(1);
const MCBO = keyAt(2);
const BUDGET = keyAt(3);

describe("homeCollections — qué colecciones existen", () => {
  /**
   * **Cuatro tiras y su orden, que es el de la F1**: recientes primero porque
   * es lo que cambia entre dos visitas, después una por ciudad, y el
   * presupuesto al final porque es un filtro y no un lugar.
   */
  it("emite recientes, una por ciudad y el presupuesto, en ese orden", () => {
    const specs = homeCollections(CITIES);

    expect(specs.map((spec) => spec.kind)).toEqual(["recent", "city", "city", "budget"]);
  });

  it("crece con el catálogo en vez de traer las ciudades escritas", () => {
    // El día que abra una tercera ciudad hay una tira más sin tocar este
    // archivo. Una lista fija de ciudades sería la ciudad nueva invisible.
    const specs = homeCollections([...CITIES, { id: "vln", name: "Valencia" }]);

    expect(specs).toHaveLength(5);
    expect(specs.filter((spec) => spec.kind === "city").map((spec) => spec.title)).toEqual([
      "Distrito Capital",
      "Maracaibo",
      "Valencia",
    ]);
  });

  it("sin ciudades quedan sólo las dos colecciones que no nombran un lugar", () => {
    expect(homeCollections([]).map((spec) => spec.kind)).toEqual(["recent", "budget"]);
  });

  it("cada tira pide exactamente el tamaño de tira, y ninguna otra cosa", () => {
    for (const spec of homeCollections(CITIES)) {
      expect(spec.limit).toBe(HOME_STRIP_SIZE);
    }
  });

  it("la tira de ciudad filtra por ciudad y no por precio", () => {
    const specs = homeCollections(CITIES);
    const dc = specs.find((spec) => spec.key === DC);

    expect(dc).toMatchObject({ cityId: "dc", maxPriceUsd: null });
  });

  it("la tira de presupuesto filtra por precio y cruza las dos ciudades", () => {
    const budget = homeCollections(CITIES).find((spec) => spec.key === BUDGET);

    expect(budget).toMatchObject({ cityId: null, maxPriceUsd: HOME_BUDGET_CEILING_USD });
  });

  it("las claves son únicas, que es lo que las hace utilizables como índice", () => {
    const keys = homeCollections(CITIES).map((spec) => spec.key);

    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("homeCollections — a dónde apunta cada tira", () => {
  /**
   * **La ciudad tiene dirección propia y las otras dos no**, y eso no es un
   * olvido: el esquema que el fundador fijó en la 14.24 escribe
   * `/alquiler/<ciudad>` y no define ninguna dirección para "recientes" ni
   * para "hasta $400". Prometer una placa hacia una dirección que el producto
   * no sirve es exactamente el enlace roto que la ficha ya se niega a dibujar
   * en su miga de pan.
   */
  it("la tira de una ciudad apunta a la ruta de esa ciudad, con el nombre en slug", () => {
    const dc = homeCollections(CITIES).find((spec) => spec.key === DC);

    expect(dc?.href).toBe("/alquiler/distrito-capital");
  });

  it("recientes y presupuesto no apuntan a ninguna parte todavía", () => {
    const specs = homeCollections(CITIES);

    expect(specs.find((spec) => spec.key === RECENT)?.href).toBeNull();
    expect(specs.find((spec) => spec.key === BUDGET)?.href).toBeNull();
  });
});

describe("buildHome — la tira vacía desaparece", () => {
  /**
   * **No queda un hueco.** Una tira con un encabezado y nada debajo se lee
   * como una página rota, no como una colección vacía, y en el inicio eso es
   * lo primero que alguien ve del producto.
   */
  it("no renderiza una colección sin ningún aviso", () => {
    const home = buildHome(
      homeCollections(CITIES),
      new Map([
        [RECENT, page(["a"], 1)],
        [DC, page([], 0)],
        [MCBO, page([], 0)],
        [BUDGET, page([], 0)],
      ]),
      coversFor("a"),
      BASE_URL,
    );

    expect(home.strips.map((strip) => strip.key)).toEqual([RECENT]);
  });

  /**
   * Una colección cuyas filas existen pero cuyas portadas no es el mismo caso
   * en pantalla: la F9 las descarta y no queda nada que dibujar. Si la tira se
   * quedara, el encabezado anunciaría avisos que nadie puede ver.
   */
  it("tampoco renderiza una colección cuyos avisos perdió la regla de portada", () => {
    const home = buildHome(
      homeCollections(CITIES),
      new Map([[RECENT, page(["sin-foto"], 1)]]),
      new Map(),
      BASE_URL,
    );

    expect(home.strips).toHaveLength(0);
  });

  it("una colección que el puerto no devolvió se trata como vacía, no como un error", () => {
    // El puerto devuelve un `Map`: una clave ausente es "no hay", igual que en
    // `coversFor`. Reventar acá convertiría un inicio a medio poblar en un 500.
    const home = buildHome(homeCollections(CITIES), new Map(), new Map(), BASE_URL);

    expect(home.strips).toHaveLength(0);
  });
});

describe("buildHome — la placa y su número", () => {
  /**
   * **El total es el de la colección, no el de lo que hay en pantalla.** Es la
   * regla transversal del producto: "Ver los 23" tiene que decir 23. Componer
   * ese texto con `cards.length` daría "Ver los 5" siempre, que es un número
   * que no significa nada y que además ya está a la vista.
   */
  it("dice el total real de la colección y no los cinco que muestra", () => {
    const home = buildHome(
      homeCollections(CITIES),
      new Map([[DC, page(["a", "b", "c", "d", "e"], 23)]]),
      coversFor("a", "b", "c", "d", "e"),
      BASE_URL,
    );

    expect(home.strips[0]?.seeAll?.label).toBe("Ver los 23");
    expect(home.strips[0]?.cards).toHaveLength(5);
  });

  /**
   * **Menos de cinco no lleva placa**, y la razón es que no hay nada más que
   * ver: "Ver todos" sobre una colección enteramente visible manda a alguien a
   * cargar otra página para encontrarse lo mismo.
   */
  it("no pone placa cuando la colección entera ya está en pantalla", () => {
    const home = buildHome(
      homeCollections(CITIES),
      new Map([[DC, page(["a", "b", "c"], 3)]]),
      coversFor("a", "b", "c"),
      BASE_URL,
    );

    expect(home.strips[0]?.cards).toHaveLength(3);
    expect(home.strips[0]?.seeAll).toBeNull();
  });

  it("tampoco la pone cuando el total coincide exactamente con lo mostrado", () => {
    // El borde, que es donde un `>=` se disfraza de `>`: cinco de cinco es la
    // colección completa, y su placa mandaría a ver los mismos cinco.
    const home = buildHome(
      homeCollections(CITIES),
      new Map([[DC, page(["a", "b", "c", "d", "e"], 5)]]),
      coversFor("a", "b", "c", "d", "e"),
      BASE_URL,
    );

    expect(home.strips[0]?.seeAll).toBeNull();
  });

  it("la placa lleva la dirección de la colección, la misma del encabezado", () => {
    const home = buildHome(
      homeCollections(CITIES),
      new Map([[MCBO, page(["a"], 9)]]),
      coversFor("a"),
      BASE_URL,
    );

    expect(home.strips[0]?.seeAll?.href).toBe("/alquiler/maracaibo");
  });

  /**
   * **Sin dirección no hay placa, aunque sobren avisos.** Una placa que no
   * lleva a ninguna parte, o que lleva a un 404, es peor que ninguna: promete
   * el resto de la colección y no lo entrega.
   */
  it("no pone placa en una colección que el producto todavía no sabe servir entera", () => {
    const home = buildHome(
      homeCollections(CITIES),
      new Map([[RECENT, page(["a", "b", "c", "d", "e"], 40)]]),
      coversFor("a", "b", "c", "d", "e"),
      BASE_URL,
    );

    expect(home.strips[0]?.key).toBe(RECENT);
    expect(home.strips[0]?.seeAll).toBeNull();
  });
});

describe("buildHome — la misma propiedad en dos tiras", () => {
  /**
   * **Es correcto, no un duplicado a deduplicar (14.23).** Un aviso barato
   * recién publicado es reciente Y es de su ciudad Y entra en el presupuesto:
   * las tres tiras responden preguntas distintas, y sacarlo de dos de ellas
   * dejaría esas dos contestando mal para que la tercera no se repita.
   */
  it("deja el mismo aviso en las tres tiras que lo contienen", () => {
    const home = buildHome(
      homeCollections(CITIES),
      new Map([
        [RECENT, page(["mismo"], 1)],
        [DC, page(["mismo"], 1)],
        [BUDGET, page(["mismo"], 1)],
      ]),
      coversFor("mismo"),
      BASE_URL,
    );

    expect(home.strips.map((strip) => strip.key)).toEqual([RECENT, DC, BUDGET]);
    for (const strip of home.strips) {
      expect(strip.cards.map((card) => card.id)).toEqual(["mismo"]);
    }
  });
});

describe("buildHome — el inicio sin nada que mostrar", () => {
  it("invita a publicar cuando no hay ningún aviso activo", () => {
    const home = buildHome(homeCollections(CITIES), new Map(), new Map(), BASE_URL);

    expect(home.strips).toHaveLength(0);
    expect(home.invitesToPublish).toBe(true);
  });

  it("no invita a publicar en cuanto una sola tira tiene algo", () => {
    const home = buildHome(
      homeCollections(CITIES),
      new Map([[BUDGET, page(["a"], 1)]]),
      coversFor("a"),
      BASE_URL,
    );

    expect(home.invitesToPublish).toBe(false);
  });
});

describe("buildHome — lo que la tira no decide", () => {
  it("conserva el orden que trajo la colección", () => {
    // El adaptador ya ordena por fecha de publicación descendente. Reordenar
    // acá sería una segunda regla de orden compitiendo en silencio con la del
    // `ORDER BY`, que es el mismo argumento que ya escribió `buildListingGrid`.
    const home = buildHome(
      homeCollections(CITIES),
      new Map([[DC, page(["tres", "uno", "dos"], 3)]]),
      coversFor("tres", "uno", "dos"),
      BASE_URL,
    );

    expect(home.strips[0]?.cards.map((card) => card.id)).toEqual(["tres", "uno", "dos"]);
  });

  it("arma la ruta de cada tarjeta con la regla de la cuadrícula, no con una propia", () => {
    const home = buildHome(
      homeCollections(CITIES),
      new Map([
        [
          DC,
          {
            rows: [listing("abc", { title: "Apartamento en la avenida", zoneName: "Altamira" })],
            total: 1,
            zoneCount: 1,
          } as HomeCollectionPage,
        ],
      ]),
      coversFor("abc"),
      BASE_URL,
    );

    expect(home.strips[0]?.cards[0]?.href).toBe(
      "/alquiler/distrito-capital/altamira/apartamento-en-la-avenida-abc",
    );
  });
});

/**
 * **La placa del inicio y la ruta que la atiende, atadas.**
 *
 * Existe por la misma razón que `signin-return.test.ts`: lo que falla no es el
 * render de ninguno de los dos lados, sino que **los dos usen la misma forma**.
 * El inicio arma `/alquiler/<slug>` y la página de ciudad resuelve el segmento
 * contra `slugify(nombre)`. Si alguien cambia una de las dos, la placa «Ver los
 * 23» empieza a devolver 404 — y la pantalla se sigue dibujando perfecta.
 */
describe("la placa de ciudad cae en una ruta que resuelve", () => {
  const CITIES = [
    { id: "mar", name: "Maracaibo" },
    { id: "dtto", name: "Distrito Capital" },
  ];

  it("el último segmento del enlace resuelve a la misma ciudad", () => {
    for (const city of CITIES) {
      const spec = homeCollections(CITIES).find(
        (candidate) => candidate.href === `/alquiler/${slugify(city.name)}`,
      );

      expect(spec).toBeDefined();
      const segment = (spec?.href ?? "").split("/").pop() ?? "";
      expect(resolveCityRoute(CITIES, segment)?.id).toBe(city.id);
    }
  });
});

/**
 * **El aislamiento de ciudad, que es la regla no negociable de esta pantalla.**
 *
 * Con una ciudad elegida, ninguna superficie del inicio puede devolver un aviso
 * de la otra. No alcanza con que la tira de la otra ciudad desaparezca: si
 * «Recién publicados» o «Hasta $400» siguieran cruzando el catálogo, un aviso
 * de Distrito Capital aparecería en la portada de alguien que dijo Maracaibo —
 * y ésa es exactamente la fuga que el resto del producto cierra dos veces (el
 * puerto de búsqueda no sabe expresar una consulta sin ciudad, y la clave
 * foránea `listing_zone_city_fk` hace imposible una fila cruzada).
 *
 * Acá el aislamiento no puede apoyarse en ninguna de esas dos: estas
 * colecciones NO pasan por `ListingSearchPort` y `cityId` es nulable a
 * propósito, porque sin ciudad elegida la tira barata sí cruza el país. Eso
 * deja la garantía enteramente en estas líneas, que es la razón de que estén
 * escritas como una afirmación sobre TODAS las colecciones y no sobre la que
 * uno se acuerde de mirar.
 */
describe("homeCollections — el aislamiento de ciudad", () => {
  it("con una ciudad elegida, TODA colección queda atada a esa ciudad", () => {
    const specs = homeCollections(CITIES, "mcbo");

    expect(specs).not.toHaveLength(0);
    for (const spec of specs) {
      expect(spec.cityId).toBe("mcbo");
    }
  });

  /**
   * La tira de la otra ciudad **desaparece**, no queda vacía. Una tira
   * «Distrito Capital» sin tarjetas dentro de una portada que dice Maracaibo
   * es la contradicción visible de la regla de arriba.
   */
  it("borra la tira de la otra ciudad en vez de dejarla vacía", () => {
    const keys = homeCollections(CITIES, "mcbo").map((spec) => spec.key);

    expect(keys).toContain("ciudad:mcbo");
    expect(keys).not.toContain("ciudad:dc");
  });

  it("deja las otras dos tiras, ahora recortadas a la ciudad elegida", () => {
    const kinds = homeCollections(CITIES, "mcbo").map((spec) => spec.kind);

    // Recientes y presupuesto siguen existiendo: son preguntas distintas y las
    // dos tienen respuesta dentro de una ciudad.
    expect(kinds).toEqual(["recent", "city", "budget"]);
  });

  it("el techo de precio sobrevive al recorte por ciudad", () => {
    const budget = homeCollections(CITIES, "mcbo").find((spec) => spec.kind === "budget");

    // Las dos condiciones a la vez, no una en lugar de la otra: «hasta $400 en
    // Maracaibo» es la tira, y perder cualquiera de las dos la vuelve otra.
    expect(budget).toMatchObject({ cityId: "mcbo", maxPriceUsd: HOME_BUDGET_CEILING_USD });
  });

  /**
   * **Una ciudad que el catálogo no tiene se ignora, y el inicio sigue siendo
   * el inicio.** `?ciudad=cualquier-cosa` no puede producir una portada vacía
   * —indistinguible, para quien la mira, de «no hay nada publicado»— ni un
   * `WHERE city_id = 'cualquier-cosa'` garantizado a cero.
   */
  it("ignora una ciudad que el catálogo no reconoce", () => {
    expect(homeCollections(CITIES, "narnia")).toEqual(homeCollections(CITIES));
  });

  it("sin ciudad elegida ninguna colección afirma una", () => {
    const specs = homeCollections(CITIES);

    expect(specs.find((spec) => spec.kind === "recent")?.cityId).toBeNull();
    expect(specs.find((spec) => spec.kind === "budget")?.cityId).toBeNull();
  });
});

/**
 * **De `?ciudad=maracaibo` a la ciudad del catálogo.**
 *
 * La URL lleva el slug del nombre y no el id, por la misma razón que
 * `/alquiler/<ciudad>`: un id es un dato interno y no significa nada para
 * quien lee la dirección antes de tocarla. La traducción reusa
 * `resolveCityRoute` en vez de escribir una segunda regla de acentos.
 */
describe("resolveHomeCity — qué ciudad nombra el parámetro", () => {
  it("resuelve el slug del nombre, acentos y mayúsculas incluidos", () => {
    expect(resolveHomeCity(CITIES, "distrito-capital")?.id).toBe("dc");
  });

  it("sin parámetro no hay ciudad elegida, y eso es el inicio completo", () => {
    expect(resolveHomeCity(CITIES, undefined)).toBeNull();
    expect(resolveHomeCity(CITIES, "")).toBeNull();
  });

  it("una ciudad desconocida es ninguna, nunca la primera", () => {
    // La asimetría que `resolveZoneRoute` ya documenta: caer a la primera
    // ciudad acá dibujaría las fichas con Maracaibo marcada cuando alguien
    // pidió otra cosa.
    expect(resolveHomeCity(CITIES, "narnia")).toBeNull();
  });
});

/**
 * **Las fichas de ciudad (F2).** Son la única forma de elegir ciudad sin
 * JavaScript: cada una es un enlace a una dirección que ya existe.
 */
describe("homeCityChips — las fichas de ciudad", () => {
  it("emite una ficha por ciudad del catálogo, en su orden", () => {
    expect(homeCityChips(CITIES, null).map((chip) => chip.label)).toEqual([
      "Distrito Capital",
      "Maracaibo",
    ]);
  });

  it("sin ciudad elegida ninguna ficha está activa", () => {
    expect(homeCityChips(CITIES, null).every((chip) => !chip.selected)).toBe(true);
  });

  it("marca activa exactamente la ciudad elegida", () => {
    const chips = homeCityChips(CITIES, "mcbo");

    expect(chips.filter((chip) => chip.selected).map((chip) => chip.cityId)).toEqual(["mcbo"]);
  });

  it("una ficha inactiva lleva a su ciudad, con el slug del nombre", () => {
    const dc = homeCityChips(CITIES, "mcbo").find((chip) => chip.cityId === "dc");

    expect(dc?.href).toBe("/?ciudad=distrito-capital");
  });

  /**
   * **La ficha activa quita la ciudad en vez de repetirla.** Es la única salida
   * sin JavaScript: sin esto, elegir una ciudad es un camino de ida y volver al
   * inicio completo depende del botón «atrás» del navegador.
   */
  it("la ficha activa vuelve al inicio sin ciudad", () => {
    const mcbo = homeCityChips(CITIES, "mcbo").find((chip) => chip.cityId === "mcbo");

    expect(mcbo?.href).toBe("/");
  });

  it("sin catálogo no hay fichas que dibujar", () => {
    expect(homeCityChips([], null)).toEqual([]);
  });
});

/**
 * **La barra de búsqueda va siempre, y su destino es una decisión de producto.**
 *
 * La lámina la dibuja como un enlace al acordeón de cuatro pasos, que hoy no
 * existe como ruta. Mientras no exista, la barra apunta a la superficie de
 * búsqueda que el producto **sí** sirve: `/alquiler/<ciudad>`, que desde la
 * 14.24 *es* la búsqueda de esa ciudad. El día que el acordeón aterrice, lo
 * único que cambia es esta función.
 */
describe("homeSearchBar — la barra y a dónde lleva", () => {
  it("dice siempre lo mismo, que es lo que la lámina escribe", () => {
    expect(homeSearchBar(CITIES, null).label).toBe(HOME_SEARCH_LABEL);
  });

  it("con una ciudad elegida lleva a la búsqueda de esa ciudad", () => {
    expect(homeSearchBar(CITIES, "mcbo").href).toBe("/alquiler/maracaibo");
  });

  /**
   * Antes de que nadie elija, la primera del catálogo. Es la regla que
   * `resolveSelectedCity` ya dejó escrita del otro lado del producto —«¿qué ve
   * alguien antes de elegir?»— y lo que importa es que sea una regla dicha en
   * un lugar y no el resultado accidental de un `ORDER BY name`.
   */
  it("sin ciudad elegida lleva a la primera del catálogo", () => {
    expect(homeSearchBar(CITIES, null).href).toBe("/alquiler/distrito-capital");
  });

  /**
   * **Sin catálogo la barra no es un enlace.** Un ancla hacia una ruta que
   * nadie sirve es el enlace roto que este repositorio ya se negó a publicar
   * dos veces; la barra se sigue dibujando, pero no promete un destino.
   */
  it("sin ninguna ciudad no promete ningún destino", () => {
    expect(homeSearchBar([], null).href).toBeNull();
  });
});

/**
 * **El subtítulo de la tira, y el número que dice.**
 *
 * «23 avisos activos en cuatro zonas.» Los dos números salen de la colección
 * entera y no de las cinco tarjetas dibujadas, por la misma razón que la placa
 * «Ver los 23»: contar lo que hay en pantalla daría siempre cinco.
 */
describe("buildHome — el subtítulo y su conteo", () => {
  function homeWith(key: string, collection: HomeCollectionPage) {
    return buildHome(
      homeCollections(CITIES),
      new Map([[key, collection]]),
      coversFor(...collection.rows.map((row) => row.id)),
      BASE_URL,
    );
  }

  it("dice el total de la colección y sus zonas, no las tarjetas en pantalla", () => {
    const home = homeWith(MCBO, page(["a", "b", "c", "d", "e"], 23, 4));

    expect(home.strips[0]?.cards).toHaveLength(5);
    expect(home.strips[0]?.subtitle).toBe("23 avisos activos en cuatro zonas.");
  });

  /**
   * **Sólo la tira de una ciudad lo lleva, y la lámina lo dibuja así en los dos
   * anchos.** Contar zonas sólo significa algo cuando la colección está
   * confinada a un lugar: «cuatro zonas» debajo de «Recién publicados», que
   * cruza el país, no le dice nada a nadie.
   */
  it.each([
    ["recientes", () => RECENT],
    ["presupuesto", () => BUDGET],
  ])("no lo pone en la tira de %s", (_caso, key) => {
    const home = homeWith(key(), page(["a"], 40, 6));

    expect(home.strips[0]?.subtitle).toBeNull();
  });

  it("un solo aviso y una sola zona van en singular", () => {
    const home = homeWith(MCBO, page(["a"], 1, 1));

    expect(home.strips[0]?.subtitle).toBe("1 aviso activo en una zona.");
  });

  /**
   * El número de avisos va en cifra y el de zonas en palabra, que es como la
   * lámina lo escribe: «23 avisos activos en cuatro zonas». Es una regla de
   * redacción, y por eso está probada en vez de quedar a criterio del que
   * escriba la próxima tira.
   */
  it.each([
    [2, "dos"],
    [4, "cuatro"],
    [9, "nueve"],
  ])("deletrea %i zonas como «%s»", (zoneCount, word) => {
    const home = homeWith(MCBO, page(["a"], 30, zoneCount));

    expect(home.strips[0]?.subtitle).toBe(`30 avisos activos en ${word} zonas.`);
  });

  it("de diez zonas en adelante vuelve a la cifra", () => {
    // La palabra deja de ayudar a leer y empieza a estorbar: «doce» exige
    // convertirla de vuelta a un número para compararla con la de al lado.
    const home = homeWith(MCBO, page(["a"], 30, 12));

    expect(home.strips[0]?.subtitle).toBe("30 avisos activos en 12 zonas.");
  });

  it("sin zonas no inventa una frase", () => {
    const home = homeWith(MCBO, page(["a"], 1, 0));

    expect(home.strips[0]?.subtitle).toBeNull();
  });
});
