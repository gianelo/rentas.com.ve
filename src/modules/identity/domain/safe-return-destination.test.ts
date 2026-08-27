import { describe, expect, it } from "vitest";
import { SIGN_IN_FALLBACK, safeReturnPath, safeSignInDestination } from "./safe-return-destination";

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

/**
 * **La misma regla, sobre una ruta pelada** (tasks.md 8.7).
 *
 * La acción de reportar recibe la ruta de la ficha en un campo oculto y
 * redirige a ella dos veces: al acuse y, si el aviso no existe, a la propia
 * ficha para que sea ella la que conteste. Las dos son destinos que llegan de
 * quien envía, así que valen exactamente lo mismo que el `callbackUrl` de
 * arriba — un redirector abierto con nuestro dominio en la barra.
 *
 * Vive acá y no en `listing-trust` para no escribir la regla dos veces: comparte
 * el origen inventado y el prefijo `/alquiler/` con `safeSignInDestination`, y
 * dos copias de esta comprobación es cómo una de las dos se queda vieja.
 */
describe("safeReturnPath", () => {
  const FICHA = "/alquiler/maracaibo/bella-vista/apto-abc123";

  it("deja pasar la ruta de una ficha", () => {
    expect(safeReturnPath(FICHA)).toBe(FICHA);
  });

  it("conserva la búsqueda de origen que la ficha ya lleva", () => {
    const conOrigen = `${FICHA}?desde=%2Falquiler%2Fmaracaibo`;
    expect(safeReturnPath(conOrigen)).toBe(conOrigen);
  });

  it.each([
    ["otro origen escrito completo", "https://evil.test/alquiler/x"],
    ["el origen relativo al protocolo", "//evil.test/alquiler/x"],
    ["la barra invertida que algunos navegadores normalizan", "/\\evil.test/alquiler/x"],
    ["una pantalla que no es una ficha", "/publicar"],
    ["la pantalla de entrar", "/signin?callbackUrl=%2Falquiler%2Fx"],
    ["un prefijo que sólo se le parece", "/alquilerx/caracas"],
    // Se compara la ruta YA RESUELTA y no el texto: `/alquiler/../publicar`
    // empieza con el prefijo y el navegador lo resuelve a `/publicar`, así que
    // una comparación sobre el texto crudo deja salir de la regla caminando.
    ["una escapada por segmentos relativos", "/alquiler/../publicar"],
    ["el campo vacío", ""],
    ["el campo en blanco", "   "],
    ["basura que ni siquiera parsea", "://"],
    // Sí hace lanzar a `new URL`: un origen relativo al protocolo con un host
    // mal formado. Es lo que ejercita el `catch` — sin un caso así, esa rama
    // sería código que ningún camino recorre, que es peor que no tenerlo.
    ["un host que hace lanzar al parser", "//["],
  ])("rechaza %s", (_caso, candidato) => {
    expect(safeReturnPath(candidato)).toBeNull();
  });

  /**
   * **Devuelve `null` y no una ruta por defecto**, al revés que
   * `safeSignInDestination`. La diferencia no es de estilo: mandar a alguien a
   * `/signin` cuando no sabemos de dónde vino es inofensivo, pero acá el valor
   * se concatena para armar `…/reportar?enviado` — un respaldo silencioso
   * convertiría una ruta hostil en un acuse sobre una pantalla que no es la
   * nuestra. `null` obliga a quien llama a decidir, y esa decisión es negarse.
   */
  it("no inventa un respaldo: quien llama tiene que ver el rechazo", () => {
    expect(safeReturnPath("https://evil.test/alquiler/x")).not.toBe(SIGN_IN_FALLBACK);
    expect(safeReturnPath("https://evil.test/alquiler/x")).toBeNull();
  });
});
