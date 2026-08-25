import type {
  CatalogueCity,
  CatalogueZone,
  CatalogueZoneCategory,
  CatalogueZoneKind,
} from "../../listing-catalogue/domain/catalogue";
import { normalize as normalizeLocationName } from "../../listing-catalogue/domain/suggest-filters";
import type { ImportRow } from "./csv-import-rows";
import type {
  ImportRowError,
  ImportRowValidationOutcome,
  ValidImportRow,
} from "./import-row-validation";

/**
 * The gap slice C's own tasks.md entry flagged and deferred verbatim:
 * "`ciudad`/`zona` cells are treated as the same identifiers `CuratedZone`
 * already uses; no name→id resolution layer built — deferred." Every test
 * before this one fed the parser a real `city.id`/`zone.id` UUID directly,
 * which is exactly what the downloaded template ALSO used to emit
 * (`build-import-template-rows.ts`, before this file) — unusable by a human
 * filling a spreadsheet by hand.
 *
 * **This runs BEFORE `validatePublishableListing` ever sees the row**
 * (`import-row-validation.ts`, unchanged by this file). The rest of the
 * pipeline keeps working in ids: this layer's only job is to turn a row's
 * `city`/`zone` NAME cells into real ids, or explain — in the row's own
 * language — why it could not.
 *
 * **Reuses `suggest-filters.ts`'s `normalize`, not a second normalizer.**
 * That function's own doc comment warns against writing a second one, and
 * this module imports it directly rather than duplicating NFD accent
 * stripping + lowercasing — the same cross-module domain reuse this
 * codebase already does for `slugify` (`listing-search/domain/zone-
 * catalogue.ts` imports it from `listing-discovery`). No shared/ promotion
 * was needed: both modules already reach across each other's domain layer
 * for pure functions with no I/O.
 *
 * **Aliases are deliberately NOT accepted, and this is the decision,
 * recorded per AGENTS.md §5 — not left implicit.** `DrizzleZoneVocabulary`
 * and `suggest-filters.ts` both match by alias for the publish form's
 * FUZZY search widget, where a human picks the right suggestion from a
 * list before anything is stored. Bulk import has no such human-in-the-
 * loop confirmation step — whatever resolves here is written straight into
 * `listing.zone_id`. Three reasons this stays name-only:
 *  1. The downloadable template (`build-import-template-rows.ts`) emits the
 *     CANONICAL `zone.name`, so a broker who follows the documented happy
 *     path — download, replace the example rows, re-upload — never needs
 *     an alias at all.
 *  2. The alias index (3,547 entries, sourced from IPOSTEL/OSM heuristics
 *     per `docs/territorio/`) is not founder-curated the way `zone.name`
 *     is — accepting it as authoritative for WHERE A LISTING IS PLACED sets
 *     a materially lower trust bar than the fuzzy-search use it was built
 *     for.
 *  3. It would widen, not narrow, the exact ambiguity problem this module
 *     exists to close: one alias can point at a zone whose name-level
 *     ambiguity is no easier to resolve, and a broker typing an alias has
 *     even less reason to know which of several candidates it best names.
 * Fail-closed wins here: an alias that does not match any `zone.name`
 * reports as an unknown zone, exactly like any other unrecognised text.
 */

const ZONE_KIND_LABEL: Record<CatalogueZoneKind, string> = {
  estado: "el estado",
  municipio: "el municipio",
  parroquia: "la parroquia",
  elemento: "el lugar",
};

const ZONE_CATEGORY_LABEL: Record<CatalogueZoneCategory, string> = {
  barrio: "el barrio",
  sector: "el sector",
  urbanizacion: "la urbanización",
  conjunto: "el conjunto residencial",
  parcelamiento: "el parcelamiento",
  caserio: "el caserío",
  comunidad: "la comunidad",
  localidad: "la localidad",
  edificacion: "la edificación",
  otro: "el lugar",
};

