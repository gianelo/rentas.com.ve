import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * La puerta de la ruta del trabajo (tasks.md 7.4).
 *
 * **Se importa el módulo de verdad, no un doble.** El cliente de Neon se
 * construye al importarlo y exige una URL de endpoint agrupado, así que se le
 * pone una que nunca se usa: el camino de 401 contesta antes de tocar la base,
 * y que ninguna consulta salga es parte de lo que esta prueba afirma.
 */

const ENV_KEYS = [
  "DATABASE_URL",
  "CRON_SECRET",
  "SITE_BASE_URL",
  "RENEWAL_TOKEN_SECRET",
  "RESEND_API_KEY",
  "LIFECYCLE_MAIL_FROM",
] as const;
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  process.env.DATABASE_URL = "postgres://u:p@nunca-se-usa-pooler.neon.tech/db";
  process.env.SITE_BASE_URL = "https://rentas.com.ve";
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

async function post(headers: Record<string, string> = {}) {
  const { POST } = await import("./route");
  return POST(
    new Request("https://rentas.com.ve/api/jobs/expiry-reminders", { method: "POST", headers }),
  );
}

describe("POST /api/jobs/expiry-reminders", () => {
  it("sin autenticar devuelve 401 y reminders_sent = 0", async () => {
    process.env.CRON_SECRET = "el-secreto";

    const response = await post();

    expect(response.status).toBe(401);
    // El cero es explícito, no una omisión: quien lea la respuesta tiene que
    // poder AFIRMAR que no salió ningún correo, no deducirlo de un campo que
    // no está.
    await expect(response.json()).resolves.toEqual({ error: "unauthorized", reminders_sent: 0 });
  });

  it("con el portador equivocado devuelve 401 y reminders_sent = 0", async () => {
    process.env.CRON_SECRET = "el-secreto";

    const response = await post({ authorization: "Bearer otro" });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "unauthorized", reminders_sent: 0 });
  });

  // Falla cerrado: un despliegue sin la variable no convierte la ruta en
  // pública. Ni siquiera acertando el portador vacío se entra.
  it("sin CRON_SECRET en el servidor no entra nadie", async () => {
    delete process.env.CRON_SECRET;

    for (const header of [{ authorization: "Bearer " }, { authorization: "Bearer lo-que-sea" }]) {
      const response = await post(header);
      expect(response.status).toBe(401);
    }
  });
});

/**
 * **Sin proveedor de correo la tanda NO empieza** (tasks.md 7.11).
 *
 * No es una comodidad: arrancarla tomaría el libro de reservas de cada aviso
 * —una reserva por ciclo, que es justo lo que impide el doble envío— y los
 * quemaría sin que salga un solo correo. El intento siguiente los encontraría
 * ya reservados y **no reintentaría**, así que ese ciclo se pierde entero.
 *
 * Contesta 500 y no 401 a propósito: el portador estaba bien. Lo que falta es
 * del lado del servidor, y un 401 mandaría a rotar un secreto que no tiene
 * nada que ver.
 */
describe("cuando falta la configuración del correo", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = "el-secreto";
    process.env.RENEWAL_TOKEN_SECRET = "otro-secreto";
  });

  it.each([
    ["falta la clave de Resend", { LIFECYCLE_MAIL_FROM: "avisos@rentas.com.ve" }],
    ["falta el remitente", { RESEND_API_KEY: "re_loquesea" }],
    ["no hay ninguna de las dos", {}],
  ])("devuelve 500 y reminders_sent = 0 cuando %s", async (_caso, env) => {
    delete process.env.RESEND_API_KEY;
    delete process.env.LIFECYCLE_MAIL_FROM;
    Object.assign(process.env, env);

    const response = await post({ authorization: "Bearer el-secreto" });

    expect(response.status).toBe(500);
    // El cero explícito otra vez, y por la misma razón que en el 401.
    await expect(response.json()).resolves.toEqual({
      error: "mailer_not_configured",
      reminders_sent: 0,
    });
  });
});
