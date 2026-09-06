import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SelectionChip } from "./SelectionChip";

const css = readFileSync("components/atoms/SelectionChip.module.css", "utf-8");

describe("SelectionChip", () => {
  it("es un enlace a la dirección que le dan, con su texto", () => {
    const markup = renderToStaticMarkup(
      <SelectionChip href="/alquiler/maracaibo" selected={false} ariaCurrent="true">
        Maracaibo
      </SelectionChip>,
    );

    expect(markup).toContain('href="/alquiler/maracaibo"');
    expect(markup).toContain(">Maracaibo<");
  });

  it("sin elegir no lleva aria-current, aunque el documento use aria-current=page", () => {
    const markup = renderToStaticMarkup(
      <SelectionChip href="/mis-avisos" selected={false} ariaCurrent="page">
        Activa
      </SelectionChip>,
    );

    expect(markup).not.toContain("aria-current");
  });

  /**
   * El valor de `aria-current` lo decide quien llama, no el átomo: el inicio
   * quita la ciudad al tocarla (no es "la página en la que estás", manda
   * "true") y `/mis-avisos` sí filtra la misma pantalla (manda "page").
   */
  it.each([
    ["true", "true"],
    ["page", "page"],
  ] as const)("elegida con ariaCurrent=%s emite aria-current=%s", (ariaCurrent, esperado) => {
    const markup = renderToStaticMarkup(
      <SelectionChip href="/x" selected ariaCurrent={ariaCurrent}>
        X
      </SelectionChip>,
    );

    expect(markup).toContain(`aria-current="${esperado}"`);
  });

  it("declara sólo dos clases, sin un tercer estado a medio camino", () => {
    const sinElegir = renderToStaticMarkup(
      <SelectionChip href="/x" selected={false} ariaCurrent="true">
        X
      </SelectionChip>,
    ).match(/class="([^"]*)"/)?.[1];
    const elegida = renderToStaticMarkup(
      <SelectionChip href="/x" selected ariaCurrent="true">
        X
      </SelectionChip>,
    ).match(/class="([^"]*)"/)?.[1];

    expect(sinElegir?.split(" ")).toHaveLength(1);
    expect(elegida?.split(" ")).toHaveLength(1);
    expect(elegida).not.toBe(sinElegir);
  });

  it("lee el nivel 2 de la jerarquía de botones cuando está elegida", () => {
    // El primer `.selected {` es el bloque compartido con `.chip`; el propio
    // es el segundo bloque declarado con ese selector en solitario.
    const bloques = [...css.matchAll(/(?:^|\n)\.selected\s*\{([^}]*)\}/g)];
    const propio = bloques[bloques.length - 1]?.[1] ?? "";

    expect(propio).toContain("background: var(--tint)");
    expect(propio).toContain("border: 1px solid var(--accent)");
    expect(propio).toContain("color: var(--accent)");
  });

  it("converge a la tipografía del inicio (--meta, mono) y no a la de /mis-avisos", () => {
    expect(css).toContain("font-family: var(--meta)");
    expect(css).toContain("font-size: var(--meta-fs-sm)");
    expect(css).not.toContain("var(--control-fs)");
  });
});
