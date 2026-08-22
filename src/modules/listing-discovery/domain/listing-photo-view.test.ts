import { describe, expect, it } from "vitest";
import { photoAltText, photoUrl } from "./listing-photo-view";

describe("photoAltText", () => {
  /**
   * **La posición va primero, y es una decisión de accesibilidad, no de
   * estilo.** La regla R7 del fundador lo dice: *"Quien usa lector de pantalla
   * necesita saber dónde está antes que qué mira."* Al revés — título, zona,
   * posición — obliga a escuchar la descripción entera de cada foto para
   * enterarse de en cuál va, seis veces seguidas.
   */
  it("empieza por la posición, después el título y la zona", () => {
    expect(
      photoAltText({
        position: 1,
        total: 6,
        title: "Apartamento 2 habitaciones",
        zone: "Chacao",
      }),
    ).toBe("Foto 2 de 6 — Apartamento 2 habitaciones, Chacao");
  });

  it("cuenta desde uno para quien lee, aunque la base cuente desde cero", () => {
    // `listing_photo.position` es base cero porque es un índice; "Foto 0 de 6"
    // no es algo que nadie diga.
    const alt = photoAltText({ position: 0, total: 6, title: "Casa", zone: "La Lago" });

    expect(alt.startsWith("Foto 1 de 6")).toBe(true);
  });

  it("no inventa una zona ni un título que no le dieron", () => {
    // Un aviso sin zona resuelta no debe producir "…, undefined" en el atributo
    // que un lector de pantalla va a leer en voz alta.
    expect(photoAltText({ position: 0, total: 1, title: "Anexo", zone: "" })).toBe(
      "Foto 1 de 1 — Anexo",
    );
  });

  /**
   * No hay columna `alt_text`, y es decisión: pedirle a alguien que llena el
   * formulario de pie, con una mano, que describa seis fotografías produce
   * campos vacíos, no accesibilidad. El costo, dicho en vez de escondido: un
   * texto compuesto es más pobre que una descripción real, y se elige porque
   * la alternativa realista no es mejor texto sino ningún texto.
   */
  it("es determinista: la misma foto produce siempre el mismo texto", () => {
    const input = { position: 3, total: 6, title: "Quinta", zone: "El Rosal" };

    expect(photoAltText(input)).toBe(photoAltText(input));
  });
});

describe("photoUrl", () => {
  it("une la base pública con la clave de R2", () => {
    expect(photoUrl("https://fotos.rentas.com.ve", "photos/pub/tok/card.webp")).toBe(
      "https://fotos.rentas.com.ve/photos/pub/tok/card.webp",
    );
  });

  it("tolera una base con barra final, que es como se escribe en un .env", () => {
    // Nadie recuerda si la variable lleva barra. Una URL con `//` en el medio
    // funciona a veces y rompe el caché otras, porque es una URL distinta.
    expect(photoUrl("https://fotos.rentas.com.ve/", "a/b.webp")).toBe(
      "https://fotos.rentas.com.ve/a/b.webp",
    );
  });

  it("refuse una clave vacía en vez de emitir una URL que apunta a la raíz", () => {
    // Una `<img src="https://fotos.rentas.com.ve">` no falla de forma visible:
    // pide la raíz del bucket, recibe cualquier cosa y dibuja un ícono roto.
    expect(() => photoUrl("https://fotos.rentas.com.ve", "")).toThrow();
  });
});
