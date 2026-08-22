import { describe, expect, it } from "vitest";
import { SIGN_IN_FALLBACK, safeSignInDestination } from "./safe-return-destination";

const VALID = "/signin?callbackUrl=%2Falquiler%2Fmaracaibo%2Fbella-vista%2Fapto-abc123";

describe("safeSignInDestination", () => {
  it("deja pasar la vuelta legítima a una ficha", () => {
    expect(safeSignInDestination(VALID)).toBe(VALID);
  });

  /**
   * **El destino llega en un campo del formulario, así que es entrada de quien
   * envía y no un dato del servidor.** Sin esta regla, un formulario armado a
   * mano convierte la acción de revelar en un redirector abierto: un enlace de
   * rentas.com.ve que deja a quien lo toca en cualquier parte. Eso es un regalo
   * para el phishing, y lo caro es justamente que el enlace se ve nuestro.
   */
  it("rechaza otro origen escrito completo", () => {
    expect(safeSignInDestination("https://evil.test/signin?callbackUrl=%2Falquiler%2Fx")).toBe(
      SIGN_IN_FALLBACK,
    );
  });

  it("rechaza el origen relativo al protocolo", () => {
    // `//evil.test` NO es una ruta: el navegador la lee como otro origen sobre
    // el mismo protocolo. Es el que se cuela en cualquier comprobación que
    // sólo mire "empieza con una barra".
    expect(safeSignInDestination("//evil.test/alquiler/x")).toBe(SIGN_IN_FALLBACK);
  });

  it("rechaza la barra invertida, que algunos navegadores normalizan a barra", () => {
    expect(safeSignInDestination("/\\evil.test")).toBe(SIGN_IN_FALLBACK);
    expect(safeSignInDestination("/signin?callbackUrl=%2F%5Cevil.test")).toBe(SIGN_IN_FALLBACK);
  });

  it("rechaza una vuelta que no es a nuestra pantalla de entrar", () => {
    expect(safeSignInDestination("/publicar?callbackUrl=%2Falquiler%2Fx")).toBe(SIGN_IN_FALLBACK);
  });

  it("rechaza un destino de vuelta hacia afuera, aun sobre nuestra pantalla de entrar", () => {
    // El caso interesante: la ruta ES `/signin`, y lo hostil viaja adentro del
    // parámetro. Una comprobación sobre el prefijo del texto lo dejaría pasar.
    expect(safeSignInDestination("/signin?callbackUrl=https%3A%2F%2Fevil.test")).toBe(
      SIGN_IN_FALLBACK,
    );
    expect(safeSignInDestination("/signin?callbackUrl=%2F%2Fevil.test")).toBe(SIGN_IN_FALLBACK);
  });

  it("rechaza una vuelta a una pantalla que no es una ficha", () => {
    expect(safeSignInDestination("/signin?callbackUrl=%2Fpublicar")).toBe(SIGN_IN_FALLBACK);
  });

  it("rechaza la doble codificación", () => {
    // `%252F` decodifica a `%2F`, que no es una barra. Quien lo manda apuesta a
    // que alguien decodifique dos veces.
    expect(safeSignInDestination("/signin?callbackUrl=%252Falquiler%252Fx")).toBe(SIGN_IN_FALLBACK);
  });

  it("rechaza el campo vacío o ausente", () => {
    expect(safeSignInDestination("")).toBe(SIGN_IN_FALLBACK);
    expect(safeSignInDestination("   ")).toBe(SIGN_IN_FALLBACK);
    expect(safeSignInDestination("/signin")).toBe(SIGN_IN_FALLBACK);
  });

  it("nunca lanza, por más basura que reciba", () => {
    // Esta función corre en el camino de una acción de servidor. Una excepción
    // acá le da una pantalla rota a alguien que sólo quería un número.
    for (const junk of ["%", "://", " ", "/signin?callbackUrl=%E0%A4%A"]) {
      expect(safeSignInDestination(junk)).toBe(SIGN_IN_FALLBACK);
    }
  });
});
