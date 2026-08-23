import { describe, expect, it } from "vitest";
import { type SuggestionVocabulary, suggestFilters } from "./suggest-filters";

/**
 * **Traduce, no busca.** Ésta es la distinción que hace que la caja de
 * sugerencias no contradiga la exclusión de "búsqueda de texto libre" del
 * propio documento del fundador. Nunca lee títulos ni descripciones de avisos,
 * así que **no puede devolver vacío** — que era la razón por la que el texto
 * libre quedó afuera: "con 47 avisos devuelve vacío casi siempre y el sitio
 * parece vacío".
 */
const VOCABULARY: SuggestionVocabulary = {
  cities: [
    { id: "area-mcbo", name: "Maracaibo" },
    { id: "area-ccs", name: "Caracas" },
  ],
  zones: [
    {
      id: "z-tierra",
      name: "Sector Tierra Negra",
      cityId: "area-mcbo",
      parentName: "Olegario Villalobos",
    },
    { id: "z-centro-coq", name: "Centro", cityId: "area-mcbo", parentName: "Coquivacoa" },
    { id: "z-centro-ccs", name: "Centro", cityId: "area-ccs", parentName: "Catedral" },
    { id: "z-chacao", name: "Urbanización Chacao", cityId: "area-ccs", parentName: "Chacao" },
    { id: "z-altamira", name: "Altamira", cityId: "area-ccs", parentName: "Chacao" },
  ],
  // Los alias son el aporte del índice de topónimos: el nombre por el que la
  // gente busca, no el que la fuente publica.
  aliases: [
    { zoneId: "z-tierra", alias: "Tierra Negra" },
    { zoneId: "z-chacao", alias: "Chacao" },
  ],
};

