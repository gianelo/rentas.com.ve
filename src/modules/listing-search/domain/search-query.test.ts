import { describe, expect, it } from "vitest";
import { safeResultsOrigin } from "@/modules/listing-discovery/domain/return-to-results";
import { buildSearchCriteria } from "./search-criteria";
import {
  buildSearchHref,
  clearAllHref,
  readZoneList,
  resultsOriginHref,
  SEARCH_QUERY_NAMES,
  toggleZone,
} from "./search-query";

describe("los nombres de la dirección", () => {
  it("son los cortos del fundador (F12)", () => {
    expect(SEARCH_QUERY_NAMES.minPrice).toBe("min");
    expect(SEARCH_QUERY_NAMES.maxPrice).toBe("max");
    expect(SEARCH_QUERY_NAMES.minRooms).toBe("hab");
    expect(SEARCH_QUERY_NAMES.zone).toBe("zona");
    expect(SEARCH_QUERY_NAMES.page).toBe("pag");
  });

  /**
   * **tasks.md 18.7 — «nunca se filtra» es una lista cerrada, y esto es lo que
   * la cierra.**
   *
   * La referencia es el campo que reemplaza a Google Places, y la razón por la
   * que aquel servicio se rechazó no fue el costo sino que una dirección
   * formateada no es la taxonomía del producto: cuatro cosas ya construidas
   * dependen de que la zona sea una lista cerrada — el filtro, los conteos por
   * zona, la URL `/alquiler/<ciudad>/<zona>/…` y las páginas de zona. Un campo
   * de texto libre que se filtrara reintroduciría exactamente eso.
   *
   * **La afirmación es sobre el conjunto entero, no sobre la referencia.** Una
   * prueba que dijera «`SEARCH_QUERY_NAMES` no tiene `reference`» sólo cazaría
   * a quien eligiera ESE nombre; ésta cae con cualquier parámetro nuevo,
   * incluido uno llamado `cerca`. Y los quince nombres van escritos por valor
   * en vez de derivados de la constante: derivarlos afirmaría que la constante
   * es igual a sí misma.
   */
  it("son quince y ninguno más: un filtro nuevo tiene que pasar por acá", () => {
    expect(Object.values(SEARCH_QUERY_NAMES).sort()).toEqual(
      [
        "zona",
        "min",
        "max",
        "hab",
        "tipo",
        "pub",
        "planta",
        "agua",
        "amoblado",
        "vigilancia",
        "electro",
        "pag",
        "filtros",
        "busca",
        // El orden de la lista (14.47).
        "orden",
      ].sort(),
    );
  });

  /**
   * El otro extremo del mismo canal: **el parámetro que nadie declaró no llega
   * a ser un criterio.** Una seña escrita en la dirección —por curiosidad, por
   * un enlace armado a mano, o el día que alguien la agregue al formulario sin
   * agregarla acá— produce la misma búsqueda que no escribirla.
   */
  it("una seña colgada de la dirección no cambia la búsqueda", () => {
    const zonas = [{ id: "zona-altamira", cityId: "dc", slug: "altamira" }];
    const sinSena = buildSearchCriteria({ city: "dc", zone: "zona-altamira" }, zonas);
    const conSena = buildSearchCriteria(
      {
        city: "dc",
        zone: "zona-altamira",
        // Los tres nombres que alguien elegiría, y el crudo del formulario.
        referencia: "frente al Hospital Coromoto",
        ref: "frente al Hospital Coromoto",
        cerca: "frente al Hospital Coromoto",
        reference: "frente al Hospital Coromoto",
      } as Parameters<typeof buildSearchCriteria>[0],
      zonas,
    );

    expect(conSena).toEqual(sinSena);
    expect(JSON.stringify(conSena)).not.toContain("Coromoto");
  });

  it("nombra también lo que no filtra pero cambia la dirección", () => {
    // El paso abierto del acordeón y el texto del buscador de zonas. No
    // filtran nada, pero producen direcciones distintas para la misma página,
    // así que tienen que estar declarados para que la regla de indexación los
    // vea (`indexing-contract.test.ts`).
    expect(SEARCH_QUERY_NAMES.step).toBe("filtros");
    expect(SEARCH_QUERY_NAMES.zoneSearch).toBe("busca");
  });

  it("no nombra la ciudad, porque la ciudad la afirma la ruta", () => {
    expect(Object.values(SEARCH_QUERY_NAMES)).not.toContain("ciudad");
  });

  it("no repite un nombre, porque dos campos en un parámetro se pisan", () => {
    const names = Object.values(SEARCH_QUERY_NAMES);

    expect(new Set(names).size).toBe(names.length);
  });
});

