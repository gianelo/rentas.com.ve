import { describe, expect, it } from "vitest";
import { isInternalPath } from "./internal-path";

describe("isInternalPath", () => {
  it("reconoce una ruta del propio sitio", () => {
    expect(isInternalPath("/alquiler/maracaibo/bella-vista")).toBe(true);
    expect(isInternalPath("/")).toBe(true);
    expect(isInternalPath("/publicar?paso=2")).toBe(true);
  });

  /**
   * **Los tres que abren otra aplicación, no otra pantalla.** Un `wa.me`, un
   * marcador de teléfono o un cliente de correo salen del sitio: pedirle
   * navegación de cliente a eso no la acelera, y en el mejor caso el router
   * intenta precargar una dirección que no es una página.
   */
  it("rechaza los esquemas que abren otra aplicación", () => {
    expect(isInternalPath("https://wa.me/584121234567?text=hola")).toBe(false);
    expect(isInternalPath("tel:+584121234567")).toBe(false);
    expect(isInternalPath("mailto:hola@rentas.com.ve")).toBe(false);
    expect(isInternalPath("https://fotos.gianbarboza.com/photos/x.webp")).toBe(false);
  });

  /**
   * **El que se cuela en cualquier comprobación que sólo mire la primera
   * barra.** `//evil.test` no es una ruta: el navegador la lee como otro
   * origen sobre el mismo protocolo. Es el mismo caso que
   * `safe-return-destination.ts` ya resuelve parseando en vez de comparar
   * prefijos, y por eso acá se resuelve igual.
   */
  it("rechaza el origen relativo al protocolo", () => {
    expect(isInternalPath("//evil.test/alquiler/x")).toBe(false);
  });

  /**
   * Un ancla de la misma página no navega: mueve el scroll. Envolverla en el
   * router agrega una entrada al historial para algo que el navegador ya hace
   * mejor solo.
   */
  it("rechaza un ancla de la misma página", () => {
    expect(isInternalPath("#reportar")).toBe(false);
  });

  it("rechaza lo vacío y `javascript:`, sin lanzar", () => {
    // Corre al dibujar cada enlace de cada pantalla. Una excepción acá deja la
    // página entera en blanco por un href mal armado.
    for (const junk of ["", "   ", "javascript:alert(1)"]) {
      expect(isInternalPath(junk)).toBe(false);
    }
  });

  /**
   * **Una ruta rara sigue siendo una ruta**, y esta función no opina sobre eso.
   * `%` y `://` resuelven al mismo origen: son referencias relativas
   * malformadas, no direcciones de otro sitio. Contesta *interna o externa*,
   * nunca *válida o basura* — y con cualquiera de las dos respuestas el
   * resultado en pantalla es el mismo 404 que daría un ancla pelada.
   *
   * Se deja escrito porque la primera versión de este test afirmaba lo
   * contrario, y corregirlo sin explicar por qué invita a "arreglarlo" de
   * vuelta.
   */
  it("trata una ruta malformada como interna, que es lo que es", () => {
    expect(isInternalPath("%")).toBe(true);
    expect(isInternalPath("://")).toBe(true);
  });
});
