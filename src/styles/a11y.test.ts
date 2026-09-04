import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * `.srOnly` vive en un solo lugar (tasks.md 22.7).
 *
 * Estaba declarada cinco veces —cuatro con el mismo cuerpo de nueve
 * propiedades y una, `visor.module.css`, ya divergida (le faltaban
 * `margin`, `padding` y `border`)— porque no había un módulo compartido
 * entre `app/` y `components/` para una sola utilidad de accesibilidad.
 * Ninguna prueba de comportamiento distingue las dos formas: las cinco
 * pintan lo mismo en pantalla, completa o incompleta, porque
 * `clip-path: inset(50%)` ya recorta el elemento a nada visible. La
 * única evidencia honesta de que la deriva se cerró es el texto de las
 * hojas — el mismo criterio que ya usa `components/design-contract.test.tsx`
 * para leer `scripts/lint-tokens.mjs` y `src/styles/tokens.css`.
 */
const SHARED_PATH = "src/styles/a11y.module.css";

const SR_ONLY_PROPERTIES = [
  "position: absolute",
  "inline-size: 1px",
  "block-size: 1px",
  "margin: -1px",
  "padding: 0",
  "overflow: hidden",
  "clip-path: inset(50%)",
  "white-space: nowrap",
  "border: 0",
];

const CONSUMERS = [
  { path: "app/home.module.css", from: "../src/styles/a11y.module.css" },
  {
    path: "app/publicar/publish-steps.module.css",
    from: "../../src/styles/a11y.module.css",
  },
  {
    path: "components/molecules/SearchPill.module.css",
    from: "../../src/styles/a11y.module.css",
  },
  {
    path: "app/alquiler/[ciudad]/[zona]/[slug]/foto/[n]/visor.module.css",
    from: "../../../../../../../src/styles/a11y.module.css",
  },
  {
    path: "components/client/SearchSuggestions.module.css",
    from: "../../src/styles/a11y.module.css",
  },
];

describe("srOnly compartido (22.7)", () => {
  it(`${SHARED_PATH} declara el cuerpo completo una sola vez`, () => {
    const css = readFileSync(SHARED_PATH, "utf-8");
    const blocks = css.match(/\.srOnly\s*\{[^}]*\}/g);

    expect(blocks).toHaveLength(1);
    for (const property of SR_ONLY_PROPERTIES) {
      expect(blocks?.[0]).toContain(property);
    }
  });

  it.each(CONSUMERS)(
    "$path compone srOnly del módulo compartido y no repite el cuerpo",
    ({ path, from }) => {
      const css = readFileSync(path, "utf-8");

      expect(css).toContain(`composes: srOnly from "${from}"`);
      // El par de la negativa: sin esto, agregar el `composes` sin quitar
      // el cuerpo viejo dejaría la prueba en verde con la duplicación viva.
      expect(css).not.toMatch(/\.srOnly\s*\{[^}]*position:\s*absolute/);
    },
  );
});
