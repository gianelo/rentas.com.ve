import { createHash } from "node:crypto";
import type { ZoneCategory, ZoneKind, ZoneSource } from "../../../shared/db/schema";
import { areaForMunicipality } from "./territorio-areas";
import type { ParsedMunicipality } from "./territorio-parser";

/**
 * Convierte los municipios parseados en las filas que van a `city` y `zone`.
 *
 * **Puro a propósito.** No abre archivos ni toca la base: recibe lo parseado y
 * devuelve filas. Eso lo hace verificable sin un contenedor de Postgres, y deja
 * el seed reducido a un `insert` — que es la parte que no tiene decisiones.
 */

export interface AreaRow {
  readonly id: string;
  readonly name: string;
}

export interface ZoneRow {
  readonly id: string;
  readonly cityId: string;
  readonly parentId: string | null;
  readonly kind: ZoneKind;
  readonly category: ZoneCategory | null;
  readonly name: string;
  readonly ubigeo: string | null;
  readonly postalCode: string | null;
  readonly source: ZoneSource;
}

export interface TerritoryRows {
  readonly areas: readonly AreaRow[];
  readonly zones: readonly ZoneRow[];
  /** Municipios que ningún área reclama. Se informan, nunca se insertan. */
  readonly unmappedMunicipalities: readonly string[];
}

/**
 * Ids derivados del camino completo, no aleatorios.
 *
 * **Es lo que hace que el seed sea idempotente de verdad.** Con ids aleatorios,
 * una segunda corrida insertaría 5.705 filas nuevas o dependería de que la
 * restricción única las rechace una por una; con ids derivados, la misma
 * entrada produce siempre la misma fila y el `onConflictDoUpdate` es un no-op
 * real. El camino incluye al padre porque el nombre solo no alcanza: `San José`
 * aparece once veces en el corpus.
 *
 * Misma forma que `stableId` en el seed — 8-4-4-4-12 hex, deliberadamente NO un
 * UUID RFC 4122: la columna es `text` y nada lo parsea como UUID.
 */
export function territoryId(path: string): string {
  const hex = createHash("sha256").update(`territorio:${path}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export function buildTerritoryRows(municipalities: readonly ParsedMunicipality[]): TerritoryRows {
  const areas = new Map<string, AreaRow>();
  const zones: ZoneRow[] = [];
  const unmapped: string[] = [];

  for (const municipality of municipalities) {
    const areaName = areaForMunicipality(municipality.name);
    if (!areaName) {
      // Informado, no insertado. Un municipio sin área es una decisión de
      // producto que nadie tomó todavía, y meterlo con un área inventada es
      // peor que dejarlo afuera: rompería el aislamiento sin que se note.
      unmapped.push(municipality.name);
      continue;
    }

    const areaId = territoryId(`area:${areaName}`);
    areas.set(areaName, { id: areaId, name: areaName });

    const municipalityPath = `${areaName}/${municipality.name}`;
    const municipalityId = territoryId(municipalityPath);
    zones.push({
      id: municipalityId,
      cityId: areaId,
      parentId: null,
      kind: "municipio",
      category: null,
      name: municipality.name,
      ubigeo: municipality.ubigeo,
      postalCode: null,
      // La jerarquía viene del INE aunque el código no esté en el archivo.
      source: "INE",
    });

    for (const parish of municipality.parishes) {
      const parishPath = `${municipalityPath}/${parish.name}`;
      const parishId = territoryId(parishPath);
      zones.push({
        id: parishId,
        cityId: areaId,
        parentId: municipalityId,
        kind: "parroquia",
        category: null,
        name: parish.name,
        ubigeo: parish.ubigeo,
        postalCode: null,
        source: "INE",
      });

      for (const element of parish.elements) {
        zones.push({
          // La categoría entra en el id porque la fuente lista el mismo
          // nombre bajo dos categorías cuando sus fuentes no coincidieron —
          // «Naranjal» en Carayaca es `localidad` y `otro` a la vez. Son dos
          // entradas, no una repetida, y el documento manda no fusionarlas.
          id: territoryId(`${parishPath}/${element.category}/${element.name}`),
          cityId: areaId,
          parentId: parishId,
          kind: "elemento",
          category: element.category,
          name: element.name,
          ubigeo: null,
          postalCode: element.postalCode,
          source: element.source,
        });
      }
    }
  }

  return {
    areas: [...areas.values()],
    zones,
    unmappedMunicipalities: unmapped,
  };
}
