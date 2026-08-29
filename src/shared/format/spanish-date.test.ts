import { afterEach, describe, expect, it } from "vitest";
import { longSpanishDate, shortSpanishDate } from "./spanish-date";

const ZONA_ORIGINAL = process.env.TZ;

afterEach(() => {
  process.env.TZ = ZONA_ORIGINAL;
});

/**
 * **Un solo formato y un solo sitio** (tasks.md 16.34).
 *
 * La fecha corta la escribían DOS funciones idénticas —`formatDate` en la
 * página de la ficha y `shortDate` adentro de `ContactBlock`—, y la larga
 * otras dos. Dos formateadores del mismo producto se separan, y el segundo es
 * siempre el que nadie mira.
 */
describe("shortSpanishDate", () => {
  /**
   * Fijado POR VALOR y no derivado de otro `Intl`: comparar la salida contra
   * un formateador armado con las mismas opciones prueba que dos copias del
   * mismo error coinciden.
   */
  it("escribe el día y el mes abreviado, como el pie de la ficha", () => {
    expect(shortSpanishDate(new Date("2026-08-19T12:00:00.000Z"))).toBe("19 ago.");
    expect(shortSpanishDate(new Date("2026-01-05T12:00:00.000Z"))).toBe("5 ene.");
  });

  /**
   * **En UTC, que es lo que evita que la fecha cambie según dónde corra el
   * render.** Venezuela es UTC-4: un instante de las 02:00 Z cae el día
   * anterior en Caracas, así que sin `timeZone` la misma fila diría «18 ago»
   * en un servidor y «19 ago» en otro. Es la disciplina que
   * `lifecycle-notice.ts` y `/mis-avisos` ya escribieron ("en UTC para no
   * mentir") y que estas dos funciones cortas no tenían.
   */
  it("no corre el día cuando el proceso vive al oeste de Greenwich", () => {
    process.env.TZ = "America/Caracas";

    expect(shortSpanishDate(new Date("2026-08-19T02:00:00.000Z"))).toBe("19 ago.");
  });
});

describe("longSpanishDate", () => {
  it("escribe el mes entero, como el recuadro del aviso vencido", () => {
    expect(longSpanishDate(new Date("2026-09-12T12:00:00.000Z"))).toBe("12 de septiembre");
  });

  it("tampoco corre el día", () => {
    process.env.TZ = "America/Caracas";

    expect(longSpanishDate(new Date("2026-09-12T01:00:00.000Z"))).toBe("12 de septiembre");
  });
});
