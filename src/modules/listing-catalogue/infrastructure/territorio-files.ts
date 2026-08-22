import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { type ParsedMunicipality, parseTerritoryDocument } from "./territorio-parser";

/**
 * Lee `docs/territorio/` del disco y devuelve los municipios parseados.
 *
 * **Separado del parser y del importador a propósito.** Esos dos son puros —
 * texto entra, estructura sale — y por eso se prueban enteros sin un archivo ni
 * un contenedor. Este módulo es la única parte que toca el disco, y no tiene
 * ninguna decisión adentro: sólo sabe dónde están los archivos.
 */

const ROOT = "docs/territorio";

/**
 * Los `README.md` se saltan porque son prosa: explican la jerarquía, citan la
 * Gaceta Oficial y comparan Petare con Catia. No llevan entradas, y parsearlos
 * sólo abre la puerta a que una tabla de ejemplo se cuele como taxonomía.
 */
function isTaxonomyFile(path: string): boolean {
  return path.endsWith(".md") && !path.endsWith("README.md");
}

function collect(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...collect(path));
    else if (isTaxonomyFile(path)) found.push(path);
  }
  return found;
}

export function readTerritoryDocuments(root: string = ROOT): readonly ParsedMunicipality[] {
  const files = collect(root).sort();

  if (files.length === 0) {
    // Ruidoso, porque el modo de falla silencioso es peor: un seed que
    // encuentra cero archivos poblaría cero zonas y dejaría un catálogo vacío
    // que parece un problema de datos y es un problema de rutas.
    throw new Error(
      `territorio: ningún archivo de taxonomía bajo "${root}". ` +
        "El seed corre desde la raíz del repositorio.",
    );
  }

  return files.flatMap((file) => parseTerritoryDocument(readFileSync(file, "utf8")));
}
