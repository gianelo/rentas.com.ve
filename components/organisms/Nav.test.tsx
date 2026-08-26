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

describe("Nav — la ficha cede la marca al ←", () => {
  it("con `back`, el ← reemplaza la marca y es un enlace real, no la marca perdida", () => {
    const html = renderToStaticMarkup(
      <Nav
        account={{ kind: "anonymous" }}
        publish={{ bar: { label: "Publicar gratis", emphasis: "accent" }, menu: null }}
        pill={PILL}
        signInHref="/signin"
        back={{ href: "/alquiler/maracaibo", label: "Volver a Maracaibo" }}
      />,
    );

    // Dos aserciones separadas y no un único regex ordenado: el orden en que
    // React serializa los atributos de un elemento es un detalle de
    // implementación de `next/link`, no un contrato de este componente.
    expect(html).toContain('href="/alquiler/maracaibo"');
    expect(html).toContain('aria-label="Volver a Maracaibo"');
    expect(html).not.toContain(">rentas.<");
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
