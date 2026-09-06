import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * **El papel propio de la puerta de entrar, medido en la hoja y no en el
 * ojo** (tasks.md 22.25). `lint:tokens` sale en 0 tanto si el `<h1>` usa
 * `--door-title-fs` como si vuelve a usar `--title-fs`: las dos son
 * propiedades personalizadas válidas, y sólo el NOMBRE del token distingue
 * el papel propio de esta pantalla de la deriva que `SISTEMA.md` prohíbe.
 *
 * DESBLOQUEADO 2026-09-05 — manda la lámina (rama 1 del encabezado de la
 * fase 22): la 8a y la 9a se quedan con 22/28 y 56/72, y son tokens propios
 * de esta pantalla, no `--title-fs`/`--nav-h` con otro número.
 */
const css = readFileSync("app/(auth)/signin/signin.module.css", "utf-8");
const tokensCss = readFileSync("src/styles/tokens.css", "utf-8");

function tokenValue(name: string): string {
  const match = tokensCss.match(new RegExp(`${name}\\s*:\\s*([^;]+);`));
  if (!match?.[1]) throw new Error(`tokens.css: "${name}" no está declarado`);
  return match[1].trim();
}

describe("la puerta de entrar dibuja su propio papel de encabezado y barra (22.25)", () => {
  it("el <h1> usa --door-title-fs y no --title-fs", () => {
    expect(css).toContain("var(--door-title-fs)");
    expect(css).not.toContain("var(--title-fs)");
  });

  it("a 768px el <h1> pasa a --door-title-fs-desktop", () => {
    expect(css).toContain("var(--door-title-fs-desktop)");
  });

  it("la barra usa --door-bar-h y no --nav-h", () => {
    expect(css).toContain("var(--door-bar-h)");
    expect(css).not.toContain("var(--nav-h)");
  });

  it("a 768px la barra pasa a --door-bar-h-desktop", () => {
    expect(css).toContain("var(--door-bar-h-desktop)");
  });

  it("los cuatro tokens propios valen lo que dibujan las láminas 8a/9a", () => {
    expect(tokenValue("--door-title-fs")).toBe("22px");
    expect(tokenValue("--door-title-fs-desktop")).toBe("28px");
    expect(tokenValue("--door-bar-h")).toBe("56px");
    expect(tokenValue("--door-bar-h-desktop")).toBe("72px");
  });
});
