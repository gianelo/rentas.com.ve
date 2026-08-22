import { describe, expect, it } from "vitest";
import { parseTerritoryDocument } from "./territorio-parser";

/**
 * Fixtures are verbatim shapes taken from `docs/territorio/`, not invented
 * ones. Every awkward case below appears in the real files: a colon after the
 * category prefix, a prose `##` heading beside a real municipality, metadata
 * bullets that look like entries, and a variants line indented under one.
 */
const DOC = `# Estado Bolivariano de Miranda

> **Cómo leer este archivo**
>
> - La categoría nunca se dedujo.

## Municipio Baruta

- **Capital:** Nuestra Señora del Rosario de Baruta
- **Código UBIGEO del municipio (INE):** \`150301\`

### Parroquia El Cafetal

- **Código UBIGEO (INE):** \`150302\`
- **Elementos registrados:** 4

#### Sectores (3)

- Sector: Prado del Este  \`[OSM]\`
  *Variantes registradas en las fuentes:* «Sector: Piedra Azul»
- Sector Prados del Este  \`[CP 1080 — IPOSTEL]\`
- Sector Santa Gertrudis  \`[CP 1080 — IPOSTEL + OSM]\`

#### Urbanizaciones (1)

- Urbanización Los Naranjos  \`[IPOSTEL]\`

## Discrepancias entre el INE e IPOSTEL

Texto en prosa que no es un municipio.

- **Maracaibo** es un municipio, no el estado.
`;

