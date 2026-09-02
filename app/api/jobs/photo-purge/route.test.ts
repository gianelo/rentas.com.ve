import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * tasks.md 19.4 — la puerta de la purga de fotos.
 *
 * **No existía, y desde hoy la ruta está programada.** Mientras el cron estuvo
 * ausente de `vercel.json` nadie podía llamar a esto sin el portador a mano;
 * ahora Vercel la despierta todos los días y el único guardia entre un `GET`
 * anónimo y un borrado irreversible de R2 es `isAuthorizedJobRequest`. Su
 * hermana `draft-sweep` tenía estas tres pruebas desde el primer día; ésta no,
 * y la diferencia era que aquélla estaba cableada y ésta no.
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
  return GET(new Request("https://rentas.com.ve/api/jobs/photo-purge", { headers }));
}

const CERRADO = { error: "unauthorized", photos_deleted: 0 };

describe("GET /api/jobs/photo-purge", () => {
  it("sin portador no borra ninguna foto, y el cero está escrito", async () => {
    process.env.CRON_SECRET = "el-secreto";

    const response = await get();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual(CERRADO);
  });

  it("con el portador equivocado tampoco", async () => {
    process.env.CRON_SECRET = "el-secreto";

    const response = await get({ authorization: "Bearer otro" });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual(CERRADO);
  });

  // AGENTS.md §7: un despliegue al que se le olvidó la variable deja la ruta
  // CERRADA. Este trabajo borra fotografías de alguien para siempre, así que
  // abierta por omisión sería la peor forma posible de descubrir el olvido.
  it("sin CRON_SECRET en el servidor no entra nadie", async () => {
    delete process.env.CRON_SECRET;

    for (const header of [{ authorization: "Bearer " }, { authorization: "Bearer lo-que-sea" }]) {
      const response = await get(header);
      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual(CERRADO);
    }
  });
});