describe("suggestFilters", () => {
  it("reconoce una ciudad y descarta la palabra de relleno", () => {
    // "arriendo" es lo que el sitio entero hace: no distingue nada.
    const suggestions = suggestFilters("arriendo maracaibo", VOCABULARY);

    expect(suggestions).toContainEqual({
      kind: "city",
      id: "area-mcbo",
      label: "Maracaibo",
      scope: null,
    });
  });

  /**
   * **El caso que obliga a que una sugerencia sea un par filtro + valor.**
   * `Centro` existe en Maracaibo y en Caracas. Una sugerencia que dijera sólo
   * "Centro" aplicaría el filtro de la ciudad equivocada, y el visitante se
   * llevaría cero resultados sin entender por qué — porque el aislamiento de
   * ciudad es una garantía dura de la base.
   */
  it("desambigua un nombre repetido con su padre", () => {
    const suggestions = suggestFilters("centro", VOCABULARY).filter((s) => s.kind === "zone");

    expect(suggestions).toHaveLength(2);
    expect(suggestions.map((s) => s.scope)).toEqual(["Coquivacoa", "Catedral"]);
  });

  /**
   * **Lo que compran los 3.547 alias.** El árbol guarda "Sector Tierra Negra",
   * que es lo que la fuente publica; nadie escribe eso en una caja de búsqueda.
   */
  it("encuentra una zona por su alias, no sólo por su nombre completo", () => {
    const suggestions = suggestFilters("tierra negra", VOCABULARY);

    expect(suggestions.some((s) => s.kind === "zone" && s.id === "z-tierra")).toBe(true);
  });

  it("ignora acentos y mayúsculas, porque nadie los escribe en un teléfono", () => {
    // Reusa el mismo quitado de acentos que ya ship*a* en listing-url.
    expect(suggestFilters("MARACAYBO", VOCABULARY)).toEqual([]);
    expect(suggestFilters("urbanizacion chacao", VOCABULARY).length).toBeGreaterThan(0);
  });

  it("lee un precio máximo escrito como lo escribe la gente", () => {
    for (const text of ["hasta 400", "menos de 400", "maximo 400"]) {
      expect(suggestFilters(text, VOCABULARY)).toContainEqual({
        kind: "maxPrice",
        id: "400",
        label: "Hasta $400 al mes",
        scope: null,
      });
    }
  });

  it("lee las habitaciones", () => {
    expect(suggestFilters("2 habitaciones", VOCABULARY)).toContainEqual({
      kind: "rooms",
      id: "2",
      label: "2 habitaciones",
      scope: null,
    });
    expect(suggestFilters("apartamento 3 hab", VOCABULARY)).toContainEqual({
      kind: "rooms",
      id: "3",
      label: "3 habitaciones",
      scope: null,
    });
  });

  it("lee el tipo de propiedad, que es lo que más se escribe después del lugar", () => {
    expect(suggestFilters("anexo maracaibo", VOCABULARY)).toContainEqual({
      kind: "propertyType",
      id: "anexo",
      label: "Anexo",
      scope: null,
    });
  });

  it("combina varias señales de una misma frase", () => {
    const kinds = suggestFilters("anexo amoblado en chacao hasta 500", VOCABULARY).map(
      (s) => s.kind,
    );

    expect(kinds).toContain("propertyType");
    expect(kinds).toContain("feature");
    expect(kinds).toContain("zone");
    expect(kinds).toContain("maxPrice");
  });

  /**
   * **Nunca devuelve vacío por no encontrar avisos, porque no los mira.** Puede
   * devolver vacío si el texto no coincide con ningún término del vocabulario,
   * que es otra cosa: significa "no entendí", no "no hay nada".
   */
  it("devuelve vacío para texto que no coincide con nada conocido", () => {
    // Ojo: "casa" SÍ es un tipo de propiedad, así que esa frase sugiere algo.
    // Para probar el vacío hace falta texto que no toque el vocabulario.
    expect(suggestFilters("vista al espacio exterior", VOCABULARY)).toEqual([]);
    expect(suggestFilters("", VOCABULARY)).toEqual([]);
  });

  /**
   * **El defecto que este archivo tenía, escrito como test.**
   *
   * `matches` comparaba en una sola dirección: preguntaba si el nombre de la
   * zona estaba DENTRO de lo escrito. Eso alcanza para traducir una frase
   * entera («arriendo en altamira»), y no alcanza para lo que alguien hace
   * mientras escribe — «alta» no devolvía nada aunque Altamira exista, y la
   * caja parecía rota.
   *
   * `searchPublicationZones` (listing-publication) ya había resuelto el mismo
   * problema para el paso 2 comparando en las dos direcciones. La regla se
   * unificó acá, que es de donde las dos partes toman el vocabulario.
   */
  it("encuentra Altamira escribiendo «alta», que es lo que alguien teclea", () => {
    const suggestions = suggestFilters("alta", VOCABULARY);

    expect(suggestions.some((s) => s.kind === "zone" && s.id === "z-altamira")).toBe(true);
  });

  it("sigue traduciendo la frase entera, que era la dirección que ya andaba", () => {
    const suggestions = suggestFilters("apartamento en altamira", VOCABULARY);

    expect(suggestions.some((s) => s.kind === "zone" && s.id === "z-altamira")).toBe(true);
    expect(suggestions.some((s) => s.kind === "propertyType" && s.id === "apartamento")).toBe(true);
  });

  it("encuentra un alias por su comienzo, no sólo entero", () => {
    // «tierr» es lo que hay escrito cuando todavía falta media palabra.
    expect(suggestFilters("tierr", VOCABULARY).some((s) => s.id === "z-tierra")).toBe(true);
  });

  /**
   * **Una o dos letras no son una sugerencia, son la lista entera.** Sobre un
   * vocabulario cerrado, `nombre.includes("a")` acierta en casi todo: ofrecer
   * eso no ayuda a elegir, y encima esconde las coincidencias reales de quien
   * ya escribió una palabra completa.
   */
  it("no autocompleta con una sola letra", () => {
    expect(suggestFilters("a", VOCABULARY)).toEqual([]);
    expect(suggestFilters("al", VOCABULARY)).toEqual([]);
  });

  /**
   * **`slugify` corta a 60 caracteres, y ese tope es de las URL, no del texto
   * que alguien escribe.** Sesenta caracteres mantienen la primera cláusula de
   * un título en un enlace que se pega en un WhatsApp; acá cortarían la frase
   * justo donde la gente pone el precio y las habitaciones, que van al final.
   * Se descubrió con una zona de nombre largo: el `hasta 400` quedaba afuera y
   * el filtro de precio desaparecía sin que nada fallara.
   */
  it("no pierde el final de una frase larga", () => {
    const text = "apartamento amoblado con vigilancia en urbanizacion chacao hasta 400 y 2 hab";
    expect(text.length).toBeGreaterThan(60);

    const suggestions = suggestFilters(text, VOCABULARY);

    expect(suggestions.some((s) => s.kind === "maxPrice" && s.id === "400")).toBe(true);
    expect(suggestions.some((s) => s.kind === "rooms" && s.id === "2")).toBe(true);
  });

  it("no repite la misma sugerencia dos veces", () => {
    // "chacao chacao" no debería ofrecer la zona dos veces.
    const suggestions = suggestFilters("chacao chacao", VOCABULARY);
    const keys = suggestions.map((s) => `${s.kind}|${s.id}`);

    expect(new Set(keys).size).toBe(keys.length);
  });
});
