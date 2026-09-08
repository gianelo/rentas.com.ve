import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

/**
 * **La compuerta de `deploy-migrate.mjs`, probada corriéndolo (tasks.md 27.2).**
 *
 * No se importan sus funciones — `tsconfig` tiene `allowJs: false`, la misma
 * razón por la que `lint-tokens.test.ts` ejecuta `scripts/lint-tokens.mjs` en
 * vez de importarlo — así que esta prueba también lo **ejecuta**, contra un
 * árbol de mentira: un directorio `drizzle/` vacío (sin migraciones que
 * escanear) y un `pnpm` de mentira en el PATH que sale en 0 sin tocar
 * ninguna base real, para poder observar el camino completo — incluida la
 * migración simulada — sin depender de Postgres ni de `drizzle-kit`.
 */
const SCRIPT = resolve("scripts/deploy-migrate.mjs");

let workspace: string | null = null;

function run(env: Record<string, string | undefined>): { code: number; output: string } {
  workspace = mkdtempSync(join(tmpdir(), "deploy-migrate-"));
  mkdirSync(join(workspace, "drizzle"), { recursive: true });

  // Un `pnpm` falso: el script real le pide "drizzle-kit migrate", "tsx
  // scripts/schema-smoke.ts" y "tsx scripts/taxonomy-smoke.ts" con
  // `stdio: "inherit"`. Ninguno existe en este árbol de mentira, así que
  // stubear el binario entero es lo que deja terminar el camino de "sí migra"
  // sin invocar nada real.
  const fakeBin = join(workspace, "bin");
  mkdirSync(fakeBin, { recursive: true });
  const pnpmStub = join(fakeBin, "pnpm");
  writeFileSync(pnpmStub, "#!/bin/sh\nexit 0\n");
  chmodSync(pnpmStub, 0o755);

  // `delete` instead of spreading `undefined` in: Node stringifies an
  // `undefined` env value as the literal text "undefined" rather than
  // omitting the key, which would make the "local" case lie about
  // VERCEL_ENV being unset.
  const childEnv: NodeJS.ProcessEnv = { ...process.env };
  delete childEnv.VERCEL_ENV;
  delete childEnv.DATABASE_URL;
  delete childEnv.PREVIEW_HAS_OWN_DATABASE;
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) continue;
    childEnv[key] = value;
  }
  childEnv.PATH = `${fakeBin}:${process.env.PATH}`;

  try {
    const output = execFileSync("node", [SCRIPT], {
      cwd: workspace,
      encoding: "utf-8",
      env: childEnv,
    });
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

describe("deploy-migrate deja de saltarse las vistas previas con base propia (27.2)", () => {
  it("producción sigue migrando, sin la compuerta nueva", () => {
    const { code, output } = run({ VERCEL_ENV: "production", DATABASE_URL: "postgresql://fake" });

    expect(code).toBe(0);
    expect(output).toContain("applying pending migrations to production");
    expect(output).not.toContain("skipped");
  });

  it("vista previa CON PREVIEW_HAS_OWN_DATABASE=true migra igual que producción", () => {
    const { code, output } = run({
      VERCEL_ENV: "preview",
      DATABASE_URL: "postgresql://fake-preview",
      PREVIEW_HAS_OWN_DATABASE: "true",
    });

    expect(code).toBe(0);
    expect(output).toContain("applying pending migrations");
    expect(output).not.toContain("skipped");
  });

  it("vista previa SIN PREVIEW_HAS_OWN_DATABASE se salta y nombra la variable", () => {
    const { code, output } = run({ VERCEL_ENV: "preview", DATABASE_URL: "postgresql://fake" });

    expect(code).toBe(0);
    expect(output).toContain("skipped");
    expect(output).toContain("PREVIEW_HAS_OWN_DATABASE");
  });

  it("local (sin VERCEL_ENV) se sigue saltando igual que antes", () => {
    const { code, output } = run({ VERCEL_ENV: undefined, DATABASE_URL: undefined });

    expect(code).toBe(0);
    expect(output).toContain("skipped");
    expect(output).toContain('VERCEL_ENV is "local"');
  });
});
