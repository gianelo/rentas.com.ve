import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * broker-bulk-import spec, Requirement: Operator-Granted Access (tasks.md
 * 9.2/9.3) y el cableado de la 9.26.
 *
 * **El cable, no la regla.** `authorizeBulkImport`, `validateImport` y
 * `confirmImport` ya tienen sus propias pruebas de lo que deciden; este
 * archivo prueba que la ruta traduce cada resultado suyo a la respuesta HTTP
 * correcta y que **nunca escribe cuando le piden revisar** — misma disciplina
 * que `app/alquiler/[ciudad]/[zona]/[slug]/reveal-actions.test.ts`, escrita
 * después de la lección del PR #103: dos mitades verdes por separado no son
 * lo mismo que su encuentro probado.
 */

const { validateImport, confirmImport } = vi.hoisted(() => ({
  validateImport: vi.fn(),
  confirmImport: vi.fn(),
}));

// Arrastra Auth.js entero y no participa de lo que se prueba.
vi.mock("../../../src/modules/identity/infrastructure/session-port", () => ({
  nextAuthSessionPort: { getSession: async () => null },
}));

// El cliente real tira al importarse si no hay DATABASE_URL, y acá no se
// consulta ninguna base: los adaptadores se construyen pero nunca se usan,
// porque los dos casos de uso están doblados.
vi.mock("../../../src/shared/db/client", () => ({ db: {} }));
vi.mock("../../../src/shared/db/transactional-client", () => ({
  getTransactionalDatabase: () => ({}),
}));

// Sólo se doblan los dos casos de uso. Las clases de error salen del módulo
// REAL — con copias locales, un renombre en producción dejaría este archivo
// en verde comparando contra errores que ya no existen.
vi.mock("../../../src/modules/broker-bulk-import/application/validate-import", () => ({
  validateImport,
}));
vi.mock("../../../src/modules/broker-bulk-import/application/confirm-import", () => ({
  confirmImport,
}));

import { BulkImportDisabledError } from "../../../src/modules/broker-bulk-import/application/authorize-bulk-import";
import { ImportMissingColumnsError } from "../../../src/modules/broker-bulk-import/application/parse-import-file";
import { ImportTooManyRowsError } from "../../../src/modules/broker-bulk-import/application/read-bounded-import-file";
import { ImportMissingAccountContactError } from "../../../src/modules/broker-bulk-import/application/run-import-validation";
import { UnauthenticatedError } from "../../../src/modules/identity/application/require-authenticated-session";
import { POST } from "./route";

/**
 * Importada UNA vez, estáticamente, y sin `vi.resetModules()` entre pruebas.
 * Con el reset, cada `await import("./route")` reevaluaba el grafo entero y
 * la ruta terminaba comparando contra clases de error DISTINTAS de las que
 * este archivo importó: `instanceof BulkImportDisabledError` daba falso y la
 * ruta respondía 500 donde debía responder 403. Pasaba sólo desde la segunda
 * prueba en adelante — la primera todavía compartía registro—, que es la
 * forma más cara de este error: verde en la prueba que se lee primero.
 */

beforeEach(() => {
  validateImport.mockReset();
  confirmImport.mockReset();
});

function request(accion: string, contenido = "referencia_externa\nCH-0118\n"): Request {
  const body = new FormData();
  body.set("archivo", new File([contenido], "cartera-agosto.csv", { type: "text/csv" }));
  body.set("accion", accion);
  return new Request("http://localhost/api/bulk-import", { method: "POST", body });
}

function post(input: Request = request("revisar")): Promise<Response> {
  return POST(input);
}

describe("POST /api/bulk-import — la puerta", () => {
  it("sin sesión devuelve 401 y nunca llega a leer la cuenta", async () => {
    validateImport.mockRejectedValueOnce(new UnauthenticatedError());

    const response = await post();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "unauthorized" });
  });

  it("con la bandera apagada devuelve 403 y no crea ningún borrador", async () => {
    validateImport.mockRejectedValueOnce(new BulkImportDisabledError("broker-1"));

    const response = await post();

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "bulk_import_disabled" });
    expect(confirmImport).not.toHaveBeenCalled();
  });

  it("deja pasar un error que no reconoce", async () => {
    validateImport.mockRejectedValueOnce(new Error("la base se cayó"));

    await expect(post()).rejects.toThrow("la base se cayó");
  });
});

