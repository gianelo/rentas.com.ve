import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Switch } from "./Switch";

const css = readFileSync("components/atoms/Switch.module.css", "utf-8");

describe("Switch", () => {
  it("es decorativo: aria-hidden, sin rol interactivo propio", () => {
    const markup = renderToStaticMarkup(<Switch on={false} />);

    expect(markup).toContain('aria-hidden="true"');
    expect(markup).not.toContain('role="switch"');
    expect(markup).not.toContain("<button");
    expect(markup).not.toContain("<input");
  });

  it("apagado y encendido se distinguen en el marcado, no sólo en un color", () => {
    const apagado = renderToStaticMarkup(<Switch on={false} />);
    const encendido = renderToStaticMarkup(<Switch on />);

    expect(apagado).not.toContain("data-on");
    expect(encendido).toContain("data-on");
  });

  it("track y perilla son 44×26 y 20×20, tal como dibuja la lámina 7b", () => {
    const track = css.match(/\.track\s*\{([^}]*)\}/)?.[1] ?? "";
    const knob = css.match(/\.knob\s*\{([^}]*)\}/)?.[1] ?? "";

    expect(track).toContain("inline-size: 44px");
    expect(track).toContain("block-size: 26px");
    expect(knob).toContain("inline-size: 20px");
    expect(knob).toContain("block-size: 20px");
  });

  it("no escribe un radio literal: usa el token de pastilla del sistema (lint:tokens, D16)", () => {
    // `lint-tokens.mjs` ya prueba que ningún literal de radio se escribe en
    // `.module.css`; acá se afirma la mitad positiva — que el track y la
    // perilla leen el mismo token que `PhotoCounter`/`SearchPill` — sin
    // repetir el literal prohibido ni en un comentario de esta prueba.
    const track = css.match(/\.track\s*\{([^}]*)\}/)?.[1] ?? "";
    const knob = css.match(/\.knob\s*\{([^}]*)\}/)?.[1] ?? "";

    expect(track).toContain("border-radius: var(--rs)");
    expect(knob).toContain("border-radius: var(--rs)");
  });
});
