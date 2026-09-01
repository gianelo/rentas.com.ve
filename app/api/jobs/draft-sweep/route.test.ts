import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * tasks.md 18.32 — la puerta del barrido de las 24 horas.
 *
 * **Se importa la ruta de verdad, no un doble.** El cliente de Neon se
 * construye al importarla, así que se le pone una URL que nunca se usa: el
 * camino de 401 contesta antes de tocar la base, y que ninguna consulta salga
 * —ni un solo `DELETE` contra R2— es parte de lo que esto afirma.
 */

const ENV_KEYS = ["DATABASE_URL", "CRON_SECRET"] as const;
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  process.env.DATABASE_URL = "postgres://u:p@nunca-se-usa-pooler.neon.tech/db";
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

async function get(headers: Record<string, string> = {}) {
  const { GET } = await import("./route");
  return GET(new Request("https://rentas.com.ve/api/jobs/draft-sweep", { headers }));
}

const CERRADO = { error: "unauthorized", drafts_deleted: 0, objects_removed: 0 };

describe("GET /api/jobs/draft-sweep", () => {
  it("sin portador no borra nada, y los ceros son explícitos", async () => {
    process.env.CRON_SECRET = "el-secreto";

    const response = await get();

    expect(response.status).toBe(401);
    // Los dos ceros están escritos, no omitidos: quien lea la respuesta tiene
    // que poder AFIRMAR que no se borró ninguna fila ni ningún objeto de R2.
    await expect(response.json()).resolves.toEqual(CERRADO);
  });

  it("con el portador equivocado tampoco", async () => {
    process.env.CRON_SECRET = "el-secreto";

    const response = await get({ authorization: "Bearer otro" });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual(CERRADO);
  });

  // AGENTS.md §7: un despliegue al que se le olvidó la variable deja la ruta
  // CERRADA. Este trabajo borra objetos de R2 de forma irreversible, así que
  // abierta por omisión sería la peor forma de descubrir el olvido.
  it("sin CRON_SECRET en el servidor no entra nadie", async () => {
    delete process.env.CRON_SECRET;

    for (const header of [{ authorization: "Bearer " }, { authorization: "Bearer lo-que-sea" }]) {
      const response = await get(header);
      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual(CERRADO);
    }
  });
});
