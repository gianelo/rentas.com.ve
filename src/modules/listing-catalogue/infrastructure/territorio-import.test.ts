import { describe, expect, it } from "vitest";
import { slugify } from "../../listing-discovery/domain/listing-url";
import { buildTerritoryRows } from "./territorio-import";
import type { ParsedMunicipality } from "./territorio-parser";

/**
 * **La columna `slug` se llena con la MISMA `slugify` que el dominio ya usa
 * en `resolveZoneRoute` y `buildListingPath`** (tasks.md 27.1, slice A). Una
 * copia reescrita acá sería exactamente la duplicación que AGENTS.md §1 y el
 * precedente de la 22.31 rechazan, así que la prueba importa la función real
 * en vez de repetir su regla con literales de nombre-a-slug.
 */
const MUNICIPALITIES: readonly ParsedMunicipality[] = [
  {
    name: "Chacao",
    ubigeo: "130101",
    parishes: [
      {
        name: "Chacao",
        ubigeo: "130101",
        elements: [
          {
            name: "Sección Los Palos Grandes",
            category: "sector",
            postalCode: "1060",
            source: "IPOSTEL",
          },
        ],
      },
    ],
  },
];

describe("buildTerritoryRows", () => {
  it("deriva el slug del área con la slugify del dominio", () => {
    const { areas } = buildTerritoryRows(MUNICIPALITIES);

    const caracas = areas.find((area) => area.name === "Caracas");
    expect(caracas?.slug).toBe(slugify("Caracas"));
  });

  it("deriva el slug de cada zona —municipio, parroquia y elemento— con la misma función", () => {
    const { zones } = buildTerritoryRows(MUNICIPALITIES);

    const municipio = zones.find((zone) => zone.kind === "municipio");
    const parroquia = zones.find((zone) => zone.kind === "parroquia");
    const elemento = zones.find((zone) => zone.kind === "elemento");

    expect(municipio?.slug).toBe(slugify("Chacao"));
    expect(parroquia?.slug).toBe(slugify("Chacao"));
    expect(elemento?.slug).toBe(slugify("Sección Los Palos Grandes"));
    // Verificado explícitamente contra el valor esperado, no sólo contra la
    // función que también escribe el código de producción: si las dos
    // llamaran a la misma implementación rota, coincidirían igual.
    expect(elemento?.slug).toBe("seccion-los-palos-grandes");
  });
});
