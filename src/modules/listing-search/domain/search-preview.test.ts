import { describe, expect, it } from "vitest";
import { type PreviewCounts, previewConfirmLabel } from "./search-preview";

/**
 * Los números son los de una búsqueda real: 16 avisos con dos filtros puestos.
 * Cada faceta ya viene contada **sin su propio filtro y respetando todos los
 * demás** (`drizzle-faceted-search.ts`), que es exactamente lo que la convierte
 * en «cuántos quedarían si tocaras esto».
 */
const COUNTS: PreviewCounts = {
  byMinRooms: { 1: 16, 2: 9, 3: 4, 4: 0 },
  byMinBathrooms: { 1: 16, 2: 7, 3: 0 },
  byAttribute: {
    hasPowerPlant: 9,
    hasRegularWater: 12,
    isFurnished: 4,
    hasSecurity: 0,
    hasAppliances: 3,
  },
  byPublisherType: { owner: 11, broker: 5 },
  withoutFilter: {
    zone: 40,
    price: 22,
    rooms: 31,
    bathrooms: 31,
    publisherType: 25,
    hasPowerPlant: 18,
    hasRegularWater: 19,
    isFurnished: 20,
    hasSecurity: 21,
    hasAppliances: 23,
  },
  cityTotal: 70,
};

describe("el botón sabe el número antes de que el servidor conteste (14.34)", () => {
  it("elegir un escalón de habitaciones vale su propia faceta", () => {
    // La faceta de habitaciones ignora `minRooms` y respeta el resto, así que
    // el 9 de «2» ES el total resultante, no una estimación.
    expect(previewConfirmLabel(COUNTS, { kind: "rooms", step: 2 })).toBe("Ver 9 avisos");
    expect(previewConfirmLabel(COUNTS, { kind: "rooms", step: 3 })).toBe("Ver 4 avisos");
  });

  it("soltar el escalón elegido vale el número de su relajación", () => {
    // Volver a tocar el elegido lo suelta (`nextValue: null`), y ese número ya
    // viaja en la misma consulta: es la salida del vacío, preguntada al revés.
    expect(previewConfirmLabel(COUNTS, { kind: "rooms", step: null })).toBe("Ver 31 avisos");
  });

  it("marcar un atributo vale su faceta, y desmarcarlo su relajación", () => {
    expect(
      previewConfirmLabel(COUNTS, { kind: "attribute", attribute: "isFurnished", add: true }),
    ).toBe("Ver 4 avisos");
    expect(
      previewConfirmLabel(COUNTS, { kind: "attribute", attribute: "isFurnished", add: false }),
    ).toBe("Ver 20 avisos");
  });

  it("quién publica, en los dos sentidos", () => {
    expect(previewConfirmLabel(COUNTS, { kind: "publisher", value: "owner" })).toBe(
      "Ver 11 avisos",
    );
    expect(previewConfirmLabel(COUNTS, { kind: "publisher", value: null })).toBe("Ver 25 avisos");
  });

  it("«Limpiar todo» vuelve al total de la ciudad, que no es un filtro", () => {
    // F8: se resetea todo MENOS la ciudad — "la ciudad no es un filtro, es el
    // contexto". `cityTotal` es literalmente ese número.
    expect(previewConfirmLabel(COUNTS, { kind: "clearAll" })).toBe("Ver 70 avisos");
  });

  it("en cero dice qué pasó, con las mismas palabras que el servidor", () => {
    // `hasSecurity` cuenta 0: marcarlo deja la búsqueda vacía, y el botón tiene
    // que decirlo antes de que alguien lo toque, no después.
    expect(
      previewConfirmLabel(COUNTS, { kind: "attribute", attribute: "hasSecurity", add: true }),
    ).toBe("Ningún aviso coincide");
    expect(previewConfirmLabel(COUNTS, { kind: "rooms", step: 4 })).toBe("Ningún aviso coincide");
  });

  it("singulariza, porque el uno es el caso que más se lee", () => {
    const one: PreviewCounts = { ...COUNTS, byMinRooms: { ...COUNTS.byMinRooms, 3: 1 } };
    expect(previewConfirmLabel(one, { kind: "rooms", step: 3 })).toBe("Ver 1 aviso");
  });

  it("un número que la página no mandó NO se inventa: contesta null", () => {
    // Falla cerrado (AGENTS.md §7). Sin el conteo, el botón se queda con lo que
    // el servidor ya había escrito hasta que llegue la respuesta — que es la
    // verdad vieja, no una nueva inventada. Un `0` acá sería un botón diciendo
    // «Ningún aviso coincide» sobre una búsqueda que tiene setenta.
    const hueco = { ...COUNTS, byMinRooms: {} } as unknown as PreviewCounts;
    expect(previewConfirmLabel(hueco, { kind: "rooms", step: 2 })).toBeNull();

    const sinCiudad = { ...COUNTS, cityTotal: Number.NaN };
    expect(previewConfirmLabel(sinCiudad, { kind: "clearAll" })).toBeNull();
  });
});
