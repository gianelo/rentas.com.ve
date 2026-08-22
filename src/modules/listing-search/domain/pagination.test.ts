import { describe, expect, it } from "vitest";
import { pageCount, pageWindow, RESULTS_PER_PAGE, readPage, resolvePagination } from "./pagination";

/**
 * El tamaño de página es una regla de negocio y por eso se prueba acá y no en
 * el adaptador: quien decide cuántos avisos entran en una pantalla es el
 * producto, no la consulta que los trae ni la página que los dibuja.
 */
describe("el tamaño de página (task 14.10, F10)", () => {
  it("entra entero en las dos cuadrículas que existen", () => {
    // `ListingCard.module.css` dibuja 2 columnas en teléfono y 3 en escritorio.
    // Un tamaño que no divide a los dos deja una última fila coja en alguna de
    // las dos anchuras.
    expect(RESULTS_PER_PAGE % 2).toBe(0);
    expect(RESULTS_PER_PAGE % 3).toBe(0);
  });
});

describe("la ventana que la consulta pide (LIMIT/OFFSET)", () => {
  it("arranca en cero para la primera página", () => {
    expect(pageWindow(1)).toEqual({ limit: RESULTS_PER_PAGE, offset: 0 });
  });

  it("salta una página entera por cada página anterior", () => {
    expect(pageWindow(2)).toEqual({ limit: RESULTS_PER_PAGE, offset: RESULTS_PER_PAGE });
    expect(pageWindow(4)).toEqual({ limit: RESULTS_PER_PAGE, offset: RESULTS_PER_PAGE * 3 });
  });

  it("trata la ausencia de página como la primera", () => {
    // Un criterio sin `page` es el de siempre: la primera pantalla. Que la
    // ausencia signifique algo sano es lo que deja al adaptador sin decisiones.
    expect(pageWindow(undefined)).toEqual(pageWindow(1));
  });

  it("nunca pide un desplazamiento negativo, pase lo que pase", () => {
    // 0 y los negativos llegan de una URL escrita a mano. Un OFFSET negativo
    // es un error de Postgres, es decir una página 500 por un parámetro viejo.
    expect(pageWindow(0)).toEqual(pageWindow(1));
    expect(pageWindow(-7)).toEqual(pageWindow(1));
    expect(pageWindow(1.5)).toEqual(pageWindow(1));
    expect(pageWindow(Number.NaN)).toEqual(pageWindow(1));
  });
});

describe("cuántas páginas hay", () => {
  it("cuenta una sola página cuando todo entra en una", () => {
    expect(pageCount(1)).toBe(1);
    expect(pageCount(RESULTS_PER_PAGE)).toBe(1);
  });

  it("abre una página más apenas sobra un aviso", () => {
    expect(pageCount(RESULTS_PER_PAGE + 1)).toBe(2);
    expect(pageCount(RESULTS_PER_PAGE * 3)).toBe(3);
  });

  it("sigue siendo una página cuando no hay nada", () => {
    // Cero resultados es una respuesta normal, no una ausencia de páginas: la
    // pantalla que dice "no hay avisos con esos filtros" es la página 1.
    expect(pageCount(0)).toBe(1);
    expect(pageCount(-3)).toBe(1);
  });
});

describe("qué página se está viendo y a cuáles se puede ir", () => {
  it("no ofrece anterior ni siguiente cuando hay una sola página", () => {
    expect(resolvePagination(undefined, 5)).toEqual({
      requested: 1,
      current: 1,
      count: 1,
      previous: null,
      next: null,
      beyondEnd: false,
    });
  });

  it("ofrece la siguiente mientras quede algo detrás", () => {
    const pagination = resolvePagination(1, RESULTS_PER_PAGE * 2);

    expect(pagination.count).toBe(2);
    expect(pagination.previous).toBeNull();
    expect(pagination.next).toBe(2);
  });

  it("ofrece la anterior desde la segunda en adelante", () => {
    expect(resolvePagination(2, RESULTS_PER_PAGE * 3)).toMatchObject({
      current: 2,
      previous: 1,
      next: 3,
    });
  });

  it("no ofrece siguiente en la última", () => {
    expect(resolvePagination(3, RESULTS_PER_PAGE * 3)).toMatchObject({
      current: 3,
      previous: 2,
      next: null,
    });
  });

  it("avisa que una página más allá del final no existe, y dice cuál es la última", () => {
    // El caso del enlace viejo pegado en un WhatsApp de hace un mes: la
    // búsqueda tenía cuatro páginas y hoy tiene una. La consulta ya devolvió
    // vacío; lo que falta es poder decirlo sin que la pantalla parezca rota.
    const pagination = resolvePagination(9, RESULTS_PER_PAGE + 1);

    expect(pagination.beyondEnd).toBe(true);
    expect(pagination.requested).toBe(9);
    expect(pagination.count).toBe(2);
    expect(pagination.current).toBe(2);
    expect(pagination.next).toBeNull();
  });

  it("trata un número de página imposible como la primera, sin marcarla de más", () => {
    for (const raw of [0, -1, 1.5, Number.NaN]) {
      expect(resolvePagination(raw, 5)).toMatchObject({ current: 1, beyondEnd: false });
    }
  });
});

describe("qué número de página trae una URL", () => {
  it("lee un entero positivo", () => {
    expect(readPage("2")).toBe(2);
    expect(readPage("12")).toBe(12);
    expect(readPage(" 12 ")).toBe(12);
  });

  it("descarta la primera página en vez de arrastrarla en el criterio", () => {
    // La ausencia ya significa "primera". Guardar `page: 1` metería un campo
    // presente-y-por-defecto en cada criterio, y dos formas de decir lo mismo.
    expect(readPage("1")).toBeUndefined();
    expect(readPage(undefined)).toBeUndefined();
    expect(readPage(null)).toBeUndefined();
    expect(readPage("")).toBeUndefined();
    expect(readPage("   ")).toBeUndefined();
  });

  it("descarta lo que no es un número de página", () => {
    expect(readPage("0")).toBeUndefined();
    expect(readPage("-2")).toBeUndefined();
    expect(readPage("2.5")).toBeUndefined();
    expect(readPage("dos")).toBeUndefined();
    expect(readPage("2; DROP TABLE listing")).toBeUndefined();
  });
});
