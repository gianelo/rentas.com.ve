import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync("app/alquiler/[ciudad]/[zona]/[slug]/page.tsx", "utf-8");

/**
 * El cableado del SEO de la ficha (11.14, 11.9, 11.15).
 *
 * **Acá sólo se prueba que la página delegue.** Qué se indexa, qué dice el
 * JSON-LD y qué nunca puede decir se prueban de verdad en
 * `listing-structured-data.test.ts`, contra la función pura. Lo que estos tests
 * cuidan es lo otro: que esa decisión no se vuelva a escribir en la página,
 * donde ninguna corrida de tests puede ponerla en rojo.
 */
describe("la ficha y los buscadores", () => {
  it("le pide al dominio la directiva de indexación", () => {
    expect(page).toContain("resolveListingIndexing");
    expect(page).toMatch(/robots:\s*indexing\.index\s*\?\s*undefined\s*:/);
  });

  /**
   * La regla permanente: una regla de negocio nunca vive en el frente. Si la
   * página vuelve a mirar el estado o a medir la descripción para decidir qué
   * se indexa, la decisión quedó en dos lados y los dos se separan en el primer
   * arreglo apurado.
   */
  it("no vuelve a decidir por su cuenta qué se indexa", () => {
    const metadata = page.slice(page.indexOf("export async function generateMetadata"));

    expect(metadata).not.toMatch(/status\s*===/);
    expect(metadata).not.toMatch(/description\.length/);
    expect(metadata).not.toMatch(/expiresAt\s*[<>]/);
  });

  it("emite el JSON-LD ya escapado, nunca un JSON.stringify suelto", () => {
    expect(page).toContain('type="application/ld+json"');
    expect(page).toContain("serializeStructuredData");
    expect(page).toContain("buildListingStructuredData");
    expect(page).not.toMatch(/dangerouslySetInnerHTML=\{\{\s*__html:\s*JSON\.stringify/);
  });

  /**
   * **El contacto no entra al documento estructurado.** El valor vive detrás
   * del caso de uso de revelación y el método tampoco tiene nada que hacer ahí:
   * la ficha le pasa al constructor el aviso y las fotos, y nada más.
   */
  it("no le pasa el contacto al documento estructurado", () => {
    const call = page.slice(page.indexOf("buildListingStructuredData("));
    const args = call.slice(0, call.indexOf("});"));

    expect(args).not.toContain("contact");
  });
});
