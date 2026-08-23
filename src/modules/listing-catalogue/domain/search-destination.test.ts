import { describe, expect, it } from "vitest";
import {
  HOME_SEARCH_PARAM,
  homeSearchForm,
  noMatchMessage,
  resolveSearchDestination,
} from "./search-destination";
import type { SuggestionVocabulary } from "./suggest-filters";

/**
 * El vocabulario mínimo que ejercita las dos trampas del dominio: un nombre de
 * zona repetido entre ciudades (`Centro`) y una zona que la fuente publica con
 * un nombre que nadie escribe (`Sector Tierra Negra`, alias «Tierra Negra»).
 */
const VOCABULARY: SuggestionVocabulary = {
  cities: [
    { id: "area-ccs", name: "Distrito Capital" },
    { id: "area-mcbo", name: "Maracaibo" },
  ],
  zones: [
    { id: "z-altamira", name: "Altamira", cityId: "area-ccs", parentName: "Chacao" },
    { id: "z-centro-ccs", name: "Centro", cityId: "area-ccs", parentName: "Catedral" },
    { id: "z-centro-mcbo", name: "Centro", cityId: "area-mcbo", parentName: "Coquivacoa" },
    {
      id: "z-tierra",
      name: "Sector Tierra Negra",
      cityId: "area-mcbo",
      parentName: "Olegario Villalobos",
    },
    { id: "z-huerfana", name: "Zona Sin Ciudad", cityId: "area-fantasma", parentName: null },
  ],
  aliases: [{ zoneId: "z-tierra", alias: "Tierra Negra" }],
};

