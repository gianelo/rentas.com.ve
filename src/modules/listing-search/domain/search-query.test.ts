import { describe, expect, it } from "vitest";
import {
  buildSearchHref,
  clearAllHref,
  planCityChange,
  readZoneList,
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

describe("cambiar de ciudad borra las zonas elegidas (F3)", () => {
  const query = { zona: "chacao,altamira", min: "250", hab: "2" };

  it("la dirección nueva no lleva ninguna zona", () => {
    const plan = planCityChange({ path: "/alquiler/maracaibo", name: "Maracaibo" }, query, [
      "Chacao",
      "Altamira",
    ]);

    expect(plan.href).not.toContain("zona=");
    expect(plan.href).not.toContain("chacao");
  });

  it("los demás filtros sobreviven: sólo la zona depende de la ciudad", () => {
    const plan = planCityChange({ path: "/alquiler/maracaibo", name: "Maracaibo" }, query, [
      "Chacao",
    ]);

    expect(plan.href).toContain("min=250");
    expect(plan.href).toContain("hab=2");
  });

  it("avisa ANTES, y dice cuáles se pierden", () => {
    const plan = planCityChange({ path: "/alquiler/maracaibo", name: "Maracaibo" }, query, [
      "Chacao",
      "Altamira",
    ]);

    expect(plan.droppedZones).toEqual(["Chacao", "Altamira"]);
    expect(plan.warning).toContain("Chacao");
    expect(plan.warning).toContain("Altamira");
    expect(plan.warning).toContain("Maracaibo");
  });

  it("con una sola zona el aviso está en singular", () => {
    const plan = planCityChange({ path: "/alquiler/maracaibo", name: "Maracaibo" }, query, [
      "Chacao",
    ]);

    expect(plan.warning).toContain("la zona");
    expect(plan.warning).not.toContain("las 1");
  });

  it("sin zonas elegidas no hay nada que avisar", () => {
    const plan = planCityChange({ path: "/alquiler/maracaibo", name: "Maracaibo" }, {}, []);

    expect(plan.warning).toBeNull();
    expect(plan.droppedZones).toEqual([]);
  });

  it("acepta un cambio de más, y la zona se cae igual", () => {
    // El acordeón pasa al paso siguiente al elegir ciudad. Que el `zone: null`
    // no sea negociable desde afuera es el punto: es la regla, no un argumento.
    const plan = planCityChange({ path: "/alquiler/maracaibo", name: "Maracaibo" }, query, [], {
      step: "zona",
      zone: "chacao",
    });

    expect(plan.href).toContain("filtros=zona");
    expect(plan.href).not.toContain("zona=chacao");
  });

  it("vuelve a la primera página: la ciudad nueva tiene otras", () => {
    const plan = planCityChange(
      { path: "/alquiler/maracaibo", name: "Maracaibo" },
      { pag: "4" },
      [],
    );

    expect(plan.href).not.toContain("pag=");
  });
});
