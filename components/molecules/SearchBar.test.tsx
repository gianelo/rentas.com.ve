import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SearchBar } from "./SearchBar";

const barCss = readFileSync("components/molecules/SearchBar.module.css", "utf-8");
const barSource = readFileSync("components/molecules/SearchBar.tsx", "utf-8");

function block(css: string, selector: string): string {
  const match = css.match(new RegExp(`\\.${selector}\\s*\\{([^}]*)\\}`));
  if (!match) throw new Error(`falta el bloque .${selector}`);
  return match[1] ?? "";
}

describe("SearchBar — la barra del inicio", () => {
  it("dibuja el texto que le dan, sin escribir uno propio", () => {
    const html = renderToStaticMarkup(
      <SearchBar label="¿En qué zona buscás?" href="/alquiler/maracaibo" />,
    );

    expect(html).toContain("¿En qué zona buscás?");
    // El texto llega del dominio: escribirlo acá sería una segunda copia que
    // se separaría de la primera en cuanto alguien corrigiera una.
    expect(barSource).not.toContain("En qué zona");
  });

  it("es un enlace a donde el dominio dijo", () => {
    const html = renderToStaticMarkup(
      <SearchBar label="¿En qué zona buscás?" href="/alquiler/maracaibo" />,
    );

    expect(html).toContain('href="/alquiler/maracaibo"');
  });

  /**
   * **Sin destino no es un enlace.** Un ancla vacía o hacia `#` se ve
   * exactamente igual que una que funciona, y quien la toca no llega a ninguna
   * parte — que es el enlace roto que este repositorio ya se negó a publicar
   * dos veces. Cuando el dominio no tiene a dónde mandar, la barra sigue en
   * pantalla como lo que es: una frase.
   */
  it("no dibuja un ancla cuando no hay destino", () => {
    const html = renderToStaticMarkup(<SearchBar label="¿En qué zona buscás?" href={null} />);

    expect(html).toContain("¿En qué zona buscás?");
    expect(html).not.toContain("<a ");
  });

  /**
   * El glifo `◎` de la lámina es decoración: el nombre accesible del enlace ya
   * lo da el texto de al lado, y anunciar un círculo no le agrega nada a quien
   * no lo ve. Es la misma decisión que la flecha de `ListingStrip`.
   */
  it("marca el glifo como decorativo", () => {
    const html = renderToStaticMarkup(<SearchBar label="Buscar" href="/alquiler/maracaibo" />);

    expect(html).toMatch(/aria-hidden="true"/);
  });

  /** El camino de lectura no tiene runtime (D13), y esto lo mantiene así. */
  it("no declara JavaScript de cliente", () => {
    expect(barSource).not.toContain("use client");
  });

  it("tiene foco visible, como todo control del sistema", () => {
    const rule = barCss.match(/\.bar:focus-visible\s*\{([^}]*)\}/);
    const outline = rule?.[1]?.match(/outline:\s*([^;]+);/)?.[1]?.trim();

    expect(outline).toBeDefined();
    expect(outline).not.toBe("none");
  });

  it("es una píldora con su propio alto, que alcanza el objetivo táctil mínimo", () => {
    // La lámina la dibuja redondeada del todo y alta: es el control más grande
    // de la pantalla y el primero que un pulgar busca. El alto es una decisión
    // de esta pieza y tiene token propio — apuntaba a `--target-min` sólo
    // porque el conjunto no nombraba los 50 px dibujados. Que 50 ≥ 44 lo
    // comprueba `design-contract.test.tsx` contra `tokens.css`, no acá.
    expect(block(barCss, "bar")).toContain("border-radius: var(--rs)");
    expect(block(barCss, "bar")).toContain("min-block-size: var(--searchbar-h)");
  });
});
