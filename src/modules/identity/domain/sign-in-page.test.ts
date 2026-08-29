import { describe, expect, it } from "vitest";
import { contactDoorFor } from "@/modules/contact-reveal/domain/sign-in-door";
import { signInPageFor } from "./sign-in-page";

const FICHA = "/alquiler/distrito-capital/chacao/apartamento-2h";

describe("la pantalla de entrar dice por qué puerta se entró (15.7)", () => {
  it("la puerta de publicar dice para qué es y trae los tres pasos de la lámina", () => {
    const pagina = signInPageFor("/publicar");

    expect(pagina.title).toBe("Entrá para publicar tu propiedad");
    expect(pagina.steps).toEqual([
      "Llenás los datos de la propiedad: zona, precio, habitaciones.",
      "Subís las fotos, que comprimimos en tu navegador antes de mandarlas.",
      "Verificás tu teléfono por WhatsApp y el aviso queda activo 30 días.",
    ]);
    expect(pagina.aside).toBe("Si ya tenés cuenta, el mismo botón te lleva a tus publicaciones.");
    expect(pagina.returnTo).toBe("/publicar");
    // Un paso cuelga de la misma puerta, y la vuelta es al paso.
    expect(signInPageFor("/publicar/paso/fotos").returnTo).toBe("/publicar/paso/fotos");
  });

  /**
   * **La misma frase que la hoja, comparada por valor.** Son dos formas de una
   * sola puerta, y dos copias de una frase de producto es cómo una se retipea
   * de memoria. Se afirma acá y no leyendo los dos fuentes: comparar el texto
   * de un archivo queda verde con la frase en un comentario (trampa 1).
   */
  it("sobre un aviso dice la misma razón que la hoja de la ficha, palabra por palabra", () => {
    const hoja = contactDoorFor(
      { state: "locked", method: "whatsapp" },
      { type: "owner", name: "María F." },
      "si",
    );
    const pagina = signInPageFor(FICHA);

    expect(pagina.reason).toBe(hoja?.reason);
    expect(pagina.assurance).toBe(hoja?.assurance);
    expect(pagina.title).toBe("Entrá y volvés a este aviso");
  });

  /** La salida visible: mirar un aviso nunca costó una cuenta (F20). */
  it("la salida vuelve al aviso cuando se vino de un aviso, y a los avisos cuando no", () => {
    expect(signInPageFor(FICHA).wayOut).toEqual({ href: FICHA, label: "← Volver al aviso" });
    expect(signInPageFor("/publicar").wayOut).toEqual({
      href: "/",
      label: "← Volver a los avisos",
    });
  });

  /** Ni `/mis-avisos` ni `/importar` publican nada: prometerles los tres pasos
   * de publicar sería dibujar un camino que esa puerta no recorre. */
  it.each([
    ["mis avisos", "/mis-avisos"],
    ["importar cartera", "/importar"],
  ])("la puerta de %s entra a la cuenta y no promete los pasos de publicar", (_caso, destino) => {
    const pagina = signInPageFor(destino);

    expect(pagina.title).toBe("Entrá a tu cuenta");
    expect(pagina.steps).toEqual([]);
    expect(pagina.aside).toBeNull();
    expect(pagina.returnTo).toBe(destino);
  });

  /** **Falla cerrado** (§7): el destino llega en la barra de direcciones, y sin
   * esto la pantalla reemitiría la ruta hostil con el enlace viéndose nuestro. */
  it.each([
    ["otro origen escrito completo", "https://evil.test/publicar"],
    ["el origen relativo al protocolo", "//evil.test/publicar"],
    ["el inicio, que la F19 prohíbe por su nombre", "/"],
    ["una ruta interna que no es una puerta", "/terminos"],
    ["la propia pantalla de entrar, que sería un bucle", "/signin"],
    ["un prefijo que sólo se le parece", "/publicarx"],
    ["el campo vacío", ""],
    ["basura que ni siquiera parsea", "://"],
    // El arreglo es lo que Next entrega con el parámetro repetido.
    ["el parámetro repetido", ["/publicar", "/mis-avisos"]],
    ["el parámetro ausente", undefined],
  ])("descarta %s y entra a la cuenta sin destino", (_caso, candidato) => {
    const pagina = signInPageFor(candidato);

    expect(pagina.returnTo).toBeNull();
    expect(pagina.title).toBe("Entrá a tu cuenta");
  });

  /**
   * **La mitad de la lámina que la 15.7 dejó sin dibujar** (22.22, láminas 8a
   * y 9a): debajo del botón de Google va el separador, el campo y su botón.
   *
   * Es la misma para las cuatro puertas y se afirma así: entrar por correo no
   * cambia porque se venga de un aviso o de publicar, y una copia que variara
   * por puerta sería otra frase que mantener en cuatro lugares.
   */
  it("debajo de Google pide el enlace por correo, con la misma copia en las cuatro puertas", () => {
    const pagina = signInPageFor("/publicar");

    expect(pagina.email).toEqual({
      separator: "o con tu correo",
      label: "Correo",
      placeholder: "tucorreo@ejemplo.com",
      // 8a dice «Enviarme el enlace» y 9a «Enviar enlace»: las dos son ciertas
      // en los dos anchos, así que la regla de la 22.26 no elige. Se toma la
      // que dice qué se recibe y no sólo qué se aprieta (ver 22.27).
      submit: "Enviarme el enlace",
      note: "Te mandamos un enlace que te deja entrar. No manejamos contraseñas.",
    });

    const bloques = [FICHA, "/publicar", "/mis-avisos", "/importar", undefined].map(
      (d) => signInPageFor(d).email,
    );
    expect(new Set(bloques.map((b) => JSON.stringify(b))).size).toBe(1);
  });

  it("la línea legal es una sola y dice que Rentas no participa en el trato", () => {
    const legales = [FICHA, "/publicar", "/mis-avisos", undefined].map(
      (d) => signInPageFor(d).legal,
    );

    expect(new Set(legales).size).toBe(1);
    expect(legales[0]).toBe(
      "Al entrar aceptás los términos y la privacidad. Rentas no participa en el trato: no cobramos comisión, no retenemos pagos y no redactamos contratos.",
    );
  });
});
