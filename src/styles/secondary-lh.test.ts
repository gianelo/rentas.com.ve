import { readdirSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * `--secondary-lh`: «texto secundario cómodo de leer» tiene su propio
 * interlineado (tasks.md 22.33).
 *
 * `--ficha-body-lh` vestía texto que no es el cuerpo: cualquier declaración
 * cuyo tamaño es `--meta-fs` o `--control-fs` pero cuyo interlineado es
 * `--ficha-body-lh` es media pareja — el par real es tamaño+interlineado del
 * CUERPO, y acá sólo viajaba la mitad. El recuento del plan (22.33, sobre la
 * 16.38) nombraba cinco declaraciones así; **verificado contra el árbol de
 * trabajo aparecieron ocho** — las tres de más son `.lead` en
 * `revisa-tu-correo/espera.module.css`, `.reason` en `(auth)/signin/
 * signin.module.css` y `.textarea` en `publish-steps.module.css` (que
 * inicialmente dependía de `font-size: var(--control-fs)` heredado de
 * `.control`, la clase con la que siempre se combina en el marcado — 22.46
 * le dio su propio `font-size` para no depender de esa combinación). Las
 * tres tienen la forma exacta que este archivo describe y no las nombraba
 * la lista original.
 */
const TOKENS_PATH = "src/styles/tokens.css";

const SECONDARY_LOCATIONS = [
  { path: "components/molecules/ContactBlock.module.css", selector: ".why" },
  { path: "components/molecules/ContactBlock.module.css", selector: ".expiredText" },
  {
    // "El recuadro de las 154" que nombra la tarea 22.33: la advertencia con
    // borde, `.warning`.
    path: "components/molecules/ContactBlock.module.css",
    selector: ".warning",
  },
  { path: "components/molecules/DeclaredFeatures.module.css", selector: ".note" },
  { path: "components/organisms/SignInDoor.module.css", selector: ".reason" },
  {
    path: "app/(auth)/signin/revisa-tu-correo/espera.module.css",
    selector: ".lead",
  },
  { path: "app/(auth)/signin/signin.module.css", selector: ".reason" },
  { path: "app/publicar/publish-steps.module.css", selector: ".textarea" },
];

/**
 * Extracts the raw declaration body of EVERY `selector { ... }` block
 * (22.45: the single-match version only ever read the FIRST block, so a
 * redeclaration further down the same file went unread).
 */
function extractBlocks(cssText: string, selector: string): string[] {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, "g");
  return [...cssText.matchAll(pattern)].map((match) => match[1] ?? "");
}

describe("--secondary-lh reemplaza a --ficha-body-lh en texto que no es el cuerpo (22.33)", () => {
  it(`${TOKENS_PATH} declara --secondary-lh`, () => {
    const css = readFileSync(TOKENS_PATH, "utf-8");
    expect(css).toContain("--secondary-lh: 1.6;");
  });

  it.each(SECONDARY_LOCATIONS)(
    "$path $selector lee --secondary-lh y no --ficha-body-lh en TODOS sus bloques",
    ({ path, selector }) => {
      const css = readFileSync(path, "utf-8");
      const blocks = extractBlocks(css, selector);

      // 22.45: recorrer todos los bloques y no sólo el primero — una
      // redeclaración posterior del mismo selector quedaba sin leer.
      expect(blocks.length).toBeGreaterThan(0);
      for (const block of blocks) {
        expect(block).toContain("var(--secondary-lh)");
        expect(block).not.toContain("var(--ficha-body-lh)");
      }
    },
  );

  it("app/publicar/publish-steps.module.css .textarea declara su propio font-size (22.46)", () => {
    // La media pareja de .textarea no dependía de su cuerpo sino del marcado
    // que siempre la combina con .control — esta aserción cierra esa
    // dependencia dándole el tamaño a la propia clase.
    const css = readFileSync("app/publicar/publish-steps.module.css", "utf-8");
    const blocks = extractBlocks(css, ".textarea");

    expect(blocks.length).toBeGreaterThan(0);
    for (const block of blocks) {
      // La propia hoja trae un comentario que MENCIONA `var(--control-fs)`
      // entre backticks sin punto y coma — `toContain` sobre el texto crudo
      // pasaría igual leyendo sólo el comentario. Se exige la declaración
      // real, con su punto y coma, para no medir la prosa.
      expect(block).toMatch(/font-size:\s*var\(--control-fs\);/);
    }
  });

  it("ninguna hoja de componente combina --meta-fs o --control-fs con --ficha-body-lh (guarda contra la deriva)", () => {
    const roots = ["app", "components"];
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (extname(entry.name) === ".css") files.push(full);
      }
    };
    for (const root of roots) walk(root);

    const offenders: string[] = [];
    for (const file of files) {
      const css = readFileSync(file, "utf-8");
      const blocks = css.match(/\{[^}]*\}/g) ?? [];
      for (const block of blocks) {
        const hasSecondaryFs =
          block.includes("var(--meta-fs)") || block.includes("var(--control-fs)");
        // 22.41: comparar sólo contra el literal móvil dejaba pasar
        // `var(--ficha-body-lh-desktop)`, que es exactamente la forma que la
        // media pareja tomaría en escritorio — el paso de escritorio existe
        // (tokens.css) y seis hojas ya lo leen dentro de un `@media`.
        const hasBodyLh =
          block.includes("var(--ficha-body-lh)") || block.includes("var(--ficha-body-lh-desktop)");
        if (hasSecondaryFs && hasBodyLh) offenders.push(`${file}: ${block.trim()}`);
      }
    }

    expect(offenders).toEqual([]);
  });
});
