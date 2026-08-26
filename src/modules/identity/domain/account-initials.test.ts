import { describe, expect, it } from "vitest";
import { initialsFrom } from "./account-initials";

/**
 * El avatar de la cuenta (diseño 14a/14b): iniciales sobre `--accent`, o la
 * foto de Google cuando la hay. `user.image` queda NULL a propósito
 * (schema.ts, "Minimal Identity Data") y la cuenta de enlace mágico no tiene
 * nombre — sólo correo — así que las iniciales tienen que poder degradar
 * desde el correo. Ese camino ya es real, no hipotético: una cuenta creada
 * por enlace mágico no tiene otra fuente.
 */
describe("initialsFrom", () => {
  it("con nombre de dos palabras, toma la primera letra de cada una", () => {
    expect(initialsFrom("María Fernández", "maria.f@gmail.com")).toBe("MF");
  });

  it("con nombre de tres o más palabras, toma sólo la primera y la última", () => {
    expect(initialsFrom("Inmobiliaria Caracas Norte", "contacto@inmocaracas.com")).toBe("IN");
  });

  it("con nombre de una sola palabra, toma sus dos primeras letras", () => {
    expect(initialsFrom("Fernanda", "fernanda@gmail.com")).toBe("FE");
  });

  it("sin nombre, degrada al correo — la cuenta de enlace mágico no tiene otra cosa", () => {
    expect(initialsFrom(null, "usuario@dominio.com")).toBe("US");
  });

  it("un correo cuya parte local tiene una sola letra usa esa letra sola", () => {
    expect(initialsFrom(null, "a@dominio.com")).toBe("A");
  });

  it("sin nombre y sin correo (dato imposible pero no se cae) cae a un valor neutro", () => {
    expect(initialsFrom(null, null)).toBe("?");
  });

  it("un nombre en blanco se trata igual que ausente", () => {
    expect(initialsFrom("   ", "usuario@dominio.com")).toBe("US");
  });

  it("ignora espacios repetidos entre palabras del nombre", () => {
    expect(initialsFrom("María   Fernández", "maria@gmail.com")).toBe("MF");
  });

  it("siempre en mayúsculas, sin importar cómo llegó el dato", () => {
    expect(initialsFrom("maría fernández", "maria@gmail.com")).toBe("MF");
    expect(initialsFrom(null, "USUARIO@dominio.com")).toBe("US");
  });
});
