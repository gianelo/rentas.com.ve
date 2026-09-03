import { describe, expect, it } from "vitest";
import { buildOrderMenu, readSearchOrder, SEARCH_ORDER_TOKENS } from "./search-order";

const BASE = "/alquiler/distrito-capital/chacao";

describe("qué orden pide una dirección (14.47)", () => {
  it("sin `orden` es «Recientes», que ahora es la decisión y no la inercia", () => {
    expect(readSearchOrder(undefined)).toBe("recent");
    expect(readSearchOrder("")).toBe("recent");
  });

  it("lee los dos órdenes de precio", () => {
    expect(readSearchOrder(SEARCH_ORDER_TOKENS.priceAsc)).toBe("priceAsc");
    expect(readSearchOrder(SEARCH_ORDER_TOKENS.priceDesc)).toBe("priceDesc");
  });

  it("un valor que no existe cae a «Recientes» en vez de vaciar la lista", () => {
    // Un enlace viejo de un WhatsApp con un orden que ya no se ofrece —
    // `superficie` es el que el fundador descartó — tiene que devolver la
    // lista, no una pantalla sin causa visible.
    expect(readSearchOrder("superficie")).toBe("recent");
    // `Object.hasOwn` y no `in`: `in` encuentra el prototipo.
    expect(readSearchOrder("constructor")).toBe("recent");
  });

  it("«Recientes» no tiene token: su forma en la dirección es la ausencia", () => {
    expect(SEARCH_ORDER_TOKENS.recent).toBeNull();
  });
});

describe("el menú de orden (14.47)", () => {
  it("ofrece tres opciones y ni una más", () => {
    // Superficie NO está, y la razón es del dato: `area_m2` puede faltar, y
    // ordenar por un campo ausente ordena mal y en silencio.
    expect(buildOrderMenu(BASE, {}).options.map((option) => option.label)).toEqual([
      "Recientes",
      "Precio: menor a mayor",
      "Precio: mayor a menor",
    ]);
  });

  it("«Recientes» NO escribe `?orden=`, o el catálogo se publica dos veces", () => {
    // **La trampa de la 14.47.** `orden` entra en `FILTER_KEYS`, así que
    // cualquier dirección que lo lleve sale del índice. Si la opción por
    // defecto emitiera `?orden=recientes`, la única dirección indexable de la
    // zona sería la que nadie enlaza desde la pantalla.
    const [recientes] = buildOrderMenu(BASE, { min: "300" }).options;

    expect(recientes?.href).toBe(`${BASE}?min=300`);
    expect(recientes?.href).not.toContain("orden");
  });

  it("elegir un orden vuelve a la primera página", () => {
    // La página 3 de «Recientes» y la 3 de «Precio» no son la misma gente
    // mirando lo mismo: quedarse ahí es una rebanada que nadie pidió.
    const menu = buildOrderMenu(BASE, { pag: "3" });

    expect(menu.options[1]?.href).toBe(`${BASE}?orden=precio-asc`);
    expect(menu.options[0]?.href).toBe(BASE);
  });

  it("el orden elegido se dice, y es el que la etiqueta muestra", () => {
    const menu = buildOrderMenu(BASE, { orden: "precio-desc" });

    expect(menu.order).toBe("priceDesc");
    expect(menu.label).toBe("Precio: mayor a menor");
    expect(menu.options.map((option) => option.current)).toEqual([false, false, true]);
  });

  it("con la dirección pelada el elegido es «Recientes»", () => {
    const menu = buildOrderMenu(BASE, {});

    expect(menu.order).toBe("recent");
    expect(menu.label).toBe("Recientes");
    expect(menu.options.map((option) => option.current)).toEqual([true, false, false]);
  });

  it("los demás parámetros sobreviven al cambio de orden", () => {
    // El orden no filtra: cambiarlo no puede soltar la búsqueda que alguien
    // acababa de estrechar.
    const menu = buildOrderMenu(BASE, { min: "300", planta: "1", utm_source: "wa" });

    expect(menu.options[2]?.href).toBe(`${BASE}?min=300&planta=1&utm_source=wa&orden=precio-desc`);
  });
});
