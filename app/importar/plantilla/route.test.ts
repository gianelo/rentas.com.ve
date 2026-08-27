import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * La plantilla como paso 1 del flujo (lámina 14e: "la plantilla es el paso 1,
 * no un enlace perdido"), y **la única pieza de importar que funciona con
 * JavaScript apagado**: es un `<a href>` a esta ruta, no un botón.
 *
 * `generateImportTemplate` ya prueba QUÉ trae el archivo (encabezado, fila de
 * ejemplo, neutralización de fórmulas). Acá se prueba el cable: que la puerta
 * esté antes de generar nada, y que lo que sale se descargue como archivo en
 * vez de mostrarse como texto en la pestaña.
 */

const { authorizeBulkImport, generateImportTemplate } = vi.hoisted(() => ({
  authorizeBulkImport: vi.fn(),
  generateImportTemplate: vi.fn(),
}));

vi.mock("../../../src/modules/identity/infrastructure/session-port", () => ({
  nextAuthSessionPort: { getSession: async () => null },
}));
vi.mock("../../../src/shared/db/client", () => ({ db: {} }));
vi.mock(
  "../../../src/modules/broker-bulk-import/application/authorize-bulk-import",
  async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    authorizeBulkImport,
  }),
);
vi.mock("../../../src/modules/broker-bulk-import/application/generate-import-template", () => ({
  generateImportTemplate,
}));

import { BulkImportDisabledError } from "../../../src/modules/broker-bulk-import/application/authorize-bulk-import";
import { UnauthenticatedError } from "../../../src/modules/identity/application/require-authenticated-session";
import { GET } from "./route";

beforeEach(() => {
  authorizeBulkImport.mockReset();
  generateImportTemplate.mockReset();
});

describe("GET /importar/plantilla", () => {
  it("una cuenta habilitada se baja el CSV como archivo, no como texto en pantalla", async () => {
    authorizeBulkImport.mockResolvedValueOnce({ userId: "broker-1" });
    generateImportTemplate.mockResolvedValueOnce(
      "referencia_externa,titulo\nplantilla-1,-Amplio\n",
    );

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/csv");
    expect(response.headers.get("content-disposition")).toContain("attachment");
    expect(response.headers.get("content-disposition")).toContain("plantilla-rentas.csv");
    await expect(response.text()).resolves.toContain("referencia_externa");
  });

  /**
   * **La puerta va antes de generar nada** — el catálogo entero se lee para
   * armar la plantilla, y una cuenta sin permiso no debería poder hacer que
   * este proceso consulte la base ni una vez.
   */
  it("con la bandera apagada responde 403 y NO genera la plantilla", async () => {
    authorizeBulkImport.mockRejectedValueOnce(new BulkImportDisabledError("broker-1"));

    const response = await GET();

    expect(response.status).toBe(403);
    expect(generateImportTemplate).not.toHaveBeenCalled();
  });

  it("sin sesión responde 401 y NO genera la plantilla", async () => {
    authorizeBulkImport.mockRejectedValueOnce(new UnauthenticatedError());

    const response = await GET();

    expect(response.status).toBe(401);
    expect(generateImportTemplate).not.toHaveBeenCalled();
  });
});
