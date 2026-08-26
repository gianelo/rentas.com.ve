import { describe, expect, it } from "vitest";
import {
  acceptsZoneQuery,
  resolveSearchLocation,
  ZONE_QUERY_NOT_ALLOWED_NOTICE,
} from "./search-location";

/**
 * **Un dato, un lugar** — la resolución del fundador del 2026-08-26.
 *
 * La 14.6 hizo `zoneIds` plural y la 14.36 dijo que la ubicación vive SOLO en
 * la ruta. Las dos no podían valer a la vez, porque una ruta tiene un solo
 * segmento de zona. Lo que se decidió: **hay una sola forma de URL por
 * búsqueda**, y la ubicación nunca aparece dos veces adentro de una dirección.
 */
const CIUDAD = { route: "city" } as const;
const ZONA = { route: "zone", routeZoneId: "z-bella-vista" } as const;

describe("qué ruta admite un «zona» en la query", () => {
  it("la de ciudad sí: es la única forma que tiene una búsqueda de varias zonas", () => {
    expect(acceptsZoneQuery("city")).toBe(true);
  });

  it("la de zona no: la dirección ya nombra el lugar", () => {
    expect(acceptsZoneQuery("zone")).toBe(false);
  });
});

describe("la ruta de ciudad, que es la que combina zonas", () => {
  it("toma las zonas de la query tal como llegaron, en su orden", () => {
    const location = resolveSearchLocation({
      ...CIUDAD,
      query: { zona: "chacao,altamira" },
      queryZoneIds: ["z-chacao", "z-altamira"],
    });

    expect(location.zoneIds).toEqual(["z-chacao", "z-altamira"]);
    expect(location.notice).toBeNull();
  });

  it("sin zonas es la ciudad entera, y eso no es un error que avisar", () => {
    const location = resolveSearchLocation({ ...CIUDAD, query: {}, queryZoneIds: [] });

    expect(location.zoneIds).toEqual([]);
    expect(location.notice).toBeNull();
  });

  it("no toca la query: acá «zona» es legal y tiene que seguir viajando", () => {
    const query = { zona: "chacao,altamira", max: "700" };

    expect(resolveSearchLocation({ ...CIUDAD, query, queryZoneIds: ["z-chacao"] }).query).toEqual(
      query,
    );
  });
});

describe("la ruta de zona, que rechaza el parámetro", () => {
  it("la zona de la ruta es la única, aunque la query traiga otras", () => {
    const location = resolveSearchLocation({
      ...ZONA,
      query: { zona: "la-lago,amparo" },
      queryZoneIds: ["z-la-lago", "z-amparo"],
    });

    expect(location.zoneIds).toEqual(["z-bella-vista"]);
  });

  it("lo dice en vez de aplicarlo a medias: el parámetro se ignora CON aviso", () => {
    const location = resolveSearchLocation({
      ...ZONA,
      query: { zona: "la-lago" },
      queryZoneIds: ["z-la-lago"],
    });

    expect(location.notice).toBe(ZONE_QUERY_NOT_ALLOWED_NOTICE);
  });

  it("sin el parámetro no hay nada que avisar", () => {
    const location = resolveSearchLocation({ ...ZONA, query: { max: "700" }, queryZoneIds: [] });

    expect(location.zoneIds).toEqual(["z-bella-vista"]);
    expect(location.notice).toBeNull();
  });

  /**
   * **La parte que hace que "ignorado" sea verdad.** Dejarlo en la query lo
   * arrastraría a cada enlace que la página compone —paginación, filtros,
   * «Entrar»— y un parámetro que viaja pero no aplica es exactamente el
   * medio-aplicado que la 14.23b prohíbe.
   */
  it("lo saca de la query, así ningún enlace de la página lo arrastra", () => {
    const location = resolveSearchLocation({
      ...ZONA,
      query: { zona: "la-lago", max: "700", hab: "2" },
      queryZoneIds: ["z-la-lago"],
    });

    expect(location.query).toEqual({ max: "700", hab: "2" });
  });

  it("un «zona» vacío no es un parámetro puesto: se saca igual, pero no avisa", () => {
    // Es lo que deja un formulario `GET` cuyo campo nadie llenó, y avisar de
    // eso sería acusar al visitante de algo que no hizo. Es el mismo criterio
    // que `isFilteredZoneRoute` ya aplica del lado de la indexación.
    const location = resolveSearchLocation({
      ...ZONA,
      query: { zona: "", max: "700" },
      queryZoneIds: [],
    });

    expect(location.notice).toBeNull();
    expect(location.query).toEqual({ max: "700" });
  });

  /**
   * **Falla cerrada, no abierta.** Una ruta de zona sin zona no existe —
   * `resolveZoneRoute` contesta 404 antes de llegar acá—, pero si alguna vez
   * llegara, la respuesta honesta es "esta búsqueda no tiene zona" y no
   * "entonces valen las de la query". Lo contrario devolvería por la ventana el
   * `?zona=` que esta ruta acaba de rechazar por la puerta.
   */
  it("una ruta de zona sin zona no busca en las de la query: se queda sin zona", () => {
    const location = resolveSearchLocation({
      route: "zone",
      query: { zona: "la-lago" },
      queryZoneIds: ["z-la-lago"],
    });

    expect(location.zoneIds).toEqual([]);
    expect(location.notice).toBe(ZONE_QUERY_NOT_ALLOWED_NOTICE);
  });

  it("avisa aunque el catálogo no reconozca ninguna: lo ilegal es el parámetro", () => {
    // No depende de si la zona existe. Lo que esta ruta rechaza es que la
    // ubicación aparezca dos veces en una dirección, y eso ya pasó.
    const location = resolveSearchLocation({
      ...ZONA,
      query: { zona: "una-zona-borrada" },
      queryZoneIds: [],
    });

    expect(location.zoneIds).toEqual(["z-bella-vista"]);
    expect(location.notice).toBe(ZONE_QUERY_NOT_ALLOWED_NOTICE);
    expect(location.query).toEqual({});
  });
});
