import { describe, expect, it } from "vitest";
import {
  carriedChangeValue,
  measureOf,
  OPAQUE_CHANGE_FIELDS,
  readCarriedMeasure,
} from "./carried-value";

/**
 * **Qué vuelve en una dirección cuando el producto se niega o anuncia un
 * cambio** (tasks.md 18.19 y 18.25).
 *
 * Sin JavaScript no hay otro lugar donde devolverle un valor a la pantalla, y
 * una barra de direcciones no es un lugar donde quepa una descripción de 1.200
 * caracteres. Las dos tareas son la misma pregunta: la 18.19 midió que el
 * valor entero no cabe, y la 18.25 necesita justamente ese valor para decir
 * «Vas 24». La respuesta es que vuelve **la medida**, que es un número.
 */

/** 1.200 caracteres, el máximo que el validador acepta. */
const DESCRIPCION = "Apartamento amplio y luminoso con vista al Ávila. ".repeat(24);

describe("la medida de un valor que no se dibuja", () => {
  it("la descripción es de las que no se dicen en voz alta", () => {
    // Pinchado por valor, no derivado del conjunto que la función consulta.
    expect([...OPAQUE_CHANGE_FIELDS].sort()).toEqual([
      "description",
      "hasAppliances",
      "hasPowerPlant",
      "hasRegularWater",
      "hasSecurity",
      "isFurnished",
    ]);
  });

  it("una descripción viaja como su medida y no como su texto", () => {
    expect([...DESCRIPCION].length).toBe(1200);

    expect(carriedChangeValue("description", DESCRIPCION)).toBe("1200");
  });

  it("un campo que sí se dice en voz alta viaja entero", () => {
    expect(carriedChangeValue("priceUsd", "520")).toBe("520");
    expect(carriedChangeValue("title", "Apartamento 3 hab & puesto")).toBe(
      "Apartamento 3 hab & puesto",
    );
  });

  it("mide en puntos de código, igual que el validador", () => {
    // Cinco caracteres astrales: `String.length` diría 10.
    expect(carriedChangeValue("description", "🏠🏠🏠🏠🏠")).toBe("5");
  });

  it("sin valor anterior la medida es 0, que es un cambio contra cualquier otra", () => {
    expect(carriedChangeValue("description", "")).toBe("0");
  });
});

describe("measureOf — lo no contestado no mide cero", () => {
  it("mide lo que hay, en puntos de código", () => {
    expect(measureOf("Corta, muy corta de más.")).toBe(24);
    expect(measureOf("🏠🏠")).toBe(2);
  });

  it("un campo vacío mide cero, porque alguien mandó algo vacío", () => {
    expect(measureOf("")).toBe(0);
  });

  it("un campo ausente no mide: no hay número que decir", () => {
    expect(measureOf(undefined)).toBeUndefined();
  });
});

describe("readCarriedMeasure — la dirección afirma, no prueba", () => {
  it("un número entero vuelve como número", () => {
    expect(readCarriedMeasure("24")).toBe(24);
    expect(readCarriedMeasure("0")).toBe(0);
  });

  it("lo ausente no inventa un cero", () => {
    expect(readCarriedMeasure(undefined)).toBeUndefined();
    expect(readCarriedMeasure("")).toBeUndefined();
  });

  it("lo que no es un entero escrito en dígitos no es una medida", () => {
    for (const escrito of ["abc", "-5", "12.5", " 24", "24 ", "1e3", "24,7", "Infinity", "NaN"]) {
      expect(readCarriedMeasure(escrito)).toBeUndefined();
    }
  });

  it("un número absurdamente largo tampoco es una medida", () => {
    // El máximo del validador son 1.200 caracteres; siete dígitos ya sobran, y
    // aceptar cualquier largo dejaría dibujar «Vas 999999999999».
    expect(readCarriedMeasure("12345678")).toBeUndefined();
    expect(readCarriedMeasure("1234567")).toBe(1_234_567);
  });
});
