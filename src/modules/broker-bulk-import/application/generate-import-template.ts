import type { CataloguePort } from "../../listing-catalogue/application/ports/catalogue.port";
import {
  buildImportTemplateRows,
  IMPORT_TEMPLATE_HEADER,
} from "../domain/build-import-template-rows";
import { writeCsv } from "../domain/csv-output-writer";

/**
 * broker-bulk-import spec, "Downloadable Template as the Format Contract"
 * (tasks.md 9.25). **The one place the pieces compose**, same idiom as
 * `parse-import-file.ts`'s own doc comment: the header/example-row
 * generation (`build-import-template-rows.ts`, pure), the catalogue read
 * (`CataloguePort`, reused unchanged from `listing-catalogue` rather than
 * widening `ZoneCataloguePort` — that port is deliberately scoped to one
 * city at a time and has no "all cities" method), and the shared escaping
 * writer (`csv-output-writer.ts`, the same one a future error report will
 * call) each carry their own proof in isolation. What this function decides
 * is the order: fetch the FULL catalogue once, build the rows from it, then
 * write — never per-row catalogue reads, and never a second escaping path.
 */

export interface GenerateImportTemplateDependencies {
  readonly catalogue: CataloguePort;
}

export async function generateImportTemplate(
  dependencies: GenerateImportTemplateDependencies,
): Promise<string> {
  const { catalogue } = dependencies;

  const [cities, zones] = await Promise.all([catalogue.listCities(), catalogue.listZones()]);

  const exampleRows = buildImportTemplateRows(cities, zones);

  return writeCsv([IMPORT_TEMPLATE_HEADER, ...exampleRows]);
}
