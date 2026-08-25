import type { CatalogueCity, CatalogueZone } from "../../listing-catalogue/domain/catalogue";
import { IMPORT_COLUMN_ALLOWLIST } from "./csv-import-columns";

/**
 * broker-bulk-import spec, "Downloadable Template as the Format Contract"
 * (tasks.md 9.24/9.25): "The template MUST contain the exact expected
 * header row, at least one example row, and the currently valid city and
 * zone values."
 *
 * **Reads `IMPORT_COLUMN_ALLOWLIST` — the ONE source both the parser
 * (tasks.md 9.11) and this generator read — instead of restating the
 * column list.** That single shared array is what makes "Template matches
 * the parser" true by construction: an operator adding, removing, or
 * renaming a column here changes both sides at once, because there is only
 * one side.
 */
export const IMPORT_TEMPLATE_HEADER: readonly string[] = IMPORT_COLUMN_ALLOWLIST.map(
  (column) => column.header,
);

/**
 * A fixed, plausible description — long enough to satisfy
 * `MIN_DESCRIPTION_CHARACTERS` (`publishable-listing.ts`, 120) so that a
 * template a broker re-uploads UNCHANGED passes not only the structural
 * parse but the real per-row validator too, not merely "the format was
 * accepted".
 */
const EXAMPLE_DESCRIPTION =
  "Inmueble amoblado, con excelente iluminacion natural, cerca de transporte publico, comercios y areas verdes. Cocina equipada y agua las 24 horas, listo para mudarse de inmediato.";

/**
 * **Deliberately begins with '-', and that is the whole point.** A title
 * beginning with a hyphen is a plausible real listing ("- Vista al mar,
 * amoblado"), and `csv-output-writer.ts`'s `neutraliseCsvField` treats a
 * leading `-` as a formula-injection trigger requiring the apostrophe
 * prefix. Choosing a SAFE example that never exercises that path would
 * dodge the exact coexistence problem the spec's two scenarios together
 * imply: the shipped template itself proves neutralisation and "the
 * example row is accepted when re-uploaded" hold at the same time, rather
 * than only in a test-only fixture nobody downloads.
 */
function exampleTitleFor(city: CatalogueCity): string {
  return `-Amplio inmueble en ${city.name}`;
}

function firstZoneFor(
  city: CatalogueCity,
  zones: readonly CatalogueZone[],
): CatalogueZone | undefined {
  return zones.find((zone) => zone.cityId === city.id);
}

const CELL_BY_FIELD: Record<
  string,
  (city: CatalogueCity, zone: CatalogueZone, index: number) => string
> = {
  externalReference: (_city, _zone, index) => `plantilla-${index + 1}`,
  title: (city) => exampleTitleFor(city),
  description: () => EXAMPLE_DESCRIPTION,
  priceUsd: () => "450",
  city: (_city, zone) => zone.cityId,
  zone: (_city, zone) => zone.id,
  propertyType: () => "apartamento",
  rooms: () => "3",
  bathrooms: () => "2",
  areaM2: () => "80",
  parkingSpots: () => "1",
  hasPowerPlant: () => "si",
  hasRegularWater: () => "si",
  isFurnished: () => "si",
  hasSecurity: () => "no",
  hasAppliances: () => "si",
};

function buildRow(city: CatalogueCity, zone: CatalogueZone, index: number): string[] {
  return IMPORT_COLUMN_ALLOWLIST.map((column) => {
    const cell = CELL_BY_FIELD[column.field];
    // Every field in the allowlist has an entry above — this is a
    // programming-error guard, not a real-world branch (Extract-Before-Mock
    // rule's twin for pure functions: fail loudly rather than emit a blank
    // cell nothing would ever notice).
    if (!cell) {
      throw new Error(`build-import-template-rows: no example value for column "${column.field}"`);
    }
    return cell(city, zone, index);
  });
}

/**
 * One example row PER CITY, each carrying that city's own real id and one
 * of its own curated zones' real id — the "currently valid city and zone
 * values" the spec asks for, demonstrated as literally accepted data rather
 * than only described in prose. **Not one row per zone**: a city's zone
 * taxonomy can run to hundreds or thousands of entries at every
 * estado/municipio/parroquia/elemento level (`schema.ts`'s own documented
 * reality), and dumping all of them into a downloadable template would be
 * neither practical nor what a broker filling out a portfolio needs — one
 * real, valid pair per city is enough to show the expected value shape,
 * and the full catalogue stays discoverable the same way the single-listing
 * publish form already looks it up.
 *
 * A city with no curated zone is skipped rather than emitted with a blank
 * or certain-to-fail zone cell — a row that cannot possibly validate is
 * worse than no row at all.
 */
export function buildImportTemplateRows(
  cities: readonly CatalogueCity[],
  zones: readonly CatalogueZone[],
): readonly string[][] {
  const rows: string[][] = [];
  cities.forEach((city, index) => {
    const zone = firstZoneFor(city, zones);
    if (!zone) return;
    rows.push(buildRow(city, zone, index));
  });
  return rows;
}