describe("resolveSearchDestination", () => {
  /**
   * **El caso que la consigna nombra**: escribir «arriendo maracaibo» tiene que
   * llevar al filtro Maracaibo, no a una búsqueda de texto.
   */
  it("manda a la ciudad cuando lo escrito la nombra", () => {
    expect(resolveSearchDestination("arriendo maracaibo", VOCABULARY)).toEqual({
      kind: "route",
      href: "/alquiler/maracaibo",
    });
  });

  it("manda a la zona, que es más específica que su ciudad", () => {
    expect(resolveSearchDestination("altamira", VOCABULARY)).toEqual({
      kind: "route",
      href: "/alquiler/distrito-capital/altamira",
    });
  });

  /**
   * **Lo que compran los 3.547 alias.** El árbol guarda «Sector Tierra Negra»;
   * nadie escribe eso. Y el destino se arma con el NOMBRE CURADO, nunca con el
   * alias: `/alquiler/maracaibo/tierra-negra` no resuelve, porque
   * `resolveZoneRoute` compara contra `slugify(zone.name)`.
   */
  it("encuentra la zona por su alias y arma la ruta con el nombre curado", () => {
    expect(resolveSearchDestination("bella tierra negra", VOCABULARY)).toEqual({
      kind: "route",
      href: "/alquiler/maracaibo/sector-tierra-negra",
    });
  });

  /**
   * **La razón por la que una sugerencia es un par (filtro, valor) y nunca una
   * palabra.** `Centro` existe en Maracaibo y en Distrito Capital. Elegir una
   * de las dos por lo escrito aplicaría el filtro de la ciudad equivocada, y el
   * aislamiento de ciudad es una garantía dura de la base: la respuesta sería
   * cero avisos sin que nadie pueda ver por qué.
   */
  it("no elige por el visitante cuando el nombre existe en dos ciudades", () => {
    const destination = resolveSearchDestination("centro", VOCABULARY);

    expect(destination.kind).toBe("choices");
    if (destination.kind !== "choices") throw new Error("debía ofrecer a elegir");

    expect(destination.options.map((option) => option.href)).toEqual([
      "/alquiler/distrito-capital/centro",
      "/alquiler/maracaibo/centro",
    ]);
    // El `scope` es lo único que las distingue en pantalla, y lleva la ciudad:
    // la parroquia sola («Catedral») no le dice a nadie de qué ciudad se habla.
    expect(destination.options.map((option) => option.scope)).toEqual([
      "Catedral · Distrito Capital",
      "Coquivacoa · Maracaibo",
    ]);
  });

  it("una zona sin ciudad curada no se puede ofrecer", () => {
    // Su ruta sería `/alquiler/<nada>/zona-sin-ciudad`: un enlace roto.
    expect(resolveSearchDestination("zona sin ciudad", VOCABULARY).kind).toBe("unknown");
  });

  /**
   * La ciudad que ya contiene a la zona encontrada no agrega una opción: elegir
   * «Distrito Capital» cuando ya se nombró Altamira es la misma búsqueda, más
   * ancha, y ofrecerla convierte un destino claro en una pregunta.
   */
  it("descarta la ciudad que la zona encontrada ya implica", () => {
    expect(resolveSearchDestination("altamira distrito capital", VOCABULARY)).toEqual({
      kind: "route",
      href: "/alquiler/distrito-capital/altamira",
    });
  });

  it("conserva la ciudad ajena a la zona, porque ahí sí hay dos lugares", () => {
    const destination = resolveSearchDestination("altamira maracaibo", VOCABULARY);

    expect(destination.kind).toBe("choices");
    if (destination.kind !== "choices") throw new Error("debía ofrecer a elegir");
    expect(destination.options.map((option) => option.href)).toEqual([
      "/alquiler/distrito-capital/altamira",
      "/alquiler/maracaibo",
    ]);
  });

  /**
   * **Los filtros viajan en la query, el lugar en la ruta.** Es el reparto que
   * fijó la 14.24, y acá se cumple reusando `buildSearchHref` en vez de pegar
   * cadenas: los nombres cortos del fundador viven en un solo lugar.
   */
  it("pega los filtros de la misma frase a la ruta del lugar", () => {
    expect(
      resolveSearchDestination("apartamento amoblado en altamira hasta 400 con 2 hab", VOCABULARY),
    ).toEqual({
      kind: "route",
      href: "/alquiler/distrito-capital/altamira?max=400&hab=2&tipo=apartamento&amoblado=1",
    });
  });

  it("lee «de dueños» como el filtro de publicante", () => {
    const destination = resolveSearchDestination("altamira de dueno", VOCABULARY);

    expect(destination).toEqual({
      kind: "route",
      href: "/alquiler/distrito-capital/altamira?pub=owner",
    });
  });

  /**
   * **Sin lugar no hay búsqueda posible**, porque toda búsqueda lleva un
   * `cityId` obligatorio — `ListingSearchPort` lo garantiza a nivel de tipo. La
   * salida honesta no es un error: es ofrecer las ciudades del producto con los
   * filtros ya puestos, que es otra vez un par (filtro, valor).
   */
  it("ofrece las ciudades cuando hay filtros pero ningún lugar", () => {
    const destination = resolveSearchDestination("apartamento amoblado", VOCABULARY);

    expect(destination.kind).toBe("choices");
    if (destination.kind !== "choices") throw new Error("debía ofrecer a elegir");
    expect(destination.options.map((option) => option.href)).toEqual([
      "/alquiler/distrito-capital?tipo=apartamento&amoblado=1",
      "/alquiler/maracaibo?tipo=apartamento&amoblado=1",
    ]);
    expect(destination.options.map((option) => option.label)).toEqual([
      "Distrito Capital",
      "Maracaibo",
    ]);
  });

  /**
   * Vacío significa «no entendí», nunca «no hay avisos»: acá no se leen títulos
   * ni descripciones, así que la oferta no puede vaciar esta respuesta.
   */
  it("no entiende un texto que no toca el vocabulario", () => {
    expect(resolveSearchDestination("vista al espacio exterior", VOCABULARY).kind).toBe("unknown");
    expect(resolveSearchDestination("   ", VOCABULARY).kind).toBe("unknown");
  });

  it("corta la lista de opciones antes de volverse un índice", () => {
    const many: SuggestionVocabulary = {
      cities: VOCABULARY.cities,
      zones: Array.from({ length: 30 }, (_, index) => ({
        id: `z-${index}`,
        name: `San Rafael ${index}`,
        cityId: "area-mcbo",
        parentName: null,
      })),
      aliases: [],
    };
    const destination = resolveSearchDestination("san rafael", many, 6);

    expect(destination.kind).toBe("choices");
    if (destination.kind !== "choices") throw new Error("debía ofrecer a elegir");
    expect(destination.options).toHaveLength(6);
  });
});

describe("homeSearchForm", () => {
  it("compone la caja con la pregunta del producto, no con una etiqueta propia", () => {
    const form = homeSearchForm();

    expect(form.label).toBe("¿En qué zona buscás?");
    expect(form.name).toBe(HOME_SEARCH_PARAM);
    // El formulario vuelve al inicio: no hay una `/buscar` que la 14.24 borró.
    expect(form.action).toBe("/");
    expect(form.value).toBe("");
  });

  it("devuelve lo escrito para que el campo no se vacíe al volver del servidor", () => {
    expect(homeSearchForm("  altamira  ").value).toBe("altamira");
  });
});

describe("noMatchMessage", () => {
  /**
   * **Dice «no entendí», nunca «no hay avisos».** Acá no se leen títulos ni
   * descripciones, así que la oferta no puede producir este mensaje — y
   * echarle la culpa al catálogo es justo el error que la exclusión de
   * «búsqueda de texto libre» quería evitar.
   */
  it("no le echa la culpa al catálogo", () => {
    const message = noMatchMessage(" nave espacial ");

    expect(message).toContain("nave espacial");
    expect(message).not.toMatch(/sin resultados|no hay avisos/i);
  });
});