describe("parseTerritoryDocument", () => {
  it("reads the municipality, its parishes and their elements", () => {
    const [municipality, ...rest] = parseTerritoryDocument(DOC);

    expect(rest).toEqual([]);
    expect(municipality?.name).toBe("Baruta");
    expect(municipality?.ubigeo).toBe("150301");
    expect(municipality?.parishes).toHaveLength(1);
    expect(municipality?.parishes[0]?.name).toBe("El Cafetal");
    expect(municipality?.parishes[0]?.ubigeo).toBe("150302");
  });

  /**
   * **The load-bearing rule, and the source states it itself:** "La categoría
   * nunca se dedujo. Un nombre sin prefijo declarado por la fuente va a
   * *Otros*." The heading is the category. A parser that read the prefix off
   * the name would quietly reclassify entries the source deliberately left
   * where they were — and nobody would notice, because the result still looks
   * like a taxonomy.
   */
  it("takes the category from the heading, never from the name", () => {
    const elements = parseTerritoryDocument(DOC)[0]?.parishes[0]?.elements ?? [];

    // Cuatro elementos en una parroquia, bajo dos encabezados. La categoría de
    // cada uno es la de SU encabezado, no la del primero ni la del prefijo.
    expect(elements.map((e) => e.category)).toEqual(["sector", "sector", "sector", "urbanizacion"]);
    expect(elements.map((e) => e.name)).toEqual([
      "Sector: Prado del Este",
      "Sector Prados del Este",
      "Sector Santa Gertrudis",
      "Urbanización Los Naranjos",
    ]);
  });

  it("keeps the name exactly as written, colon and all", () => {
    // `Sector: Prado del Este` and `Sector Prados del Este` are two different
    // places in the source. Normalising the separator would merge nothing but
    // would make the two look like a typo of each other to whoever reads next.
    const names = parseTerritoryDocument(DOC)[0]?.parishes[0]?.elements.map((e) => e.name);

    expect(names).toContain("Sector: Prado del Este");
    expect(names).toContain("Sector Prados del Este");
  });

  it("reads the postal code and the provenance, in all their shapes", () => {
    const elements = parseTerritoryDocument(DOC)[0]?.parishes[0]?.elements ?? [];

    expect(elements[0]).toMatchObject({ postalCode: null, source: "OSM" });
    expect(elements[1]).toMatchObject({ postalCode: "1080", source: "IPOSTEL" });
    expect(elements[2]).toMatchObject({ postalCode: "1080", source: "IPOSTEL+OSM" });
  });

  /**
   * A `##` heading is a municipality only when it says so. The real files use
   * the same level for prose sections — "Discrepancias entre el INE e IPOSTEL",
   * "«Caracas ciudad» frente a «Distrito Capital entidad»" — and a parser that
   * took every `##` would invent municipalities out of essay titles.
   */
  it("refuses a prose heading as a municipality", () => {
    expect(parseTerritoryDocument(DOC).map((m) => m.name)).toEqual(["Baruta"]);
  });

  /**
   * Three shapes that start with `- ` and are not places: metadata bullets
   * (`- **Capital:** …`), prose bullets, and the indented variants line. The
   * discriminator is the provenance marker, which every real entry carries and
   * none of these do.
   */
  it("ignores every bullet that carries no provenance marker", () => {
    const all = parseTerritoryDocument(DOC).flatMap((m) =>
      m.parishes.flatMap((p) => p.elements.map((e) => e.name)),
    );

    expect(all).toHaveLength(4);
    expect(all.join(" ")).not.toContain("Capital");
    expect(all.join(" ")).not.toContain("Variantes");
    expect(all.join(" ")).not.toContain("Maracaibo");
  });

  it("does not merge duplicates or near-duplicates", () => {
    // The source says so out loud: "No se fusionaron duplicados. «Los Pinos»,
    // «Los Pinos I» y «Los Pinos II» son entradas distintas."
    const doc = `## Municipio X

### Parroquia Y

#### Barrios (3)

- Barrio Los Pinos  \`[OSM]\`
- Barrio Los Pinos I  \`[OSM]\`
- Barrio Los Pinos II  \`[OSM]\`
`;
    const elements = parseTerritoryDocument(doc)[0]?.parishes[0]?.elements ?? [];

    expect(elements).toHaveLength(3);
  });

  it("maps every category heading the corpus actually uses", () => {
    const doc = `## Municipio X

### Parroquia Y

#### Barrios (1)
- A  \`[OSM]\`
#### Sectores (1)
- B  \`[OSM]\`
#### Urbanizaciones (1)
- C  \`[OSM]\`
#### Conjuntos residenciales (1)
- D  \`[OSM]\`
#### Parcelamientos (1)
- E  \`[OSM]\`
#### Caseríos (1)
- F  \`[OSM]\`
#### Comunidades (1)
- G  \`[OSM]\`
#### Localidades (1)
- H  \`[OSM]\`
#### Edificaciones identificadas individualmente (1)
- I  \`[OSM]\`
#### Otros (1)
- J  \`[OSM]\`
`;
    const elements = parseTerritoryDocument(doc)[0]?.parishes[0]?.elements ?? [];

    expect(elements.map((e) => e.category)).toEqual([
      "barrio",
      "sector",
      "urbanizacion",
      "conjunto",
      "parcelamiento",
      "caserio",
      "comunidad",
      "localidad",
      "edificacion",
      "otro",
    ]);
  });

  /**
   * **Encontrado corriendo el parser contra el corpus real, no con este test.**
   * Los cuatro archivos de Zulia declaran su municipio con `#` en el título del
   * archivo — `# Municipio Maracaibo — Estado Zulia` — mientras que
   * `miranda.md` usa `## Municipio Baruta` porque lleva cuatro municipios en un
   * solo archivo. Un archivo por municipio no necesita el segundo nivel.
   *
   * Los tests unitarios pasaban los nueve con el formato de dos almohadillas.
   * Sin correrlo contra los 11.000 renglones, esto se descubría en producción
   * con 1.743 lugares faltando y nadie sabiendo por qué.
   */
  it("acepta el municipio declarado como titulo de archivo, con su sufijo de estado", () => {
    const doc = `# Municipio Maracaibo — Estado Zulia

- **Código UBIGEO del municipio (INE):** \`231300\`

### Parroquia Antonio Borjas Romero

- **Código UBIGEO (INE):** \`231301\`

#### Barrios (1)

- Barrio 15 de Marzo  \`[CP 4005 — IPOSTEL]\`
`;
    const [municipality] = parseTerritoryDocument(doc);

    expect(municipality?.name).toBe("Maracaibo");
    expect(municipality?.ubigeo).toBe("231300");
    expect(municipality?.parishes[0]?.elements[0]?.name).toBe("Barrio 15 de Marzo");
  });

  it("returns nothing for a document with no municipality", () => {
    expect(parseTerritoryDocument("# Solo un titulo\n\nTexto.\n")).toEqual([]);
  });
});
