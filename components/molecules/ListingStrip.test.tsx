import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ListingStrip, type ListingStripProps } from "./ListingStrip";

const stripCss = readFileSync("components/molecules/ListingStrip.module.css", "utf-8");
const stripSource = readFileSync("components/molecules/ListingStrip.tsx", "utf-8");

function card(id: string) {
  return {
    id,
    href: `/alquiler/distrito-capital/chacao/apartamento-${id}`,
    priceUsd: 350,
    title: `Apartamento ${id}`,
    zoneName: "Chacao",
    rooms: 2,
    areaM2: 65,
    publisherType: "owner" as const,
    photo: {
      thumbUrl: "https://fotos.rentas.com.ve/t.webp",
      cardUrl: "https://fotos.rentas.com.ve/c.webp",
      alt: `Foto 1 de 1 — Apartamento ${id}, Chacao`,
    },
  };
}

function render(overrides: Partial<ListingStripProps> = {}) {
  return renderToStaticMarkup(
    <ListingStrip
      stripKey="ciudad:dc"
      title="Distrito Capital"
      subtitle={null}
      cards={[card("a"), card("b"), card("c"), card("d"), card("e")]}
      seeAll={{ href: "/alquiler/distrito-capital", label: "Ver los 23" }}
      {...overrides}
    />,
  );
}

function block(css: string, selector: string): string {
  const match = css.match(new RegExp(`\\.${selector}\\s*\\{([^}]*)\\}`));
  if (!match) throw new Error(`falta el bloque .${selector}`);
  return match[1] ?? "";
}

/** El bloque de escritorio: todo lo que hay después del punto de quiebre. */
function desktop(): string {
  const at = stripCss.indexOf("@media (min-width: 768px)");
  if (at === -1) throw new Error("falta el punto de quiebre de 768px");
  return stripCss.slice(at);
}

function desktopBlock(selector: string): string {
  return block(desktop(), selector);
}