describe("buildSearchHref", () => {
  it("escribe el parámetro que se pide y deja el resto como estaba", () => {
    const href = buildSearchHref("/alquiler/distrito-capital", { min: "250" }, { maxPrice: "700" });

    expect(href).toBe("/alquiler/distrito-capital?min=250&max=700");
  });

  it("un `null` quita el parámetro en vez de dejarlo vacío", () => {
    const href = buildSearchHref("/alquiler/dc", { min: "250", max: "700" }, { minPrice: null });

    expect(href).toBe("/alquiler/dc?max=700");
  });

  it("un vacío es lo mismo que ausente: es lo que deja un campo sin llenar", () => {
    const href = buildSearchHref("/alquiler/dc", { min: "250" }, { minPrice: "" });

    expect(href).toBe("/alquiler/dc");
  });

  it("conserva los parámetros que no entiende, como los `utm_` de un enlace compartido", () => {
    const href = buildSearchHref("/alquiler/dc", { utm_source: "whatsapp" }, { minRooms: "2" });

    expect(href).toContain("utm_source=whatsapp");
    expect(href).toContain("hab=2");
  });

  it("vuelve a la primera página al cambiar un filtro", () => {
    // Cambiar de filtro y quedarse en la página 7 es una pantalla vacía sin
    // causa visible: la búsqueda nueva puede tener dos páginas.
    const href = buildSearchHref("/alquiler/dc", { pag: "7", min: "250" }, { minRooms: "2" });

    expect(href).not.toContain("pag=");
  });

  it("cambiar de página no se toma por un cambio de filtro", () => {
    const href = buildSearchHref("/alquiler/dc", { min: "250" }, { page: "3" });

    expect(href).toBe("/alquiler/dc?min=250&pag=3");
  });

  it("abrir un paso del acordeón tampoco resetea la página", () => {
    const href = buildSearchHref("/alquiler/dc", { pag: "3" }, { step: "zona" });

    expect(href).toContain("pag=3");
    expect(href).toContain("filtros=zona");
  });

  it("buscar una zona tampoco resetea la página: no filtra resultados", () => {
    const href = buildSearchHref("/alquiler/dc", { pag: "3" }, { zoneSearch: "chacao" });

    expect(href).toContain("pag=3");
    expect(href).toContain("busca=chacao");
  });

  it("sin parámetros devuelve la ruta pelada, no una `?` colgando", () => {
    expect(buildSearchHref("/alquiler/dc", {}, {})).toBe("/alquiler/dc");
  });
});

describe("las zonas se combinan con O (F4)", () => {
  it("agrega la zona nueva a las que ya estaban", () => {
    expect(toggleZone(["chacao"], "altamira")).toEqual(["chacao", "altamira"]);
  });

  it("volver a tocarla la quita", () => {
    expect(toggleZone(["chacao", "altamira"], "chacao")).toEqual(["altamira"]);
  });

  it("nunca la repite", () => {
    expect(toggleZone(["chacao"], "chacao")).toEqual([]);
    expect(toggleZone([], "chacao")).toEqual(["chacao"]);
  });

  it("no reemplaza la anterior: elegir una segunda zona deja las dos", () => {
    // El de la mutación: si esto fuera selección única, la lista tendría uno.
    expect(toggleZone(["chacao"], "altamira")).toHaveLength(2);
  });

  it("lee la lista de la dirección sin vacíos ni repetidas", () => {
    expect(readZoneList("chacao, altamira ,,chacao")).toEqual(["chacao", "altamira"]);
    expect(readZoneList(undefined)).toEqual([]);
  });
});

describe("«Limpiar todo» conserva la ciudad (F8)", () => {
  it("vuelve a la ruta de la ciudad y suelta todos los filtros", () => {
    const href = clearAllHref("/alquiler/distrito-capital", {
      zona: "altamira",
      min: "250",
      max: "700",
      hab: "2",
      pub: "owner",
      planta: "1",
      pag: "3",
    });

    expect(href).toBe("/alquiler/distrito-capital");
  });

  it("la ciudad sobrevive: es el contexto de la búsqueda, no un filtro", () => {
    // El de la mutación: si «Limpiar todo» borrara también la ciudad, esta
    // dirección sería `/alquiler` o `/`, y la búsqueda perdería su alcance.
    expect(clearAllHref("/alquiler/maracaibo", { min: "250" })).toContain("/alquiler/maracaibo");
  });

  it("suelta la zona de la RUTA, porque la zona es un filtro y la ciudad no", () => {
    const href = clearAllHref("/alquiler/distrito-capital", { zona: "chacao" });

    expect(href).not.toContain("chacao");
  });

  it("deja el acordeón donde estaba: limpiar no es cerrar", () => {
    expect(clearAllHref("/alquiler/dc", { min: "250", filtros: "precio" })).toBe(
      "/alquiler/dc?filtros=precio",
    );
  });

  it("no se lleva por delante los parámetros ajenos", () => {
    expect(clearAllHref("/alquiler/dc", { min: "250", utm_source: "whatsapp" })).toContain(
      "utm_source=whatsapp",
    );
  });
});

