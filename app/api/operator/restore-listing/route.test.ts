import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * La puerta de la ruta de restauración (tasks.md 8.6).
 *
 * **Se importa el módulo de verdad, no un doble** — mismo motivo que
 * `app/api/jobs/expiry-reminders/route.test.ts`: el camino de 401 contesta
 * antes de tocar la base, así que una URL de Neon que nunca se usa alcanza.
 */

const ENV_KEYS = ["DATABASE_URL", "OPERATOR_SECRET"] as const;
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

async function post(
  body: unknown = { listingId: "listing-1" },
  headers: Record<string, string> = {},
) {
  const { POST } = await import("./route");
  return POST(
    new Request("https://rentas.com.ve/api/operator/restore-listing", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    }),
  );
}

describe("POST /api/operator/restore-listing", () => {
  it("sin autenticar devuelve 401", async () => {
    process.env.OPERATOR_SECRET = "el-secreto";

    const response = await post();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "unauthorized" });
  });

  it("con el portador equivocado devuelve 401", async () => {
    process.env.OPERATOR_SECRET = "el-secreto";

    const response = await post({ listingId: "listing-1" }, { authorization: "Bearer otro" });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "unauthorized" });
  });

  // Falla cerrado: un despliegue sin la variable no vuelve pública la ruta.
  it.each([{ authorization: "Bearer " }, { authorization: "Bearer lo-que-sea" }])(
    "sin OPERATOR_SECRET en el servidor no entra nadie",
    async (header) => {
      delete process.env.OPERATOR_SECRET;

      const response = await post({ listingId: "listing-1" }, header);

      expect(response.status).toBe(401);
    },
  );

  it("con el portador correcto pero sin listingId devuelve 400 sin tocar la base", async () => {
    process.env.OPERATOR_SECRET = "el-secreto";

    const response = await post({}, { authorization: "Bearer el-secreto" });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "missing_listing_id" });
  });
});