describe("POST /api/bulk-import — revisar", () => {
  it("devuelve la vista previa con los errores por fila, y NUNCA confirma", async () => {
    validateImport.mockResolvedValueOnce({
      totalRows: 42,
      validRows: Array.from({ length: 38 }, (_, index) => ({
        rowNumber: index + 2,
        externalReference: `REF-${index}`,
        listing: {},
      })),
      errors: [
        {
          rowNumber: 7,
          reasons: ["priceUsd.required"],
          cells: {
            externalReference: "MB-0114",
            priceUsd: "",
            zone: "El Rosal",
            rooms: "2",
            title: "Apto 2 hab cerca del lago",
            descriptionLength: 300,
          },
          offendingCells: ["priceUsd"],
        },
      ],
    });

    const response = await post(request("revisar"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      estado: "vista-previa",
      totalFilas: 42,
      listas: 38,
      // La copia se resuelve en el servidor: la pantalla nunca ve un código.
      // Las celdas viajan crudas (tasks.md 9.29): son el texto del archivo,
      // que es justamente lo que 14g muestra.
      errores: [
        {
          fila: 7,
          razones: ["Falta el precio."],
          celdas: {
            referencia: "MB-0114",
            precio: "",
            zona: "El Rosal",
            habitaciones: "2",
            titulo: "Apto 2 hab cerca del lago",
          },
          resaltadas: ["precio"],
        },
      ],
    });
    expect(confirmImport).not.toHaveBeenCalled();
  });

  /**
   * tasks.md 9.29. El contador de la descripción se arma en el servidor, con
   * el mínimo real del dominio — la pantalla recibe la frase entera y no un
   * número suelto que tendría que saber con qué comparar.
   */
  it("la frase de la descripción corta llega con su número, como la escribe 14g", async () => {
    validateImport.mockResolvedValueOnce({
      totalRows: 1,
      validRows: [],
      errors: [
        {
          rowNumber: 31,
          reasons: ["description.tooShort"],
          cells: {
            externalReference: "TN-0091",
            priceUsd: "640",
            zone: "Tierra Negra",
            rooms: "4",
            title: "Quinta con piscina",
            descriptionLength: 61,
          },
          offendingCells: [],
        },
      ],
    });

    const response = await post(request("revisar"));
    const body = (await response.json()) as {
      errores: readonly { razones: readonly string[]; resaltadas: readonly string[] }[];
    };

    expect(body.errores[0]?.razones).toEqual([
      "La descripción tiene 61 caracteres, hacen falta 120.",
    ]);
    // Ninguna de las cinco columnas muestra la descripción, así que no hay
    // celda que resaltar: el problema se lee entero en su propio texto.
    expect(body.errores[0]?.resaltadas).toEqual([]);
  });

  it("una acción que no es ninguna de las dos se rechaza sin tocar nada", async () => {
    const response = await post(request("borrar-todo"));

    expect(response.status).toBe(400);
    expect(validateImport).not.toHaveBeenCalled();
    expect(confirmImport).not.toHaveBeenCalled();
  });

  it("sin archivo se rechaza sin tocar nada", async () => {
    const body = new FormData();
    body.set("accion", "revisar");
    const response = await post(
      new Request("http://localhost/api/bulk-import", { method: "POST", body }),
    );

    expect(response.status).toBe(400);
    expect(validateImport).not.toHaveBeenCalled();
  });
});

describe("POST /api/bulk-import — crear", () => {
  it("confirma y devuelve cuántas se crearon y cuáles ya estaban", async () => {
    confirmImport.mockResolvedValueOnce({
      totalRows: 42,
      createdCount: 38,
      skippedDuplicates: [{ rowNumber: 3, externalReference: "CH-0118" }],
      errors: [
        {
          rowNumber: 7,
          reasons: ["priceUsd.required"],
          cells: {
            externalReference: "CH-0207",
            priceUsd: "",
            zone: "Chacao",
            rooms: "3",
            title: "Apartamento 3 hab con puesto techado",
            descriptionLength: 300,
          },
          offendingCells: ["priceUsd"],
        },
      ],
    });

    const response = await post(request("crear"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      estado: "creado",
      totalFilas: 42,
      creadas: 38,
      yaEstaban: [{ fila: 3, referencia: "CH-0118" }],
      errores: [
        {
          fila: 7,
          razones: ["Falta el precio."],
          celdas: {
            referencia: "CH-0207",
            precio: "",
            zona: "Chacao",
            habitaciones: "3",
            titulo: "Apartamento 3 hab con puesto techado",
          },
          resaltadas: ["precio"],
        },
      ],
    });
    expect(validateImport).not.toHaveBeenCalled();
  });
});

/**
 * Los cuatro rechazos de la lámina 14f. Cada uno nombra qué hacer, y el
 * código de estado los separa de un fallo del servidor: 422 es «tu archivo
 * (o tu cuenta) no sirve», nunca 500.
 */
describe("POST /api/bulk-import — los rechazos de 14f", () => {
  it.each([
    ["columna faltante", () => new ImportMissingColumnsError(["descripcion"]), "columna-faltante"],
    ["demasiadas filas", () => new ImportTooManyRowsError(), "demasiadas-filas"],
    ["cuenta sin contacto", () => new ImportMissingAccountContactError(), "cuenta-sin-contacto"],
  ])("%s devuelve 422 y su motivo", async (_nombre, build, motivo) => {
    validateImport.mockRejectedValueOnce(build());

    const response = await post(request("revisar"));

    expect(response.status).toBe(422);
    const payload = (await response.json()) as { estado: string; motivo: string; mensaje: string };
    expect(payload.estado).toBe("rechazado");
    expect(payload.motivo).toBe(motivo);
    // El mensaje del dominio viaja entero: es el que dice qué hacer.
    expect(payload.mensaje.length).toBeGreaterThan(0);
  });
});