/**
 * **`planCityChange` y sus siete casos se borraron con la 14.50, y esto dice
 * qué se fue y qué queda vivo.**
 *
 * Implementaba la 20.6 —«cambiar de ciudad borra las zonas elegidas, y se avisa
 * ANTES» (F3)— y su único llamador de producción era `toCityChoice`, que armaba
 * `model.cities`: el paso de ciudad del panel. La 14.36 sacó ese paso por
 * decisión del fundador, así que desde entonces el aviso no tenía dónde salir y
 * la función se ejecutaba en cada carga sin llegar a ninguna pantalla.
 *
 * **La regla NO se perdió, y ése es el punto de borrar el aviso y no la
 * garantía.** El único selector de ciudad que el producto sirve son las fichas
 * del inicio, y ahí la zona se cae *por construcción*: `homeCityChips` compone
 * la dirección desde cero (`/?ciudad=…`) en vez de encima de la que había, y su
 * propia prueba lo afirma. Del lado del criterio la sigue aplicando
 * `buildSearchCriteria`, que descarta la zona que no pertenece a la ciudad.
 * **Lo que sí queda sin superficie es el aviso previo**, y la 20.6 quedó
 * anotada por eso en `tasks.md` en vez de darse por entregada en silencio.
 */

/**
 * **La dirección de esta pantalla de resultados, tal como viaja en el enlace a
 * un aviso** (tarea 16.9).
 *
 * La pregunta que estas pruebas hacen no es «¿hay una vuelta?» —eso ya lo
 * decidía `return-to-results.ts`— sino **qué viaja con ella**. Una vuelta que
 * aterriza en la zona pelada, sin el precio ni las habitaciones, cumple la
 * letra de «← Resultados» y le devuelve a quien había estrechado 70 avisos a 9
 * los 70 otra vez.
 */
describe("resultsOriginHref", () => {
  it("se lleva los filtros puestos, no sólo la ruta", () => {
    expect(
      resultsOriginHref("/alquiler/distrito-capital/chacao", {
        min: "200",
        max: "400",
        hab: "2",
        amoblado: "1",
      }),
    ).toBe("/alquiler/distrito-capital/chacao?min=200&max=400&hab=2&amoblado=1");
  });

  /**
   * **La página también.** Quien estaba en la 3 de 13 y abre un aviso vuelve a
   * la 3: aterrizar en la 1 es perder el lugar aunque los filtros estén.
   */
  it("se lleva la página, que es dónde estaba parado", () => {
    expect(resultsOriginHref("/alquiler/maracaibo", { min: "200", pag: "3" })).toBe(
      "/alquiler/maracaibo?min=200&pag=3",
    );
  });

  /**
   * **El panel abierto NO es parte de la búsqueda.** `filtros` dice qué grupo
   * del acordeón está desplegado y `busca` es el texto que achica la lista de
   * zonas ofrecidas — ninguno de los dos recorta un solo aviso. Arrastrarlos
   * hace que «← Resultados» devuelva a la pantalla con el modal encima: quien
   * pidió sus resultados recibe el panel de filtros.
   */
  it("no se lleva el estado del panel, que no filtra nada", () => {
    const href = resultsOriginHref("/alquiler/distrito-capital", {
      min: "200",
      filtros: "precio",
      busca: "chac",
      pag: "2",
    });

    expect(href).toBe("/alquiler/distrito-capital?min=200&pag=2");
  });

  it("sin nada puesto es la ruta sola, sin un «?» colgando", () => {
    expect(resultsOriginHref("/alquiler/maracaibo/tierra-negra", {})).toBe(
      "/alquiler/maracaibo/tierra-negra",
    );
  });

  /**
   * **La invariante que ata este archivo con el lector de la ficha**: todo lo
   * que esta función escribe, `safeResultsOrigin` lo acepta y lo devuelve
   * igual. Un origen que el lector fuera a rechazar sería un parámetro que
   * viaja por las veinticuatro tarjetas de la cuadrícula para terminar
   * descartado en silencio, y la ficha caería en el respaldo sin que nadie vea
   * un error.
   */
  it("lo que escribe, la ficha lo acepta", () => {
    const origen = resultsOriginHref("/alquiler/distrito-capital/chacao", {
      min: "200",
      hab: "2",
      pag: "2",
    });

    expect(safeResultsOrigin(origen)).toBe(origen);
  });
});
