import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * La ruta de salud del latido (tasks.md 27.5).
 *
 * **No es un chequeo estático.** `DrizzleCatalogue.listCities()` se dobla
 * para forzar los dos caminos —la base contesta, la base tira— porque un
 * doble de la base es la única forma de PROBAR el 503 sin tener Postgres
 * caído de verdad. La ruta real, sin doblar, sigue tocando la base en cada
 * pedido (`dynamic = "force-dynamic"`).
 */

const CATALOGUE_MODULE = "../../../src/modules/listing-catalogue/infrastructure/drizzle-catalogue";

const ENV_KEYS = ["DATABASE_URL"] as const;
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  process.env.DATABASE_URL = "postgres://u:p@nunca-se-usa-pooler.neon.tech/db";
  vi.resetModules();
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  vi.doUnmock(CATALOGUE_MODULE);
});

describe("GET /api/health", () => {
  it("contesta 200 cuando la base responde", async () => {
    vi.doMock(CATALOGUE_MODULE, () => ({
      DrizzleCatalogue: class {
        async listCities() {
          return [{ id: "ciudad-1", name: "Maracaibo" }];
        }
      },
    }));

    const { GET } = await import("./route");
    const response = await GET();

    expect(response.status).toBe(200);
  });

  it("contesta un status distinto de 200 cuando la consulta a la base falla", async () => {
    vi.doMock(CATALOGUE_MODULE, () => ({
      DrizzleCatalogue: class {
        async listCities() {
          throw new Error("connection refused to ep-real-name-pooler.neon.tech");
        }
      },
    }));

    const { GET } = await import("./route");
    const response = await GET();

    expect(response.status).not.toBe(200);
  });

  it("no filtra la causa del fallo en el cuerpo de la respuesta", async () => {
    vi.doMock(CATALOGUE_MODULE, () => ({
      DrizzleCatalogue: class {
        async listCities() {
          throw new Error("connection refused to ep-real-name-pooler.neon.tech");
        }
      },
    }));

    const { GET } = await import("./route");
    const response = await GET();
    const text = JSON.stringify(await response.json());

    expect(text).not.toContain("neon.tech");
    expect(text).not.toContain("connection refused");
    expect(text).not.toContain("Error");
  });
});
