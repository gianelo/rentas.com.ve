import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PhotoCounter } from "./PhotoCounter";

const counterCss = readFileSync("components/atoms/PhotoCounter.module.css", "utf-8");

describe("PhotoCounter", () => {
  /**
   * "1 / 6", la lectura exacta del artboard 7c — nunca "1/6" ni "1 de 6",
   * que son otro texto para otro lugar (el `alt` de la portada usa "de").
   */
  it("escribe 1 / N con el total que le dan", () => {
    expect(renderToStaticMarkup(<PhotoCounter total={6} />)).toContain("1 / 6");
  });

  it("con un total distinto sigue siendo el mismo cálculo, no un texto fijo", () => {
    expect(renderToStaticMarkup(<PhotoCounter total={1} />)).toContain("1 / 1");
  });

  it("se anuncia una sola vez: aria-hidden, para no repetir lo que ya dice el visor", () => {
    expect(renderToStaticMarkup(<PhotoCounter total={3} />)).toContain('aria-hidden="true"');
  });

  it("lee la pastilla del sistema: fondo --surface, texto --soft, radio --rs", () => {
    expect(counterCss).toContain("background: var(--surface)");
    expect(counterCss).toContain("color: var(--soft)");
    expect(counterCss).toContain("border-radius: var(--rs)");
  });

  it("se ancla a la esquina de la portada, en --card-photocount-fs", () => {
    expect(counterCss).toContain("right: 9px");
    expect(counterCss).toContain("bottom: 9px");
    expect(counterCss).toContain("font-size: var(--card-photocount-fs)");
  });
});