/** "el municipio Chacao (dentro de Distrito Capital)" — enough to tell two
 * same-named candidates apart without inventing a syntax to disambiguate
 * them in the file. */
function describeZone(zone: CatalogueZone): string {
  const label =
    zone.kind === "elemento" && zone.category
      ? ZONE_CATEGORY_LABEL[zone.category]
      : ZONE_KIND_LABEL[zone.kind];
  const parentClause = zone.parentName ? ` (dentro de ${zone.parentName})` : "";
  return `${label} ${zone.name}${parentClause}`;
}

/** What resolving ONE row's location decided: real ids where resolution
 * succeeded (or the cell was blank — the pre-existing required-field rule
 * handles that), and a plain-language reason where it could not. */
export interface RowLocationOutcome {
  /** `""` when unresolved or blank — never a raw, unresolved name. */
  readonly cityId: string;
  /** `""` when unresolved or blank — never a raw, unresolved name. */
  readonly zoneId: string;
  /** Empty when resolution needed no explanation for this row. */
  readonly errorMessages: readonly string[];
}

/**
 * Resolves ONE row's `city`/`zone` cells. Returns EVERY resolvable value it
 * can even when the other field fails — a row with a good city name and a
 * bad zone name still gets its city resolved, so the broker is not told to
 * fix something that was already right.
 */
export function resolveImportRowLocation(
  row: ImportRow,
  cities: readonly CatalogueCity[],
  zones: readonly CatalogueZone[],
): RowLocationOutcome {
  const cityInput = (row.city ?? "").trim();
  const zoneInput = (row.zone ?? "").trim();

  // Blank city: `cityId.required` already says this, and it says it
  // correctly — no message this layer could add is more useful than that.
  // A blank zone can never be scoped without a city either, so both stay
  // blank rather than guessing at what an empty cell might have meant.
  if (cityInput === "") {
    return { cityId: "", zoneId: "", errorMessages: [] };
  }

  const normalizedCityInput = normalizeLocationName(cityInput);
  const cityMatches = cities.filter(
    (city) => normalizeLocationName(city.name) === normalizedCityInput,
  );

  if (cityMatches.length === 0) {
    const validNames = cities.map((city) => `«${city.name}»`).join(", ");
    return {
      cityId: "",
      zoneId: "",
      errorMessages: [
        `«${cityInput}» no es una ciudad válida.` +
          (validNames ? ` Ciudades disponibles: ${validNames}.` : ""),
      ],
    };
  }

  if (cityMatches.length > 1) {
    // Defensive: today's curated catalogue holds exactly two, distinctly
    // named cities, so this branch has no real trigger — but "the
    // catalogue could never have two cities with the same name" is a fact
    // about today's data, not a guarantee this function should assume.
    return {
      cityId: "",
      zoneId: "",
      errorMessages: [
        `«${cityInput}» coincide con más de una ciudad registrada en el catálogo. ` +
          "Este archivo no puede continuar hasta que el catálogo de ciudades se corrija.",
      ],
    };
  }

  const city = cityMatches[0] as CatalogueCity;

  if (zoneInput === "") {
    return { cityId: city.id, zoneId: "", errorMessages: [] };
  }

  const normalizedZoneInput = normalizeLocationName(zoneInput);
  // Scoped to the RESOLVED city — never a global search across every zone
  // first. «Centro» exists in both Maracaibo and Distrito Capital; matching
  // globally before narrowing by city would make the row's own city cell
  // meaningless for disambiguation.
  const zoneMatches = zones.filter(
    (zone) => zone.cityId === city.id && normalizeLocationName(zone.name) === normalizedZoneInput,
  );

  if (zoneMatches.length === 0) {
    return {
      cityId: city.id,
      zoneId: "",
      errorMessages: [`«${zoneInput}» no existe en ${city.name}.`],
    };
  }

  if (zoneMatches.length > 1) {
    // The self-referencing tree's real shape (`schema.ts`): the same name
    // can legitimately name more than one level. Refused rather than
    // guessed — a silent pick puts the listing in the wrong place and
    // nobody finds out.
    const matches = zoneMatches.map(describeZone).join(" y ");
    return {
      cityId: city.id,
      zoneId: "",
      errorMessages: [
        `«${zoneInput}» coincide con más de un lugar en ${city.name}: ${matches}. ` +
          `Escribí el nombre de un lugar más específico dentro de ${zoneInput} ` +
          "(una parroquia, urbanización o barrio) para indicar cuál.",
      ],
    };
  }

  return { cityId: city.id, zoneId: (zoneMatches[0] as CatalogueZone).id, errorMessages: [] };
}

