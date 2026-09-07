import { describe, expect, it } from "vitest";
import { SIGN_IN_FALLBACK, safeReturnPath, safeSignInReturn } from "./safe-return-destination";

/**
 * **La regla sobre una ruta pelada** (tasks.md 8.7).
 *
 * La acción de reportar recibe la ruta de la ficha en un campo oculto y
 * redirige a ella dos veces: al acuse y, si el aviso no existe, a la propia
 * ficha para que sea ella la que conteste. Las dos son destinos que llegan de
 * quien envía, así que valen exactamente lo mismo que cualquier `callbackUrl`
 * — un redirector abierto con nuestro dominio en la barra.
 *
 * Vive acá y no en `listing-trust` para no escribir la regla dos veces: comparte
 * el origen inventado y el prefijo `/alquiler/` con `safeSignInReturn` y
 * `signInDoorOf`, y dos copias de esta comprobación es cómo una de las dos se
 * queda vieja.
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
   * **Devuelve `null` y no una ruta por defecto.** La diferencia no es de
   * estilo: mandar a alguien a `/signin` cuando no sabemos de dónde vino es
   * inofensivo, pero acá el valor se concatena para armar
   * `…/reportar?enviado` — un respaldo silencioso convertiría una ruta hostil
   * en un acuse sobre una pantalla que no es la nuestra. `null` obliga a quien
   * llama a decidir, y esa decisión es negarse.
   */
  it("no inventa un respaldo: quien llama tiene que ver el rechazo", () => {
    expect(safeReturnPath("https://evil.test/alquiler/x")).not.toBe(SIGN_IN_FALLBACK);
    expect(safeReturnPath("https://evil.test/alquiler/x")).toBeNull();
  });
});

/**
 * **La misma regla, sobre el destino que se emite al salir de entrar**
 * (tasks.md 15.10, F19).
 *
 * `safeReturnPath` valida la ruta de una ficha sola. Ninguna otra regla sirve
 * acá, y no es cuestión de estilo: **de entrar se sale hacia cuatro pantallas,
 * no hacia una.** Las puertas que ya existen mandan `/alquiler/…`,
 * `/publicar…`, `/mis-avisos` e `/importar`; medir esto con el prefijo de la
 * ficha mandaría al inicio a quien venía de publicar, que es justo lo que la
 * F19 prohíbe. El parseo es compartido; lo que cambia es la lista de puertas.
 */
describe("safeSignInReturn", () => {
  it.each([
    ["la ficha", "/alquiler/maracaibo/bella-vista/apto-abc123"],
    ["la ficha con su búsqueda de origen", "/alquiler/maracaibo?desde=%2Fx"],
    ["publicar", "/publicar"],
    ["un paso de publicar", "/publicar/paso/fotos"],
    ["mis avisos", "/mis-avisos"],
    ["importar", "/importar"],
  ])("deja pasar %s, que es una puerta del producto", (_caso, candidato) => {
    expect(safeSignInReturn(candidato)).toBe(candidato);
  });

  it.each([
    ["otro origen escrito completo", "https://evil.test/publicar"],
    ["el origen relativo al protocolo", "//evil.test/publicar"],
    ["la barra invertida que algunos navegadores normalizan", "/\\evil.test/publicar"],
    // Auth.js sí acepta ésta: su regla es «mismo origen», y el inicio es del
    // mismo origen. La F19 dice «nunca al inicio», así que la regla del
    // producto es más estrecha que la de la librería, y por eso existe.
    ["el inicio, que la F19 prohíbe por su nombre", "/"],
    ["una ruta interna que no es una puerta", "/terminos"],
    ["la propia pantalla de entrar, que sería un bucle", "/signin"],
    ["un prefijo que sólo se le parece", "/publicarx"],
    // Se compara la ruta YA RESUELTA: `/publicar/../terminos` empieza con el
    // prefijo y el navegador lo resuelve a `/terminos`.
    ["una escapada por segmentos relativos", "/publicar/../terminos"],
    ["el campo vacío", ""],
    ["el campo en blanco", "   "],
    ["basura que ni siquiera parsea", "://"],
    ["un host que hace lanzar al parser", "//["],
  ])("rechaza %s", (_caso, candidato) => {
    expect(safeSignInReturn(candidato)).toBeNull();
  });
});
