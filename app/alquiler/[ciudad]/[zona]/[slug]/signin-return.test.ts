import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * **La F19 en una aserción, y existe porque el bug que atrapa no rompe nada.**
 *
 * La ficha emitía `/signin?volver=…` mientras `app/(auth)/signin/page.tsx` sólo
 * lee `callbackUrl`. El parámetro se ignoraba en silencio: la pantalla de
 * entrar se dibujaba igual, quien entraba con Google aterrizaba en `/`, y nada
 * fallaba en ningún lado.
 *
 * Eso rompe *"después de entrar, el usuario vuelve exactamente a la pantalla y
 * al aviso desde donde salió"* — en el paso que el propio documento del
 * fundador llama **el punto de fuga principal** del producto, porque es el
 * único momento en que se le pide algo al inquilino.
 *
 * Se comprueba leyendo los dos archivos en vez de renderizando, a propósito: lo
 * que falló no fue el render sino que **los dos lados usaran el mismo nombre**,
 * y eso es una relación entre archivos, no un comportamiento de uno.
 */
const FICHA = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const SIGNIN = readFileSync(new URL("../../../../(auth)/signin/page.tsx", import.meta.url), "utf8");

describe("volver a la ficha después de entrar (F19)", () => {
  it("la ficha manda el parámetro que la pantalla de entrar realmente lee", () => {
    const emitted = /\/signin\?([a-zA-Z]+)=/.exec(FICHA)?.[1];

    expect(emitted).toBeDefined();
    // Si alguien renombra el parámetro en cualquiera de los dos lados, esto
    // falla — que es lo único que separa este bug de pasar desapercibido.
    expect(SIGNIN).toContain(emitted as string);
  });

  it("la vuelta apunta a la ficha, no a la raíz", () => {
    expect(FICHA).toContain("/alquiler/${ciudad}/${zona}/${slug}");
  });

  it("el parámetro va codificado, porque la ruta lleva barras", () => {
    // Sin codificar, las barras de la ruta se leen como parte de la URL de
    // entrar y el destino se pierde.
    expect(FICHA).toContain("encodeURIComponent");
  });
});
