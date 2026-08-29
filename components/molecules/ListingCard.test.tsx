import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ListingCard, ListingGrid } from "./ListingCard";

const cardCss = readFileSync("components/molecules/ListingCard.module.css", "utf-8");
const tokensCss = readFileSync("src/styles/tokens.css", "utf-8");

function render(overrides: Partial<Parameters<typeof ListingCard>[0]> = {}) {
  return renderToStaticMarkup(
    <ListingCard
      href="/alquiler/distrito-capital/chacao/apartamento-2-habitaciones-abc"
      priceUsd={450}
      title="Apartamento 2 habitaciones"
      zone="Chacao"
      rooms={2}
      areaM2={65}
      publisherType="owner"
      photo={{
        thumbUrl: "https://fotos.rentas.com.ve/photos/pub/tok/thumb.webp",
        cardUrl: "https://fotos.rentas.com.ve/photos/pub/tok/card.webp",
        alt: "Foto 1 de 1 — Apartamento 2 habitaciones, Chacao",
      }}
      {...overrides}
    />,
  );
}

function block(css: string, selector: string): string {
  const match = css.match(new RegExp(`\\.${selector}\\s*\\{([^}]*)\\}`));
  if (!match) throw new Error(`falta el bloque .${selector}`);
  return match[1] ?? "";
}

function tokenValue(name: string): string {
  const match = tokensCss.match(new RegExp(`${name}\\s*:\\s*([^;]+);`));
  if (!match) throw new Error(`falta el token ${name} en tokens.css`);
  return (match[1] ?? "").trim();
}

describe("ListingCard — el precio manda", () => {
  /**
   * Regla transversal 2, y es dura: **el precio va antes del título en orden
   * de documento**. Un lector de pantalla lee el orden del DOM, no el visual,
   * y en un alquiler el precio es el dato que decide si el resto importa.
   */
  it("emite el precio antes del título", () => {
    const markup = render();
    const price = markup.indexOf("$450");
    // Como texto entre etiquetas, no como subcadena: el `alt` de la portada
    // también lleva el título, y buscarlo suelto encontraría ése.
    const title = markup.indexOf(">Apartamento 2 habitaciones<");

    expect(price).toBeGreaterThan(-1);
    expect(title).toBeGreaterThan(price);
  });

  /**
   * Y la otra mitad de la misma regla: **pesa más visualmente**. Se compara la
   * relación entre los tokens y no un número suelto, porque lo que hay que
   * garantizar es que uno sea mayor que el otro en los dos anchos.
   *
   * **Esta aserción no prueba lo que se dibuja, y hoy se sabe por qué.** Su
   * versión anterior afirmaba que `.price` contenía `var(--card-price-fs)` y
   * estuvo verde mientras la tarjeta pintaba 15px: la declaración vivía en el
   * `<p>` que envuelve y el `<span>` de `Price` la pisaba. Lo dibujado lo mide
   * `tests/measure/layout.spec.ts` (21.8) en un navegador de verdad; acá sólo
   * queda la relación entre los dos cuerpos, que sí es una afirmación sobre
   * valores declarados.
   */
  it("declara el precio en un cuerpo mayor que el del título, en los dos anchos", () => {
    // El enganche, no un `font-size`: el átomo es el que dibuja (ver 21.8).
    expect(block(cardCss, "price")).toContain("--price-fs: var(--card-price-fs)");
    expect(block(cardCss, "title")).toContain("var(--card-title-fs)");

    const titulo = Number.parseFloat(tokenValue("--card-title-fs"));
    expect(Number.parseFloat(tokenValue("--card-price-fs"))).toBeGreaterThan(titulo);
    expect(Number.parseFloat(tokenValue("--card-price-fs-desktop"))).toBeGreaterThan(titulo);
  });

  /**
   * **La tarjeta no repinta la tipografía del precio: la delega.** Es la
   * lección del defecto de 21.8 escrita como guardia — un `font-size` en el
   * envoltorio no cambia lo que se ve y hace creer que sí.
   */
  it("no vuelve a declarar la tipografía del precio sobre el átomo", () => {
    const precio = block(cardCss, "price");

    expect(precio).not.toContain("font-size:");
    expect(precio).not.toContain("font-family:");
    expect(precio).not.toContain("font-weight:");
  });
});

