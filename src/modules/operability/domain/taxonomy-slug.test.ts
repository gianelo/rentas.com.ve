import { describe, expect, it } from "vitest";
import { slugify } from "../../listing-discovery/domain/listing-url";
import { describeSlugGaps, findSlugGaps, type SlugCensusRow } from "./taxonomy-slug";

function row(overrides: Partial<SlugCensusRow> = {}): SlugCensusRow {
  return { id: "z1", name: "Chacao", slug: "chacao", ...overrides };
}

describe("los huecos de slug de la taxonomía", () => {
  it("no reporta nada cuando el slug coincide con slugify(name)", () => {
    expect(findSlugGaps("zone", [row()], slugify)).toStrictEqual([]);
  });

  it("reporta la fila cuyo slug es NULL", () => {
    const gaps = findSlugGaps("zone", [row({ slug: null })], slugify);
    expect(gaps).toStrictEqual([{ subject: "zone", id: "z1", name: "Chacao", slug: null }]);
  });

  it("reporta la fila cuyo slug es la cadena vacía", () => {
    const gaps = findSlugGaps("zone", [row({ slug: "" })], slugify);
    expect(gaps).toStrictEqual([{ subject: "zone", id: "z1", name: "Chacao", slug: "" }]);
  });

  it("reporta la fila cuyo slug NO coincide con lo que slugify(name) produciría hoy", () => {
    // El caso real: un nombre editado después de sembrarse una vez, o una
    // fila escrita por un camino que todavía no llama a `slugify`.
    const gaps = findSlugGaps("zone", [row({ slug: "chacao-viejo" })], slugify);
    expect(gaps).toStrictEqual([
      { subject: "zone", id: "z1", name: "Chacao", slug: "chacao-viejo" },
    ]);
  });

  it("etiqueta el sujeto que se le pasó, ciudad o zona", () => {
    expect(findSlugGaps("city", [row({ slug: null })], slugify)).toStrictEqual([
      { subject: "city", id: "z1", name: "Chacao", slug: null },
    ]);
  });
});

describe("describeSlugGaps", () => {
  it("nombra la fila y su id, para que el defecto se pueda ubicar sin adivinar", () => {
    const message = describeSlugGaps([{ subject: "zone", id: "z1", name: "Chacao", slug: null }]);
    expect(message).toContain("z1");
    expect(message).toContain("Chacao");
  });
});
