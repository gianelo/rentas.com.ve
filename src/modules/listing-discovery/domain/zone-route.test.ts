import { describe, expect, it } from "vitest";
import { isFilteredZoneRoute, resolveZoneRoute } from "./zone-route";

const cities = [
  { id: "dc", name: "Distrito Capital" },
  { id: "mcbo", name: "Maracaibo" },
];

const zones = [
  { id: "chacao", name: "Chacao", cityId: "dc" },
  { id: "centro-dc", name: "Centro", cityId: "dc" },
  { id: "centro-mcbo", name: "Centro", cityId: "mcbo" },
  { id: "la-lago", name: "La Lago", cityId: "mcbo" },
];

describe("resolveZoneRoute", () => {
  it("devuelve la ciudad y la zona que nombran los dos segmentos", () => {
    expect(resolveZoneRoute(cities, zones, "distrito-capital", "chacao")).toEqual({
      city: cities[0],
      zone: zones[0],
    });
  });

  /**
   * **El caso que obliga a resolver los dos segmentos juntos.** `Centro` es
   * una zona en Maracaibo Y en Distrito Capital — está en la semilla y
   * `tests/integration/listing-search.test.ts` ya lo cubre como el caso de
   * nombres que chocan. Resolver la zona sola devolvería la del otro extremo
   * del país, y bajo la regla de aislamiento por ciudad la búsqueda saldría
   * vacía sin que nadie pueda ver por qué.
   */
  it("no confunde dos zonas homónimas de ciudades distintas", () => {
    expect(resolveZoneRoute(cities, zones, "maracaibo", "centro")?.zone.id).toBe("centro-mcbo");
    expect(resolveZoneRoute(cities, zones, "distrito-capital", "centro")?.zone.id).toBe(
      "centro-dc",
    );
  });

  it("compara contra el slug del nombre, no contra el nombre", () => {
    // `La Lago` vive en la URL como `la-lago`: mayúsculas y espacios no son
    // parte de una ruta.
    expect(resolveZoneRoute(cities, zones, "maracaibo", "la-lago")?.zone.id).toBe("la-lago");
  });

  /**
   * `null`, y nunca una ciudad por defecto. Un segmento que no nombra nada es
   * una URL que no existe, y responder 200 con los resultados de otro lugar
   * publica contenido duplicado bajo una dirección inventada — exactamente lo
   * que la 11.1 evita del otro lado, en la ficha.
   */
  it("devuelve null cuando la ciudad no está en el catálogo", () => {
    expect(resolveZoneRoute(cities, zones, "valencia", "centro")).toBeNull();
  });

  it("devuelve null cuando la zona no pertenece a esa ciudad", () => {
    expect(resolveZoneRoute(cities, zones, "maracaibo", "chacao")).toBeNull();
  });

  it("devuelve null cuando algún segmento viene vacío", () => {
    expect(resolveZoneRoute(cities, zones, "", "chacao")).toBeNull();
    expect(resolveZoneRoute(cities, zones, "distrito-capital", "")).toBeNull();
  });

  it("devuelve null con un catálogo vacío en vez de romper", () => {
    expect(resolveZoneRoute([], [], "distrito-capital", "chacao")).toBeNull();
  });
});

describe("isFilteredZoneRoute", () => {
  /**
   * **La regla de indexación de la 14.24, y su valor es que es mecánica.**
   * Sin parámetros la ruta es la zona y se indexa; con parámetros es una
   * refinada, y las refinadas son combinatorias — indexarlas publica cientos
   * de direcciones con casi el mismo contenido, que es la penalización que
   * cae sobre el dominio entero y no sobre una página.
   */
  it("dice que no hay filtros cuando la query viene vacía", () => {
    expect(isFilteredZoneRoute({})).toBe(false);
  });

  it.each(["min", "max", "hab"])("reconoce %s como filtro", (key) => {
    expect(isFilteredZoneRoute({ [key]: "2" })).toBe(true);
  });

  /**
   * Un parámetro presente y vacío es lo que deja un formulario `GET` cuyo
   * campo nadie llenó. No filtra nada, así que no debería sacar la página del
   * índice.
   */
  it("ignora un filtro presente pero vacío", () => {
    expect(isFilteredZoneRoute({ min: "", max: "   " })).toBe(false);
  });

  it("ignora un parámetro que no es un filtro de esta pantalla", () => {
    // `utm_source` llega pegado en cada enlace compartido. Si contara como
    // filtro, compartir la zona por WhatsApp la sacaría del índice.
    expect(isFilteredZoneRoute({ utm_source: "whatsapp" })).toBe(false);
  });
});