describe("ListingCard — quién publica, sin depender del color", () => {
  it.each([
    ["owner", "Dueño"],
    ["broker", "Inmobiliaria"],
  ] as const)("dice %s con palabras, no sólo con un tono", (publisherType, label) => {
    expect(render({ publisherType })).toContain(label);
  });

  /**
   * La distinción es relleno contra borde, y la resuelve `PublisherBadge` —
   * `design-contract.test.tsx` ya prueba que sobrevive a la escala de grises.
   * Lo que se afirma acá es que la tarjeta **reusa** esa placa en vez de
   * dibujar la suya, que es como una regla probada deja de aplicarse en una
   * pantalla nueva.
   */
  it("reusa PublisherBadge en vez de repintar la distinción", () => {
    const source = readFileSync("components/molecules/ListingCard.tsx", "utf-8");

    expect(source).toContain("PublisherBadge");
    expect(cardCss).not.toMatch(/\.(owner|broker)\s*\{/);
  });
});

describe("ListingCard — la portada", () => {
  /**
   * `thumb` (160×120) en el teléfono y `card` (256×192) en el escritorio. Con
   * `<picture>` y un `media`, que el navegador resuelve antes de pedir bytes
   * y sin una línea de JavaScript — la 14.27 dice que el presupuesto es lo que
   * decide si la cuadrícula sobrevive, y mandar la imagen de escritorio a un
   * teléfono es gastarlo dos veces.
   */
  it("pide thumb en móvil y card en escritorio", () => {
    const markup = render();
    const source = markup.match(/<source[^>]*>/)?.[0] ?? "";

    expect(source).toContain('media="(min-width: 768px)"');
    expect(source).toContain("card.webp");
    expect(markup).toContain('src="https://fotos.rentas.com.ve/photos/pub/tok/thumb.webp"');
  });

  /**
   * Diferida, y es la 14.27 en una línea: una cuadrícula de veinte fotos gasta
   * el margen que hoy queda entre los ~128 KB de la página y el tope de 150.
   * Lo que no se ve todavía no se paga.
   */
  it("difiere la descarga de la foto", () => {
    expect(render()).toContain('loading="lazy"');
  });

  it("lleva el texto alternativo que le dieron, sin recomponerlo", () => {
    expect(render()).toContain('alt="Foto 1 de 1 — Apartamento 2 habitaciones, Chacao"');
  });

  /**
   * La proporción la fija el CSS con `aspect-ratio` y no un alto fijo: la
   * columna se encoge por debajo de 158 px en un teléfono angosto, y un alto
   * fijo deformaría la foto justo ahí.
   */
  it("reserva el espacio de la foto por proporción, no por alto fijo", () => {
    expect(block(cardCss, "photo")).toContain("aspect-ratio: var(--card-photo-ratio)");
  });
});

describe("ListingCard — a dónde lleva", () => {
  it("tiene un solo enlace, y su nombre accesible es el título", () => {
    const markup = render();

    // Un enlace por tarjeta: envolver la foto en un segundo `<a>` al mismo
    // destino le da a un lector de pantalla dos paradas para un solo aviso.
    expect(markup.match(/<a /g) ?? []).toHaveLength(1);
    expect(markup).toMatch(
      /<a[^>]*href="\/alquiler\/distrito-capital\/chacao\/apartamento-2-habitaciones-abc"[^>]*>Apartamento 2 habitaciones<\/a>/,
    );
  });

  /**
   * El enlace es el título, pero **el área tocable es la tarjeta entera**: un
   * enlace de dos líneas de texto no llega a 44 px de alto de forma confiable,
   * y errarle en una cuadrícula de dos columnas abre el aviso de al lado.
   */
  it("extiende el área tocable a toda la tarjeta", () => {
    expect(cardCss).toMatch(/\.link::after\s*\{[^}]*inset:\s*0/);
    expect(block(cardCss, "card")).toContain("position: relative");
  });
});

describe("ListingCard — la cuadrícula y sus reglas transversales", () => {
  it("muestra zona, habitaciones y metros en una sola línea de metadatos", () => {
    expect(render()).toContain("Chacao · 2 hab · 65 m²");
  });

  it("no atenúa texto con opacity — el gris es --soft", () => {
    // Regla transversal 3: `opacity` atenúa también el borde y el fondo, y
    // deja el contraste fuera de control.
    expect(cardCss).not.toMatch(/opacity\s*:/);
    expect(block(cardCss, "meta")).toContain("color: var(--soft)");
  });

  it("no ship*a* JavaScript de cliente", () => {
    expect(readFileSync("components/molecules/ListingCard.tsx", "utf-8")).not.toContain(
      '"use client"',
    );
  });
});

/**
 * La cuadrícula viaja con la tarjeta y no con la pantalla que la usa: los
 * anchos de 158 y 254 px **son geometría de la tarjeta**, y dejarlos en la
 * hoja de una página los duplica en la siguiente que dibuje avisos — el
 * inicio de la 14.21 ya es esa siguiente.
 */
describe("ListingGrid", () => {
  it("son dos columnas en móvil y cuatro en escritorio", () => {
    // Cuatro y no tres desde la 14.33: la barra lateral de 240 px se fue y ese
    // ancho es el que gana la lista — «cuatro columnas de 254: 8 avisos sobre
    // el pliegue, contra 6 antes» (lámina 7c).
    //
    // Declarado no es dibujado, y esta afirmación es de las que pueden ser
    // ciertas y ciegas: lo que de verdad se mide son las cajas renderizadas, en
    // `tests/measure/layout.spec.ts` («la cuadrícula gana el ancho de la barra
    // lateral»).
    const base = block(cardCss, "grid");
    const desktop = cardCss.slice(cardCss.indexOf("@media"));

    expect(base).toContain("repeat(2, minmax(0, var(--card-w)))");
    expect(desktop).toContain("repeat(4, minmax(0, var(--card-w-desktop)))");
  });

  /**
   * `minmax(0, …)` y no un ancho fijo: por debajo de 360 px la columna tiene
   * que encogerse, y `grid-template-columns: 158px 158px` desborda la pantalla
   * horizontalmente en un teléfono angosto en vez de apretarse.
   */
  it("deja que la columna se encoja por debajo de su ancho de diseño", () => {
    expect(block(cardCss, "grid")).not.toMatch(/grid-template-columns:\s*repeat\(2,\s*var\(/);
  });

  it("es una lista de verdad, sin viñetas dibujadas", () => {
    const markup = renderToStaticMarkup(
      <ListingGrid>
        <li>uno</li>
      </ListingGrid>,
    );

    expect(markup.startsWith("<ol")).toBe(true);
    expect(block(cardCss, "grid")).toContain("list-style: none");
  });
});