describe("ListingStrip — un solo componente, dos mecanismos", () => {
  /**
   * **La razón por la que esto es una prueba y no una convención.** El
   * `SearchFilters` ya la escribió: dos implementaciones de la misma pantalla
   * arrancan idénticas y se separan en el primer arreglo apurado. Acá el costo
   * sería peor que allá — cada mitad tendría su propia idea de cuántas
   * tarjetas hay y a dónde lleva la placa.
   */
  it("no tiene un gemelo de escritorio ni de móvil", () => {
    const twins = ["ListingStripDesktop", "ListingStripMobile", "ListingRail", "ListingCarousel"];

    for (const twin of twins) {
      expect(stripSource).not.toContain(twin);
    }
  });

  it("cambia de mecanismo en el mismo punto de quiebre que el resto del proyecto", () => {
    // 768px es el corte que ya usan `ListingCard` y `ListingGrid`. Un tercer
    // punto de quiebre haría que la tarjeta cambiara de tamaño en un ancho y
    // la tira de mecanismo en otro.
    expect(stripCss).toContain("@media (min-width: 768px)");
    expect(stripCss.match(/@media/g) ?? []).toHaveLength(1);
  });

  /**
   * **Móvil: un riel que se arrastra, y lo resuelve el navegador.** El anclaje
   * es `scroll-snap-type` nativo — el camino de lectura no embarca JavaScript
   * (D13), y un carrusel con script sería la primera línea de cliente en toda
   * la ruta de lectura.
   */
  it("en móvil desplaza en horizontal con anclaje nativo", () => {
    const rail = block(stripCss, "rail");

    expect(rail).toContain("overflow-x: auto");
    expect(rail).toContain("scroll-snap-type: x mandatory");
    expect(block(stripCss, "item")).toContain("scroll-snap-align: start");
  });

  /** Escritorio: una fila fija de cinco, sin nada que arrastrar. */
  it("en escritorio es una fila fija de cinco y deja de desplazarse", () => {
    const rail = desktopBlock("rail");

    expect(rail).toMatch(/grid-template-columns:\s*repeat\(5,/);
    expect(rail).toContain("overflow-x: visible");
    expect(rail).toContain("scroll-snap-type: none");
  });

  it("no embarca JavaScript de cliente", () => {
    expect(stripSource).not.toContain('"use client"');
  });
});

describe("ListingStrip — la salida a la colección entera", () => {
  /**
   * Los dos mecanismos que la 14.26 pide existen los dos en el DOM y el CSS
   * expone **exactamente uno** por ancho. `display: none` saca al otro también
   * del árbol de accesibilidad, así que nadie escucha dos veces la misma
   * salida — que es lo que pasaría escondiéndolo con `visibility` o con un
   * `sr-only`.
   */
  it("en móvil la placa va al final del riel y el encabezado no lleva enlace", () => {
    expect(block(stripCss, "plate")).not.toContain("display: none");
    expect(block(stripCss, "headLink")).toContain("display: none");
  });

  it("en escritorio el enlace sube al encabezado y la placa desaparece", () => {
    expect(desktopBlock("plate")).toContain("display: none");
    expect(desktopBlock("headLink")).not.toContain("display: none");
  });

  it("la placa es el último elemento del riel, después de las cinco tarjetas", () => {
    const markup = render();
    const lastCard = markup.lastIndexOf("listing-card");
    const plate = markup.indexOf("strip-plate");

    expect(plate).toBeGreaterThan(lastCard);
  });

  it("los dos llevan el mismo texto y la misma dirección", () => {
    const markup = render();

    expect(markup.match(/Ver los 23/g) ?? []).toHaveLength(2);
    expect(markup.match(/href="\/alquiler\/distrito-capital"/g) ?? []).toHaveLength(2);
  });

  /**
   * El texto llega compuesto por el dominio y no se retoca: "Ver los 23" es una
   * regla de producto — el número tiene que ser el de la colección — y
   * recomponerlo acá la derogaría en silencio, que es justo lo que pasaría al
   * escribir `Ver los ${cards.length}`.
   */
  it("no compone el texto de la placa a partir de lo que dibuja", () => {
    // Se mira el código y no el marcado: el marcado saldría idéntico
    // componiendo el texto acá, que es precisamente el error que no puede
    // volver a entrar.
    const code = stripSource.slice(stripSource.indexOf("export function ListingStrip"));

    expect(code).toContain("seeAll.label");
    expect(code).not.toMatch(/Ver\s+(los|todos)/);
    expect(code).not.toMatch(/cards\.length/);
  });

  it("sin salida no dibuja ni placa ni enlace de encabezado", () => {
    const markup = render({ seeAll: null });

    expect(markup).not.toContain("strip-plate");
    expect(markup).not.toContain("strip-head-link");
    // Los únicos enlaces que quedan son los de las tarjetas: uno por aviso.
    expect(markup.match(/<a /g) ?? []).toHaveLength(5);
  });
});

describe("ListingStrip — lo que reusa y lo que no repinta", () => {
  it("dibuja una ListingCard por aviso en vez de su propia tarjeta", () => {
    const markup = render();

    expect(markup.match(/data-testid="listing-card"/g) ?? []).toHaveLength(5);
    expect(stripSource).toContain("ListingCard");
  });

  it("conserva el orden que le dieron", () => {
    const markup = render({ cards: [card("tres"), card("uno"), card("dos")] });
    const positions = ["tres", "uno", "dos"].map((id) => markup.indexOf(`Apartamento ${id}`));

    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  /**
   * Ninguna regla de producto acá: la tira no decide si se dibuja, ni cuántas
   * tarjetas hay, ni si lleva placa. Todo eso vive en `home-collections.ts`, y
   * un número literal en este archivo sería el primer paso de vuelta.
   */
  it("no lleva un umbral ni un conteo escrito", () => {
    expect(stripSource).not.toMatch(/length\s*[<>=]/);
    expect(stripSource).not.toMatch(/\.filter\(/);
  });
});

describe("ListingStrip — cómo se anuncia", () => {
  it("es una sección con nombre, y su nombre es el encabezado", () => {
    const markup = render();
    const labelledBy = markup.match(/aria-labelledby="([^"]+)"/)?.[1];

    expect(labelledBy).toBeDefined();
    expect(markup).toMatch(new RegExp(`<h2[^>]*id="${labelledBy}"[^>]*>Distrito Capital</h2>`));
  });

  it("dos tiras en la misma página no comparten el id de su encabezado", () => {
    const dc = render({ stripKey: "ciudad:dc", title: "Distrito Capital" });
    const budget = render({ stripKey: "presupuesto", title: "Hasta $400" });

    expect(dc.match(/id="([^"]+)"/)?.[1]).not.toBe(budget.match(/id="([^"]+)"/)?.[1]);
  });

  it("el riel es una lista de verdad, sin viñetas dibujadas", () => {
    expect(render().includes("<ol")).toBe(true);
    expect(block(stripCss, "rail")).toContain("list-style: none");
  });

  it("no atenúa texto con opacity — el gris del sistema es --soft", () => {
    expect(stripCss).not.toMatch(/opacity\s*:/);
  });
});

/**
 * **El subtítulo de conteo, y de dónde sale su número.**
 *
 * «23 avisos activos en cuatro zonas.» llega compuesto desde
 * `home-collections.ts`. Este componente no lo arma ni decide qué tira lo
 * lleva: si lo compusiera acá, el número sería el de las tarjetas dibujadas —
 * cinco en toda tira llena — y la frase diría algo que ya está a la vista.
 */
describe("ListingStrip — el subtítulo de conteo", () => {
  it("dibuja la línea que le dan, debajo del encabezado", () => {
    const markup = render({ subtitle: "23 avisos activos en cuatro zonas." });

    expect(markup).toContain("23 avisos activos en cuatro zonas.");
    // Debajo del encabezado y encima del riel: el orden del documento es el
    // orden en que se lee, también para un lector de pantalla.
    expect(markup.indexOf("</h2>")).toBeLessThan(markup.indexOf("23 avisos"));
    expect(markup.indexOf("23 avisos")).toBeLessThan(markup.indexOf("<ol"));
  });

  it("no deja un renglón vacío cuando la tira no tiene nada que contar", () => {
    const markup = render({ subtitle: null });

    // Un `<p>` vacío separa el encabezado del riel con un hueco que se lee
    // como un error de maquetado, no como una tira sin subtítulo.
    expect(markup).not.toMatch(/<p[^>]*><\/p>/);
    expect(markup).not.toContain("avisos activos");
  });

  /**
   * El número NO se compone acá. La prueba mira el archivo y no el render
   * porque lo que hay que impedir es que alguien lo escriba, no un valor
   * concreto: `cards.length` dentro de una plantilla de texto sería la regla
   * transversal derogada en silencio.
   */
  it("no compone ningún conteo por su cuenta", () => {
    // Se dibuja tal cual llega, sin interpolar nada dentro.
    expect(stripSource).toContain("{subtitle}");
    expect(stripSource).not.toMatch(/cards\.length/);
  });
});
