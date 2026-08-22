/**
 * Lee los archivos de `docs/territorio/` y devuelve la taxonomía estructurada.
 *
 * **Por qué existe un parser y no una lista escrita a mano.** Son 5.705 lugares
 * bajo 81 parroquias, con procedencia declarada entrada por entrada — INE para
 * la jerarquía, IPOSTEL para el código postal, OpenStreetMap por contención
 * geométrica. Transcribir eso a mano garantiza dos cosas: errores, y que la
 * próxima actualización del INE haya que transcribirla otra vez. El markdown es
 * la fuente; el seed se genera.
 *
 * **La regla que el documento fuente enuncia y este módulo obedece:** *"La
 * categoría nunca se dedujo. Un nombre sin prefijo declarado por la fuente va a
 * Otros."* La categoría sale del encabezado `####`, jamás del prefijo del
 * nombre. Un parser que leyera el prefijo reclasificaría en silencio entradas
 * que la fuente dejó donde están a propósito, y nadie lo notaría, porque el
 * resultado seguiría pareciendo una taxonomía.
 *
 * Lo mismo con los duplicados: *"«Los Pinos», «Los Pinos I» y «Los Pinos II»
 * son entradas distintas"*. Acá no se fusiona nada.
 */

export type TerritoryCategory =
  | "barrio"
  | "sector"
  | "urbanizacion"
  | "conjunto"
  | "parcelamiento"
  | "caserio"
  | "comunidad"
  | "localidad"
  | "edificacion"
  | "otro";

/** De dónde salió la entrada. `INE` queda para municipios y parroquias. */
export type TerritorySource = "INE" | "IPOSTEL" | "OSM" | "IPOSTEL+OSM";

export interface ParsedElement {
  readonly name: string;
  readonly category: TerritoryCategory;
  readonly postalCode: string | null;
  readonly source: TerritorySource;
}

export interface ParsedParish {
  readonly name: string;
  readonly ubigeo: string | null;
  readonly elements: readonly ParsedElement[];
}

export interface ParsedMunicipality {
  readonly name: string;
  readonly ubigeo: string | null;
  readonly parishes: readonly ParsedParish[];
}

/**
 * Los encabezados `####` tal como aparecen en el corpus. Es un `Record`
 * completo y no un `switch` con default: una categoría nueva en la fuente tiene
 * que fallar acá de forma visible, no caer en `otro` sin que nadie se entere.
 */
const CATEGORIES: Record<string, TerritoryCategory> = {
  Barrios: "barrio",
  Sectores: "sector",
  Urbanizaciones: "urbanizacion",
  "Conjuntos residenciales": "conjunto",
  Parcelamientos: "parcelamiento",
  Caseríos: "caserio",
  Caserios: "caserio",
  Comunidades: "comunidad",
  Localidades: "localidad",
  "Edificaciones identificadas individualmente": "edificacion",
  Otros: "otro",
};

/**
 * **El discriminante de una entrada real es el marcador de procedencia**, no el
 * guion inicial. Los archivos usan `- ` también para metadatos
 * (`- **Capital:** …`) y para prosa, y una entrada sin procedencia no existe en
 * el corpus. Formas medidas sobre los 5.729 marcadores reales:
 * `[CP 4005 — IPOSTEL]`, `[OSM]`, `[CP 1080 — IPOSTEL + OSM]`, `[IPOSTEL]`,
 * `[IPOSTEL + OSM]`.
 */
const ENTRY = /^-\s+(.+?)\s+`\[(?:CP\s+(\d+)\s+—\s+)?([A-Z+\s]+)\]`\s*$/u;

/**
 * `## Municipio Baruta`, y sólo eso: los `##` de prosa no son municipios.
 *
 * **Acepta también `# Municipio Maracaibo — Estado Zulia`**, porque el corpus
 * usa las dos formas y por una razón: `miranda.md` lleva cuatro municipios en
 * un archivo y necesita el segundo nivel, mientras que cada archivo de Zulia
 * lleva uno solo y lo declara en su título. El sufijo `— Estado X` se descarta:
 * es el encabezado del documento, no parte del nombre.
 */
const MUNICIPALITY = /^#{1,2}\s+Municipio\s+(.+?)\s*(?:\s—\s.*)?$/u;
const PARISH = /^###\s+Parroquia\s+(.+?)\s*$/u;
const CATEGORY = /^####\s+(.+?)(?:\s+\(\d+\))?\s*$/u;
const UBIGEO = /^-\s+\*\*Código UBIGEO[^:]*:\*\*\s+`(\d+)`/u;

function readSource(raw: string): TerritorySource {
  const normalised = raw.replace(/\s+/gu, "");
  return normalised === "IPOSTEL+OSM" ? "IPOSTEL+OSM" : (normalised as TerritorySource);
}

export function parseTerritoryDocument(markdown: string): readonly ParsedMunicipality[] {
  const municipalities: ParsedMunicipality[] = [];

  let municipality: { name: string; ubigeo: string | null; parishes: ParsedParish[] } | null = null;
  let parish: { name: string; ubigeo: string | null; elements: ParsedElement[] } | null = null;
  let category: TerritoryCategory | null = null;

  for (const line of markdown.split("\n")) {
    const municipalityMatch = MUNICIPALITY.exec(line);
    if (municipalityMatch?.[1]) {
      municipality = { name: municipalityMatch[1], ubigeo: null, parishes: [] };
      municipalities.push(municipality as ParsedMunicipality);
      parish = null;
      category = null;
      continue;
    }

    // Un `##` cualquiera cierra el municipio anterior: lo que sigue es prosa,
    // y sus viñetas no deben caer dentro de la última parroquia leída.
    if (line.startsWith("## ")) {
      parish = null;
      category = null;
      continue;
    }

    const parishMatch = PARISH.exec(line);
    if (parishMatch?.[1] && municipality) {
      parish = { name: parishMatch[1], ubigeo: null, elements: [] };
      municipality.parishes.push(parish as ParsedParish);
      category = null;
      continue;
    }

    const categoryMatch = CATEGORY.exec(line);
    if (categoryMatch?.[1]) {
      const heading = categoryMatch[1].trim();
      const known = CATEGORIES[heading];
      if (!known) {
        throw new Error(
          `territorio-parser: encabezado de categoría desconocido "${heading}". ` +
            "Agregalo a CATEGORIES en vez de dejar que caiga en «otro» sin que nadie lo vea.",
        );
      }
      category = known;
      continue;
    }

    // El primer UBIGEO tras un encabezado pertenece a ese nivel. La parroquia
    // gana cuando hay una abierta, porque el del municipio aparece antes.
    const ubigeoMatch = UBIGEO.exec(line);
    if (ubigeoMatch?.[1]) {
      if (parish && parish.ubigeo === null) parish.ubigeo = ubigeoMatch[1];
      else if (municipality && municipality.ubigeo === null) municipality.ubigeo = ubigeoMatch[1];
      continue;
    }

    const entryMatch = ENTRY.exec(line);
    if (entryMatch?.[1] && parish && category) {
      parish.elements.push({
        // Tal cual está escrito, con dos puntos y todo: `Sector: Prado del
        // Este` y `Sector Prados del Este` son dos lugares distintos en la
        // fuente, y normalizar el separador los haría parecer un error de
        // tipeo el uno del otro.
        name: entryMatch[1],
        category,
        postalCode: entryMatch[2] ?? null,
        source: readSource(entryMatch[3] ?? ""),
      });
    }
  }

  return municipalities;
}
