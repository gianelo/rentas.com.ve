import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

/**
 * **El gate de tokens, probado corriéndolo** (tasks.md 14.48).
 *
 * `scripts/lint-tokens.mjs` no tenía prueba propia, y esa ausencia es parte de
 * por qué el hueco duró: un gate sin prueba puede dejar de comprobar sin que
 * nada se ponga rojo. No se importan sus funciones —`tsconfig` tiene
 * `allowJs: false`, que es exactamente la razón por la que `components/contrast.ts`
 * duplica sus ayudantes en vez de importarlos— así que se **ejecuta** contra un
 * árbol de mentira: un `src/styles/tokens.css` y una hoja de componente
 * escritos para el caso. Correrlo es además lo único que prueba el gate
 * entero, incluido su código de salida.
 */
const LINTER = resolve("scripts/lint-tokens.mjs");

/**
 * Los dos bloques de tema que el chequeo 1b.4 exige, con valores distintos.
 * Toda hoja de mentira lee `var(--ink)`: **el chequeo de usos alcanza también a
 * los tokens de tema**, así que un `--ink` que nadie leyera rompería el gate y
 * la prueba estaría midiendo el andamio en vez del caso.
 */
const THEMES = `[data-theme="menta"] { --ink: #1e2022; }
[data-theme="oscuro"] { --ink: #f2f3f3; }
`;

const READS_INK = "color: var(--ink);";

let workspace: string | null = null;

function run(tokensCss: string, sheet: string): { code: number; output: string } {
  workspace = mkdtempSync(join(tmpdir(), "lint-tokens-"));
  mkdirSync(join(workspace, "src/styles"), { recursive: true });
  mkdirSync(join(workspace, "components"), { recursive: true });
  writeFileSync(join(workspace, "src/styles/tokens.css"), tokensCss);
  writeFileSync(join(workspace, "components/Pieza.module.css"), sheet);

  try {
    const output = execFileSync("node", [LINTER], { cwd: workspace, encoding: "utf-8" });
    return { code: 0, output };
  } catch (error) {
    const failure = error as { status: number; stdout: string; stderr: string };
    return { code: failure.status, output: `${failure.stdout}${failure.stderr}` };
  }
}

afterEach(() => {
  if (workspace) rmSync(workspace, { recursive: true, force: true });
  workspace = null;
});

describe("lint:tokens cuenta usos (14.48)", () => {
  it("rechaza un token declarado que ninguna hoja lee", () => {
    const { code, output } = run(
      `:root { --usado: 12px; --nadie-lo-lee: 14px; }\n${THEMES}`,
      `.pieza { font-size: var(--usado); ${READS_INK} }\n`,
    );

    expect(code).toBe(1);
    expect(output).toContain("--nadie-lo-lee");
    // **El par de la negativa**: sin esto, un gate que rechazara TODO token
    // pasaría esta prueba y rompería la compilación de cualquier repositorio.
    expect(output).not.toContain("--usado");
  });

  it("acepta el token que sólo se lee por indirección desde tokens.css", () => {
    // El tema oscuro llega a su paleta así (`--ink: var(--dark-ink)`), y
    // contarlo de otra forma daría media paleta por huérfana.
    const { code } = run(
      `:root { --base: 12px; --usado: var(--base); }\n${THEMES}`,
      `.pieza { font-size: var(--usado); ${READS_INK} }\n`,
    );

    expect(code).toBe(0);
  });

  it("recorre los archivos en vez de mirar una lista escrita a mano", () => {
    // Una hoja con un nombre que este gate nunca vio tiene que contar igual:
    // enumerar archivos es cómo un gate deja de ver el siguiente que aparece.
    workspace = mkdtempSync(join(tmpdir(), "lint-tokens-"));
    mkdirSync(join(workspace, "src/styles"), { recursive: true });
    mkdirSync(join(workspace, "components/molecules/nueva"), { recursive: true });
    writeFileSync(join(workspace, "src/styles/tokens.css"), `:root { --hondo: 9px; }\n${THEMES}`);
    writeFileSync(
      join(workspace, "components/molecules/nueva/Recien.module.css"),
      `.x { font-size: var(--hondo); ${READS_INK} }\n`,
    );

    expect(() => execFileSync("node", [LINTER], { cwd: workspace as string })).not.toThrow();
  });
});
