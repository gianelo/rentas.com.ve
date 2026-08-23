import { readdirSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AppLink } from "./AppLink";

/**
 * **Lo que este archivo protege es el piso, no el techo.**
 *
 * La mejora que `AppLink` trae —navegación de cliente sin recargar el
 * documento— sólo vale si el comportamiento sin JavaScript queda intacto. La
 * F14 lo dice al revés y es la misma frase: el sin-script es la base, y el
 * script se agrega *encima*.
 *
 * Por eso lo que se afirma acá no es que la navegación sea rápida —eso no se
 * puede medir en una prueba de render— sino que **el marcado servido sigue
 * siendo un ancla con su `href`**. Si algún día `next/link` dejara de emitir
 * uno, este test cae, y con él caería la promesa de que una búsqueda filtrada
 * se pega en un grupo de WhatsApp.
 */
describe("AppLink sirve un ancla de verdad", () => {
  it("una ruta interna sale como <a href>, no como un botón ni un span", () => {
    const html = renderToStaticMarkup(<AppLink href="/alquiler/maracaibo">Resultados</AppLink>);

    expect(html).toContain("<a ");
    expect(html).toContain('href="/alquiler/maracaibo"');
    expect(html).toContain("Resultados");
  });

  it("conserva las clases y los atributos que le pasan", () => {
    // Sin esto, envolver los enlaces existentes les habría borrado el estilo y
    // los atributos de accesibilidad que el panel ya tenía puestos.
    const html = renderToStaticMarkup(
      <AppLink href="/publicar" className="x" aria-current="true">
        Publicar
      </AppLink>,
    );

    expect(html).toContain('class="x"');
    expect(html).toContain('aria-current="true"');
  });

  it("un `wa.me` sale como ancla pelada, sin pasar por el router", () => {
    const html = renderToStaticMarkup(
      <AppLink href="https://wa.me/584121234567">Escribir</AppLink>,
    );

    expect(html).toContain('href="https://wa.me/584121234567"');
  });

  it("un ancla de la misma página tampoco pasa por el router", () => {
    const html = renderToStaticMarkup(<AppLink href="#reportar">Reportar</AppLink>);

    expect(html).toContain('href="#reportar"');
  });
});

/**
 * **La guarda contra la próxima ancla pelada.**
 *
 * El trabajo que introdujo `AppLink` convirtió 39 anclas de una sola pasada.
 * Sin esto, la número 40 vuelve a ser un `<a href="/…">` y nadie se entera: la
 * pantalla se dibuja igual, y lo único que cambia es que ese clic recarga el
 * documento entero mientras los demás no. Un defecto que sólo se nota
 * usándolo, y que no rompe ningún test.
 *
 * Se buscan anclas con un `href` que empiece con `/` — las que deberían ser
 * navegación de cliente. Las de protocolo (`wa.me`, `tel:`, `mailto:`) y las
 * de la misma página no entran, que es exactamente lo que `AppLink` decide en
 * tiempo de ejecución.
 */
describe("ningún archivo servido escribe un ancla interna a mano", () => {
  const RAIZ = [join(process.cwd(), "app"), join(process.cwd(), "components")];
  const ANCLA_INTERNA = /<a\s[^>]*href=(?:"\/|\{`\/)/;

  function archivos(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const ruta = join(dir, entry.name);
      if (entry.isDirectory()) return archivos(ruta);
      if (![".tsx", ".ts"].includes(extname(entry.name))) return [];
      // Las pruebas escriben marcado a mano a propósito, y `AppLink` es el
      // único lugar donde el ancla pelada es la implementación y no un olvido.
      if (entry.name.includes(".test.") || entry.name === "AppLink.tsx") return [];
      return [ruta];
    });
  }

  it('usa AppLink en vez de <a href="/…">', () => {
    const culpables = RAIZ.flatMap(archivos)
      .filter((ruta) => ANCLA_INTERNA.test(readFileSync(ruta, "utf8")))
      .map((ruta) => ruta.replace(`${process.cwd()}/`, ""));

    expect(culpables).toEqual([]);
  });
});
