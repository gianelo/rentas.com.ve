import { describe, expect, it } from "vitest";
import { chooseRelief, confirmCountLabel, resolveSearchConfirm } from "./search-confirm";

const RESULTS = "/alquiler/distrito-capital?zona=chacao";

describe("el botón dice cuántos resultados va a devolver (F7)", () => {
  it("lleva el número adentro, en cada paso", () => {
    // La secuencia de la lámina: 47 → 21 → 16 → 9.
    for (const [total, label] of [
      [47, "Ver 47 avisos"],
      [21, "Ver 21 avisos"],
      [16, "Ver 16 avisos"],
      [9, "Ver 9 avisos"],
    ] as const) {
      expect(resolveSearchConfirm({ total, resultsHref: RESULTS }).label).toBe(label);
    }
  });

  it("nunca dice «Aplicar» ni «Buscar» a secas", () => {
    for (const total of [0, 1, 2, 47]) {
      const label = resolveSearchConfirm({
        total,
        resultsHref: RESULTS,
        onlyListingHref: "/alquiler/distrito-capital/chacao/apto-84512",
      }).label;

      expect(label).not.toBe("Aplicar");
      expect(label).not.toBe("Buscar");
      expect(label).not.toBe("Filtrar");
    }
  });

  it("con un solo resultado va directo a la ficha", () => {
    const confirm = resolveSearchConfirm({
      total: 1,
      resultsHref: RESULTS,
      onlyListingHref: "/alquiler/distrito-capital/chacao/apto-84512",
    });

    expect(confirm.kind).toBe("listing");
    expect(confirm.kind === "listing" && confirm.href).toBe(
      "/alquiler/distrito-capital/chacao/apto-84512",
    );
  });

  it("con un solo resultado y sin su dirección, cae a la lista en vez de romperse", () => {
    const confirm = resolveSearchConfirm({ total: 1, resultsHref: RESULTS });

    expect(confirm.kind).toBe("results");
    expect(confirm.label).toBe("Ver 1 aviso");
  });

  it("con dos o más lleva a la lista", () => {
    const confirm = resolveSearchConfirm({
      total: 2,
      resultsHref: RESULTS,
      onlyListingHref: "/alquiler/distrito-capital/chacao/apto-84512",
    });

    expect(confirm.kind).toBe("results");
    expect(confirm.kind === "results" && confirm.href).toBe(RESULTS);
  });
});

describe("con cero resultados el botón no se apaga (F7)", () => {
  it("dice que ninguno coincide, en vez de quedarse mudo", () => {
    const confirm = resolveSearchConfirm({ total: 0, resultsHref: RESULTS });

    expect(confirm.kind).toBe("empty");
    expect(confirm.label).toBe("Ningún aviso coincide");
  });

  it("ofrece soltar el filtro que más resultados devuelve", () => {
    const confirm = resolveSearchConfirm({
      total: 0,
      resultsHref: RESULTS,
      relief: chooseRelief([
        { filter: "price", resultCount: 14, href: "/p" },
        { filter: "rooms", resultCount: 3, href: "/r" },
        { filter: "hasPowerPlant", resultCount: 6, href: "/p" },
      ]),
    });

    expect(confirm.kind).toBe("empty");
    const relief = confirm.kind === "empty" ? confirm.relief : null;

    expect(relief?.resultCount).toBe(14);
    expect(relief?.label).toBe("Quitar el precio y ver 14");
    // Y la salida es una DIRECCIÓN: sin ella el ofrecimiento es una frase
    // amable que no lleva a ninguna parte, contra la regla transversal 5.
    expect(relief?.href).toBe("/p");
  });

  it("nunca queda deshabilitado, ni sin salida que ofrecer", () => {
    // Regla transversal 5: ninguna pantalla termina sin salida. Sin alivio
    // posible el botón sigue diciendo lo que pasa.
    const confirm = resolveSearchConfirm({ total: 0, resultsHref: RESULTS, relief: null });

    expect(confirm.kind).toBe("empty");
    expect(confirm.label).not.toBe("");
  });
});

