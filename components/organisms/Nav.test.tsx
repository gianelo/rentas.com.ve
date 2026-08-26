import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Nav } from "./Nav";

const navCss = readFileSync("components/organisms/Nav.module.css", "utf-8");

const PILL = {
  action: "/",
  name: "zona",
  value: "",
  placeholder: "¿En qué zona buscás?",
  submitLabel: "Buscar",
  state: { kind: "empty" as const },
};

/**
 * La navegación (diseño 14a), presente en toda pantalla salvo el flujo de
 * publicar (§7 de esa especificación no menciona un nav — un buscador en
 * medio de un embudo de nueve pasos es una salida justo donde menos
 * conviene) y `/renovar/[token]` (ruta bare, sin estilo, deliberadamente).
 */
describe("Nav — sin sesión", () => {
  const account = { kind: "anonymous" as const };
  const publish = { bar: { label: "Publicar gratis", emphasis: "accent" as const }, menu: null };

  it("Publicar gratis en acento y Entrar, los dos con destino real", () => {
    const html = renderToStaticMarkup(
      <Nav account={account} publish={publish} pill={PILL} signInHref="/signin" />,
    );

    expect(html).toContain("Publicar gratis");
    expect(html).toMatch(/<a[^>]*href="\/publicar"[^>]*>Publicar gratis/);
    expect(html).toMatch(/<a[^>]*href="\/signin"[^>]*>Entrar/);
  });

  it("la marca es un enlace real a «/» y no un botón", () => {
    const html = renderToStaticMarkup(
      <Nav account={account} publish={publish} pill={PILL} signInHref="/signin" />,
    );

    expect(html).toMatch(/<a[^>]*href="\/"[^>]*>rentas\./);
  });

  it('nunca un href="#", en ningún estado', () => {
    const html = renderToStaticMarkup(
      <Nav account={account} publish={publish} pill={PILL} signInHref="/signin" />,
    );

    expect(html).not.toContain('href="#"');
  });
});

describe("Nav — con sesión", () => {
  const account = {
    kind: "authenticated" as const,
    displayName: "María Fernández",
    email: "maria.f@gmail.com",
    initials: "MF",
    imageUrl: null,
    canImportListings: false,
  };
  const publish = {
    bar: { label: "Publicar", emphasis: "outline" as const },
    menu: { label: "Publicar una propiedad", emphasis: "accent" as const },
  };

  it("Publicar queda neutro (contorno) y el control de cuenta lleva a /mis-avisos", () => {
    const html = renderToStaticMarkup(
      <Nav account={account} publish={publish} pill={PILL} signInHref="/signin" />,
    );

    expect(html).toMatch(/<a[^>]*href="\/publicar"[^>]*>Publicar</);
    expect(html).not.toContain("Publicar gratis");
    expect(html).toMatch(/<a[^>]*href="\/mis-avisos"/);
    expect(html).toContain("MF");
  });

  it("agencia y sesión dibujan la MISMA barra (20.4) — la única diferencia es interna al menú, no visible acá", () => {
    const agency = { ...account, canImportListings: true };

    const sessionHtml = renderToStaticMarkup(
      <Nav account={account} publish={publish} pill={PILL} signInHref="/signin" />,
    );
    const agencyHtml = renderToStaticMarkup(
      <Nav account={agency} publish={publish} pill={PILL} signInHref="/signin" />,
    );

    expect(agencyHtml).toBe(sessionHtml);
  });
});

describe("Nav — la ficha cede la marca al enlace de vuelta", () => {
  function ficha(back: { href: string; label: string }) {
    return renderToStaticMarkup(
      <Nav
        account={{ kind: "anonymous" }}
        publish={{ bar: { label: "Publicar gratis", emphasis: "accent" }, menu: null }}
        pill={PILL}
        signInHref="/signin"
        back={back}
      />,
    );
  }

  it("con `back`, el enlace de vuelta reemplaza la marca y es un enlace real", () => {
    const html = ficha({ href: "/alquiler/maracaibo", label: "← Resultados" });

    // Dos aserciones separadas y no un único regex ordenado: el orden en que
    // React serializa los atributos de un elemento es un detalle de
    // implementación de `next/link`, no un contrato de este componente.
    expect(html).toContain('href="/alquiler/maracaibo"');
    expect(html).not.toContain(">rentas.<");
  });

  /**
   * **El texto del enlace se DIBUJA, no se esconde detrás de un `aria-label`.**
   *
   * `resultsLink` (listing-discovery) devuelve dos etiquetas distintas para dos
   * acciones distintas: «← Resultados» cuando hay una búsqueda a la que volver,
   * y «Ver avisos en Chacao» cuando no la hay — y su propio comentario dice que
   * en ese segundo caso «su texto no dice volver». Un `←` solo, con la etiqueta
   * escondida, dibuja las dos iguales: le promete a quien llegó desde Google
   * una vuelta que nunca existió.
   *
   * Las dos láminas de la ficha lo dibujan visible («← Resultados»), así que
   * esto además es lo que el diseño pide.
   */
  it("dibuja el texto de la vuelta, que es el que decide el dominio", () => {
    // `>texto<` y no `toContain(texto)`: la versión suelta también pasaba con
    // el texto escondido dentro de un `aria-label`, que es justo lo que esta
    // prueba tiene que poder distinguir. Mismo defecto que la prueba móvil de
    // `SearchPill` ya corrigió una vez.
    expect(ficha({ href: "/alquiler/x/y", label: "← Resultados" })).toContain(">← Resultados<");
    expect(ficha({ href: "/alquiler/x/y", label: "Ver avisos en Chacao" })).toContain(
      ">Ver avisos en Chacao<",
    );
  });

  /**
   * El nombre accesible sale del texto. Un `aria-label` encima lo pisaría con
   * una segunda copia de la misma frase, que es cómo empiezan a discrepar.
   */
  it("no duplica el nombre accesible en un aria-label", () => {
    expect(ficha({ href: "/alquiler/x/y", label: "← Resultados" })).not.toContain('aria-label="←');
  });
});

describe("Nav — geometría de escritorio (14a: 250 / 420 / 250)", () => {
  it("las dos columnas laterales fijas están en la hoja de estilos — la del medio la da la pastilla (SearchPill)", () => {
    expect(navCss).toMatch(/grid-template-columns:\s*250px\s+1fr\s+250px/);
  });

  it("con sesión, Publicar se esconde en móvil — se muda al menú (14.38)", () => {
    expect(navCss).toMatch(/@media[^{]*\{[\s\S]*publishAuth[\s\S]*display:\s*none/);
  });
});