/** Every row, independently, in file order. */
export function resolveImportRowLocations(
  rows: readonly ImportRow[],
  cities: readonly CatalogueCity[],
  zones: readonly CatalogueZone[],
): readonly RowLocationOutcome[] {
  return rows.map((row) => resolveImportRowLocation(row, cities, zones));
}

/**
 * Replaces `city`/`zone` with the resolved ids `validateImportRows`
 * expects — the rest of the pipeline keeps working in ids and does not
 * change. A row that failed resolution gets BLANK city/zone cells rather
 * than its raw, unresolved text: `validatePublishableListing`'s own
 * `cityId.required`/`zoneId.required` checks then fire (harmlessly
 * redundant — `mergeLocationResolutionErrors` below replaces them with the
 * specific message), and no garbage value is ever compared against a real
 * curated-zone id.
 */
export function applyResolvedLocations(
  rows: readonly ImportRow[],
  outcomes: readonly RowLocationOutcome[],
): readonly ImportRow[] {
  return rows.map((row, index) => {
    const outcome = outcomes[index] as RowLocationOutcome;
    return { ...row, city: outcome.cityId, zone: outcome.zoneId };
  });
}

/** The generic codes a resolution failure's blanked-out city/zone cell
 * produces downstream in `validateImportRows` — superseded, never
 * duplicated alongside the specific message that explains WHY. */
const LOCATION_VIOLATION_CODES: ReadonlySet<string> = new Set([
  "cityId.required",
  "cityId.unknown",
  "zoneId.required",
  "zoneId.notInCity",
]);

/**
 * Combines `validateImportRows`'s outcome with the location-resolution
 * outcomes, row by row, in the SAME order `resolveImportRowLocations`
 * iterated (which is file order — row numbers stay `index + 2`, matching
 * `import-row-validation.ts`'s own convention).
 *
 * A row with no location failure passes through completely unchanged —
 * this never re-derives what `validateImportRows` already decided. A row
 * WITH a location failure gets its specific message prepended, and the
 * generic `cityId.*`/`zoneId.*` codes `applyResolvedLocations`'s blank
 * cells caused are filtered out, so a broker never sees a code sitting next
 * to the sentence that already explains it. Any OTHER, independent
 * violation for that same row (a bad price, say) is kept.
 */
export function mergeLocationResolutionErrors(
  outcome: ImportRowValidationOutcome,
  locationOutcomes: readonly RowLocationOutcome[],
): ImportRowValidationOutcome {
  const errorsByRow = new Map(outcome.errors.map((error) => [error.rowNumber, error]));
  const validByRow = new Map(outcome.validRows.map((valid) => [valid.rowNumber, valid]));

  const errors: ImportRowError[] = [];
  const validRows: ValidImportRow[] = [];

  locationOutcomes.forEach((location, index) => {
    const rowNumber = index + 2;

    if (location.errorMessages.length === 0) {
      const valid = validByRow.get(rowNumber);
      if (valid) validRows.push(valid);
      const existing = errorsByRow.get(rowNumber);
      if (existing) errors.push(existing);
      return;
    }

    const existing = errorsByRow.get(rowNumber);
    const otherReasons = (existing?.reasons ?? []).filter(
      (reason) => !LOCATION_VIOLATION_CODES.has(reason),
    );
    errors.push({ rowNumber, reasons: [...location.errorMessages, ...otherReasons] });
  });

  return { validRows, errors };
}