describe("cuál es el filtro más restrictivo", () => {
  it("es el que más resultados devuelve al soltarlo", () => {
    const relief = chooseRelief([
      { filter: "zone", resultCount: 4, href: "/z" },
      { filter: "price", resultCount: 14, href: "/p" },
      { filter: "rooms", resultCount: 9, href: "/r" },
    ]);

    expect(relief?.filter).toBe("price");
  });

  it("no ofrece soltar un filtro que tampoco devuelve nada", () => {
    expect(chooseRelief([{ filter: "price", resultCount: 0, href: "/p" }])).toBeNull();
    expect(chooseRelief([])).toBeNull();
  });

  it("empatados, suelta el más periférico y deja el lugar en paz", () => {
    // Zona y precio devuelven lo mismo: se suelta el precio, porque la zona
    // es la más cercana a lo que la persona vino a buscar.
    const relief = chooseRelief([
      { filter: "zone", resultCount: 6, href: "/z" },
      { filter: "price", resultCount: 6, href: "/p" },
    ]);

    expect(relief?.filter).toBe("price");
  });

  it("cada filtro tiene su nombre en la oferta, con su número real", () => {
    expect(chooseRelief([{ filter: "zone", resultCount: 30, href: "/z" }])?.label).toBe(
      "Quitar las zonas y ver 30",
    );
    expect(chooseRelief([{ filter: "rooms", resultCount: 21, href: "/r" }])?.label).toBe(
      "Quitar las habitaciones y ver 21",
    );
    expect(chooseRelief([{ filter: "publisherType", resultCount: 12, href: "/pub" }])?.label).toBe(
      "Quitar quién publica y ver 12",
    );
    expect(
      chooseRelief([{ filter: "hasPowerPlant", resultCount: 5, href: "/planta" }])?.label,
    ).toBe("Quitar planta eléctrica y ver 5");
  });

  it("sirve también con resultados, para el cierre de la lista (F10)", () => {
    // F10 pide UN solo cambio propuesto con su número al final de la lista, y
    // es exactamente la misma pregunta que la del vacío.
    expect(
      chooseRelief([{ filter: "price", resultCount: 14, href: "/alquiler/dc" }])?.resultCount,
    ).toBe(14);
  });
});

describe("la etiqueta del conteo se escribe una sola vez (14.34)", () => {
  // El conteo en vivo tiene que decir lo MISMO que dirá el servidor cuando
  // conteste. Dos formateos separados —uno acá y otro para la vista previa—
  // son dos que se separan: bastaría con que uno dijera «Ver 9 avisos» y el
  // otro «9 avisos» para que el número parpadeara al llegar la respuesta.
  it("es la misma función que usa el botón del servidor", () => {
    expect(confirmCountLabel(9)).toBe("Ver 9 avisos");
    expect(resolveSearchConfirm({ total: 9, resultsHref: RESULTS })).toMatchObject({
      label: confirmCountLabel(9),
    });
  });

  it("singulariza en uno, porque «Ver 1 avisos» se lee como un error", () => {
    expect(confirmCountLabel(1)).toBe("Ver 1 aviso");
  });

  it("en cero dice qué pasó, y no «Ver 0 avisos»", () => {
    // El mismo texto que `resolveSearchConfirm` ya escribe para el vacío: un
    // botón que dice «Ver 0 avisos» invita a tocar algo que no lleva a nada.
    expect(confirmCountLabel(0)).toBe("Ningún aviso coincide");
    expect(confirmCountLabel(-3)).toBe("Ningún aviso coincide");
    expect(resolveSearchConfirm({ total: 0, resultsHref: RESULTS })).toMatchObject({
      label: confirmCountLabel(0),
    });
  });
});
