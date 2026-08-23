import { describe, expect, it } from "vitest";
import type { SuggestionVocabulary } from "../../listing-catalogue/domain/suggest-filters";
import { resolveZoneCity, searchPublicationZones } from "./zone-search";

/**
 * El paso 2 no pregunta la ciudad. La deriva de la zona, y busca la zona
 * contra una lista cerrada, sin servicio externo (criterios 7 y 8).
 */
const VOCABULARY: SuggestionVocabulary = {
  cities: [
    { id: "dc", name: "Distrito Capital" },
    { id: "mcbo", name: "Maracaibo" },
  ],
  zones: [
    { id: "altamira", name: "Altamira", cityId: "dc", parentName: "Municipio Chacao" },
    { id: "alta-florida", name: "Alta Florida", cityId: "dc", parentName: "Municipio Libertador" },
    { id: "altavista", name: "Altavista", cityId: "dc", parentName: "Municipio Libertador" },
    { id: "altos-sucre", name: "Altos de Sucre", cityId: "dc", parentName: "Municipio Sucre" },
    { id: "la-lago", name: "La Lago", cityId: "mcbo", parentName: "Municipio Maracaibo" },
    { id: "centro-mcbo", name: "Centro", cityId: "mcbo", parentName: "Municipio Maracaibo" },
  ],
  aliases: [{ zoneId: "la-lago", alias: "Bella Vista" }],
};

describe("searchPublicationZones", () => {
  it("autocompleta por lo escrito: alta trae Altamira, Alta Florida y Altavista", () => {
    const results = searchPublicationZones("alta", VOCABULARY);

    expect(results.map((option) => option.zoneId)).toEqual([
      "altamira",
      "alta-florida",
      "altavista",
    ]);
  });

  it("NO trae Altos de Sucre con alta, y la ausencia es una decision", () => {
    // El artboard dibuja las cuatro, pero "Altos de Sucre" no empieza por
    // "alta" ni la contiene: alcanzarla exige coincidencia difusa. Una lista
    // difusa sobre una lista cerrada devuelve vecinos que nadie escribio, y
    // en un campo obligatorio eso publica un aviso en la zona equivocada.
    // Se prefiere la salida explicita — "¿No esta la tuya? Avisanos" — antes
    // que adivinar.
    expect(searchPublicationZones("alta", VOCABULARY).map((o) => o.zoneId)).not.toContain(
      "altos-sucre",
    );
    expect(searchPublicationZones("altos", VOCABULARY).map((o) => o.zoneId)).toEqual([
      "altos-sucre",
    ]);
  });

  it("encuentra por el medio del nombre, no solo por el comienzo", () => {
    // Quien escribe "florida" esta buscando Alta Florida y sabe menos de la
    // taxonomia que del lugar.
    expect(searchPublicationZones("florida", VOCABULARY).map((o) => o.zoneId)).toEqual([
      "alta-florida",
    ]);
  });

  it("ignora acentos y mayusculas, como el resto del producto", () => {
    // Reusa el mismo `slugify` que la URL de un aviso y que el vocabulario
    // compartido. Dos normalizadores es como dos partes del sistema empiezan
    // a discrepar sobre si «Chacao» y «chacao» son la misma palabra.
    expect(searchPublicationZones("ALTAMIRA", VOCABULARY).map((o) => o.zoneId)).toEqual([
      "altamira",
    ]);
  });

  it("devuelve SOLO zonas, nunca otra clase de sugerencia", () => {
    // El vocabulario compartido tambien traduce tipos, precios, atributos y
    // dueno/inmobiliaria. En el buscador de un formulario, ofrecer
    // "Apartamento" donde se elige una zona aplicaria un dato en el campo
    // equivocado, y quien publica no tendria como notarlo.
    const results = searchPublicationZones(
      "apartamento amoblado hasta 400 en altamira",
      VOCABULARY,
    );

    expect(results.map((option) => option.zoneId)).toEqual(["altamira"]);
  });

  it("cada resultado trae su ciudad: eso ES 'la ciudad la determina la zona'", () => {
    const [maracaibo] = searchPublicationZones("la lago", VOCABULARY);

    expect(maracaibo?.cityId).toBe("mcbo");
  });

  it("desambigua con municipio y ciudad, que es lo unico que distingue dos nombres iguales", () => {
    // "Centro" existe en Maracaibo y en Caracas. Sin el municipio y la
    // ciudad al lado, elegir uno de los dos es adivinar.
    const [centro] = searchPublicationZones("centro", VOCABULARY);

    expect(centro?.scope).toBe("Municipio Maracaibo · Maracaibo");
  });

  it("encuentra una zona por su alias, que es el nombre por el que la gente la busca", () => {
    const [bellaVista] = searchPublicationZones("bella vista", VOCABULARY);

    expect(bellaVista?.zoneId).toBe("la-lago");
    // La etiqueta es la del alias: quien escribio "Bella Vista" tiene que
    // reconocer lo que va a elegir.
    expect(bellaVista?.label).toBe("Bella Vista");
  });

  it("no repite una zona que entro por su alias y por su nombre", () => {
    const results = searchPublicationZones("la lago bella vista", VOCABULARY);

    expect(results.filter((option) => option.zoneId === "la-lago")).toHaveLength(1);
  });

  it("no devuelve nada con la busqueda vacia, en vez de volcar el catalogo entero", () => {
    expect(searchPublicationZones("", VOCABULARY)).toEqual([]);
    expect(searchPublicationZones("   ", VOCABULARY)).toEqual([]);
  });

  it("corta la lista, porque una pantalla de telefono no es un indice", () => {
    const results = searchPublicationZones("alt", VOCABULARY, 2);

    expect(results).toHaveLength(2);
  });

  it("tolera una zona sin municipio declarado sin dejar un separador colgando", () => {
    const results = searchPublicationZones("altamira", {
      ...VOCABULARY,
      zones: [{ id: "altamira", name: "Altamira", cityId: "dc", parentName: null }],
    });

    expect(results[0]?.scope).toBe("Distrito Capital");
  });

  it("descarta una zona cuya ciudad no esta en el catalogo", () => {
    // Una zona sin ciudad conocida no se puede publicar: `listing` tiene una
    // clave foranea compuesta que la rechazaria, y ofrecerla seria mandar a
    // alguien a un error de base de datos.
    const results = searchPublicationZones("altamira", {
      ...VOCABULARY,
      zones: [{ id: "altamira", name: "Altamira", cityId: "fantasma", parentName: null }],
    });

    expect(results).toEqual([]);
  });
});

describe("resolveZoneCity", () => {
  it("saca la ciudad de la zona, que es lo que hace que nunca se pregunte", () => {
    expect(resolveZoneCity("altamira", VOCABULARY)).toEqual({
      zoneId: "altamira",
      cityId: "dc",
    });
  });

  it("devuelve null para una zona que no existe, en vez de inventar una ciudad", () => {
    expect(resolveZoneCity("inventada", VOCABULARY)).toBeNull();
    expect(resolveZoneCity(undefined, VOCABULARY)).toBeNull();
  });

  it("devuelve null cuando la ciudad de la zona no esta curada", () => {
    expect(
      resolveZoneCity("altamira", {
        ...VOCABULARY,
        zones: [{ id: "altamira", name: "Altamira", cityId: "fantasma", parentName: null }],
      }),
    ).toBeNull();
  });
});
