import { describe, expect, it } from "vitest";
import {
  buildHome,
  HOME_BUDGET_CEILING_USD,
  HOME_STRIP_SIZE,
  type HomeCollectionPage,
  homeCollections,
} from "./home-collections";
import type { GridCover, GridListing } from "./listing-grid";

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

function page(ids: readonly string[], total: number): HomeCollectionPage {
  return { rows: ids.map((id) => listing(id)), total };
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
