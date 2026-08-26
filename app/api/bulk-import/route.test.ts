import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * broker-bulk-import spec, Requirement: Operator-Granted Access (tasks.md
 * 9.2/9.3, design.md Security Boundaries "Bulk import access").
 *
 * **The cable, not the rule.** `authorizeBulkImport` already has its own
 * tests for what the flag decides; this file only proves the route
 * translates each of its outcomes into the right HTTP response and never
 * reaches a database — same discipline as
 * `app/alquiler/[ciudad]/[zona]/[slug]/reveal-actions.test.ts`, written
 * after the PR #103 lesson that two separately-green halves are not the
 * same as their join being tested.
 */

const { authorizeBulkImport } = vi.hoisted(() => ({ authorizeBulkImport: vi.fn() }));

// Arrastra Auth.js entero y no participa de lo que se prueba.
vi.mock("../../../src/modules/identity/infrastructure/session-port", () => ({
  nextAuthSessionPort: { getSession: async () => null },
}));

// El cliente real tira al importarse si no hay DATABASE_URL, y acá no se
// consulta ninguna base: el adaptador se construye pero nunca se usa, porque
// `authorizeBulkImport` está doblado.
vi.mock("../../../src/shared/db/client", () => ({ db: {} }));

// Sólo se dobla `authorizeBulkImport`. Las clases de error salen del módulo
// REAL — con copias locales, un renombre en producción dejaría este archivo
// en verde comparando contra errores que ya no existen.
vi.mock(
  "../../../src/modules/broker-bulk-import/application/authorize-bulk-import",
  async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    authorizeBulkImport,
  }),
);

import { BulkImportDisabledError } from "../../../src/modules/broker-bulk-import/application/authorize-bulk-import";
import { UnauthenticatedError } from "../../../src/modules/identity/application/require-authenticated-session";

beforeEach(() => {
  authorizeBulkImport.mockReset();
});

afterEach(() => {
  vi.resetModules();
});

async function post(): Promise<Response> {
  const { POST } = await import("./route");
  return POST();
}

describe("POST /api/bulk-import — la puerta", () => {
  it("sin sesión devuelve 401 y nunca llega a leer la cuenta", async () => {
    authorizeBulkImport.mockRejectedValueOnce(new UnauthenticatedError());

    const response = await post();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "unauthorized" });
  });

  it("con la bandera apagada devuelve 403 y no crea ningún borrador", async () => {
    authorizeBulkImport.mockRejectedValueOnce(new BulkImportDisabledError("broker-1"));

    const response = await post();

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "bulk_import_disabled" });
  });

  it("con la bandera encendida no rechaza — el pipeline real llega en 9.4+", async () => {
    authorizeBulkImport.mockResolvedValueOnce({ userId: "broker-1" });

    const response = await post();

    expect(response.status).toBe(501);
  });

  it("deja pasar un error que no reconoce", async () => {
    authorizeBulkImport.mockRejectedValueOnce(new Error("la base se cayó"));

    await expect(post()).rejects.toThrow("la base se cayó");
  });
});
