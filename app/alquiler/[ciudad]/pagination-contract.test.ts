import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { RESULTS_PER_PAGE } from "@/modules/listing-search/domain/pagination";

/**
 * **La página de ciudad no puede volver a truncar en silencio.**
 *
 * Es el bug que este archivo existe para atrapar, y ya estuvo publicado: la
 * consulta recortaba a 24 —`pageWindow` lo hace por su cuenta, sin que la
 * pantalla lo pida— y la página no ofrecía ni un enlace de paginación. El
 * aviso 25 en adelante existía, se contaba, y no había forma de llegar. Nada
 * fallaba: la pantalla se dibujaba perfecta con las primeras 24.
 *
 * Se comprueba leyendo el archivo, igual que `indexing-contract.test.ts`, y
 * por la misma razón: lo que hay que atar no es el resultado de una función
 * sino **que la pantalla use la del dominio**. Una aritmética de páginas
 * escrita a mano en la página coincidiría hoy con `RESULTS_PER_PAGE` y dejaría
 * de coincidir el día que alguien toque el tamaño de página — y `app/` no
 * lleva suelo de cobertura, así que nada la pondría en rojo.
 */
const PAGE = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

describe("el contrato de paginación de la ruta de ciudad", () => {
  it("el tamaño de página lo declara el dominio", () => {
    // Guarda contra medir el vacío: sin esto el resto pasaría por defecto.
    expect(RESULTS_PER_PAGE).toBeGreaterThan(0);
  });

  it("la página pide las páginas al dominio en vez de calcularlas", () => {
    expect(PAGE).toContain("resolvePagination");
  });

  it("y ofrece los enlaces, porque recortar sin ofrecerlos es truncar en silencio", () => {
    expect(PAGE).toContain('aria-label="Paginación"');
    expect(PAGE).toMatch(/rel="prev"/);
    expect(PAGE).toMatch(/rel="next"/);
  });

  it("el número de página se llama como lo llama la tabla del dominio", () => {
    // Un `PAGE_PARAM = "pag"` escrito acá es la segunda tabla de nombres que
    // `indexing-contract.test.ts` prohíbe del otro lado.
    expect(PAGE).toContain("SEARCH_QUERY_NAMES.page");
    expect(PAGE).not.toMatch(/const PAGE_PARAM/);
  });

  it("el conteo visible es el de la búsqueda entera y no el de la pantalla", () => {
    // `cards.length` sobre una página recortada dice 24 sobre 300 avisos, que
    // es el número equivocado con ventaja: parece exacto.
    expect(PAGE).not.toMatch(/cards\.length === 1 \? "1 propiedad activa"/);
    expect(PAGE).toContain('total === 1 ? "1 propiedad activa"');
  });
});
