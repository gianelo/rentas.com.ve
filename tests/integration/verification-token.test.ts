import { randomUUID } from "node:crypto";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  isVerificationLinkExpired,
  MAGIC_LINK_MAX_AGE_SECONDS,
} from "../../src/modules/identity/domain/magic-link";
import {
  DrizzlePendingMagicLinks,
  fingerprintOfMagicLink,
} from "../../src/modules/identity/infrastructure/drizzle-pending-magic-link";
import * as schema from "../../src/shared/db/schema";
import { accounts, sessions, users, verificationTokens } from "../../src/shared/db/schema";

/**
 * El enlace mágico contra Postgres real (tasks.md 15.4, 15.5).
 *
 * **Se prueba contra el MISMO `DrizzleAdapter` que `auth.ts` configura**, con
 * la misma `verificationTokensTable` — no un doble. `@auth/core`'s callback
 * handler llama exactamente `adapter.createVerificationToken` y
 * `adapter.useVerificationToken({identifier, token})` (verificado leyendo
 * `@auth/core/lib/actions/callback/index.js` y
 * `@auth/drizzle-adapter/lib/pg.js`): esto ejercita ese contrato real, contra
 * la fila real, en vez de confiar en que la librería hace lo que dice la
 * documentación.
 *
 * **Por qué no se maneja el flujo HTTP completo de Auth.js.** El límite de
 * confianza elegido es el contrato del `Adapter` — la interfaz pública que
 * `@auth/core` invoca — y no los detalles internos de hashing/CSRF de la
 * ruta de callback, que son la propia librería y ya están probados ahí. Ver
 * `src/modules/identity/domain/magic-link.ts` para el espejo puro de la
 * frontera de vencimiento, probado con boundary tests rápidos, y el
 * `describe("vencimiento")` de acá para la mitad que sólo Postgres contesta:
 * que la marca de tiempo sobrevive el viaje de ida y vuelta con la precisión
 * que la frontera necesita.
 */

function getTestDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      "TEST_DATABASE_URL is not set. Start the disposable database with " +
        "`pnpm db:test:up && pnpm db:test:migrate`.",
    );
  }
  return url;
}

const pool = new Pool({ connectionString: getTestDatabaseUrl() });
const db = drizzle(pool, { schema });

const adapter = DrizzleAdapter(db, {
  usersTable: users,
  accountsTable: accounts,
  sessionsTable: sessions,
  verificationTokensTable: verificationTokens,
});

if (!adapter.createVerificationToken || !adapter.useVerificationToken) {
  throw new Error("El adaptador no expone los métodos de verificationToken.");
}

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await pool.query('DELETE FROM "verificationToken"');
});

describe("un solo uso (F17, tasks.md 15.4)", () => {
  it("Auth.js consume la fila al usarla: un segundo uso no encuentra nada", async () => {
    const identifier = `tenant-${randomUUID()}@ejemplo.com`;
    const token = randomUUID();
    const expires = new Date(Date.now() + MAGIC_LINK_MAX_AGE_SECONDS * 1000);

    await adapter.createVerificationToken?.({ identifier, token, expires });

    const firstUse = await adapter.useVerificationToken?.({ identifier, token });
    expect(firstUse).toMatchObject({ identifier, token });

    const secondUse = await adapter.useVerificationToken?.({ identifier, token });
    expect(secondUse).toBeNull();
  });

  it("no toca la fila de otro identifier con el mismo token por casualidad", async () => {
    const token = randomUUID();
    const identifierA = `a-${randomUUID()}@ejemplo.com`;
    const identifierB = `b-${randomUUID()}@ejemplo.com`;
    const expires = new Date(Date.now() + MAGIC_LINK_MAX_AGE_SECONDS * 1000);

    await adapter.createVerificationToken?.({ identifier: identifierA, token, expires });
    await adapter.createVerificationToken?.({ identifier: identifierB, token, expires });

    await adapter.useVerificationToken?.({ identifier: identifierA, token });

    // La fila de B sigue viva: la clave compuesta (identifier, token) es lo
    // que aísla un uso del otro, no el token solo.
    const stillThere = await pool.query(
      'SELECT 1 FROM "verificationToken" WHERE identifier = $1 AND token = $2',
      [identifierB, token],
    );
    expect(stillThere.rowCount).toBe(1);
  });
});

/**
 * `expires` es `timestamp` SIN zona (mismo tipo que `@auth/drizzle-adapter`
 * usa por defecto). Guardar y releer ese tipo por `node-postgres` NO es
 * neutral al huso horario de la máquina que corre el test — se descubrió
 * corriendo esta misma suite acá:
 *
 * - `drizzle`/`pg` escriben la marca como los dígitos de reloj de pared del
 *   UTC del `Date` original (verificado: un `Date` de "...19:15:00.000Z" se
 *   guarda como el texto literal "...19:15:00", sin zona).
 * - El parser por defecto de `pg` para ese tipo (`postgres-date`, OID 1114)
 *   reconstruye el `Date` interpretando esos mismos dígitos como hora LOCAL
 *   del proceso Node que lee — no UTC. En una máquina en UTC-4/UTC-5 (la
 *   zona del fundador, Venezuela) el valor releído queda desplazado, aunque
 *   en CI (normalmente UTC) el desplazamiento es cero y el error queda mudo.
 *
 * Por eso acá se lee con `::text` y se reconstruye el UTC a mano — la misma
 * corrección que ya hace `PgTimestamp.mapFromDriverValue` en drizzle-orm
 * cuando el valor le llega como string en vez de `Date` ya parseado.
 */
function readStoredUtcTimestamp(text: string): Date {
  return new Date(`${text.replace(" ", "T")}Z`);
}

describe("quince minutos (F17, tasks.md 15.5)", () => {
  /**
   * La frontera exacta la afirma `isVerificationLinkExpired` (dominio, sin
   * I/O) — ver magic-link.test.ts. Acá se prueba lo que sólo Postgres puede
   * contestar: que un `expires` guardado y vuelto a leer conserva la
   * precisión que esa frontera necesita, para las dos fichas del borde.
   */
  it("una fila cuyo expires quedó en el pasado se lee como vencida", async () => {
    const identifier = `expired-${randomUUID()}@ejemplo.com`;
    const token = randomUUID();
    const now = new Date();
    const pastExpiry = new Date(now.getTime() - MAGIC_LINK_MAX_AGE_SECONDS * 1000 - 1);

    await adapter.createVerificationToken?.({ identifier, token, expires: pastExpiry });

    const row = await pool.query(
      'SELECT expires::text as expires FROM "verificationToken" WHERE token = $1',
      [token],
    );
    const persistedExpiry = readStoredUtcTimestamp(row.rows[0].expires as string);

    expect(isVerificationLinkExpired(persistedExpiry, now)).toBe(true);
  });

  it("una fila recién creada con maxAge de 15 minutos todavía vale", async () => {
    const identifier = `fresh-${randomUUID()}@ejemplo.com`;
    const token = randomUUID();
    const now = new Date();
    const expires = new Date(now.getTime() + MAGIC_LINK_MAX_AGE_SECONDS * 1000);

    await adapter.createVerificationToken?.({ identifier, token, expires });

    const row = await pool.query(
      'SELECT expires::text as expires FROM "verificationToken" WHERE token = $1',
      [token],
    );
    const persistedExpiry = readStoredUtcTimestamp(row.rows[0].expires as string);

    expect(isVerificationLinkExpired(persistedExpiry, now)).toBe(false);
  });
});

/**
 * **La señal del sondeo, contra Postgres de verdad** (tasks.md 15.14).
 *
 * El sondeo no pregunta «¿entró esta persona?» sino «¿sigue vivo MI enlace?»,
 * y toda esa afirmación se apoya en un hecho de la librería que sólo la base
 * puede confirmar: canjear el enlace BORRA la fila. Probarlo con un doble
 * sería probar el doble.
 */
describe("las huellas de los enlaces vivos (tasks.md 15.14)", () => {
  const pendientes = new DrizzlePendingMagicLinks(db);

  it("devuelve la huella y nunca el token: quien la tenga no puede entrar con ella", async () => {
    const identifier = `tenant-${randomUUID()}@ejemplo.com`;
    const token = randomUUID();
    await adapter.createVerificationToken?.({
      identifier,
      token,
      expires: new Date(Date.now() + MAGIC_LINK_MAX_AGE_SECONDS * 1000),
    });

    const huellas = await pendientes.findPendingFingerprints({ identifier, now: new Date() });

    expect(huellas).toEqual([fingerprintOfMagicLink(token)]);
    expect(huellas[0]).not.toContain(token);
  });

  /**
   * **La más nueva primero**, que es la que la acción se guarda: un reenvío
   * deja dos enlaces vivos y el comprobante tiene que apuntar al último.
   */
  it("las ordena de la más nueva a la más vieja, y deja fuera la vencida", async () => {
    const identifier = `tenant-${randomUUID()}@ejemplo.com`;
    const vieja = randomUUID();
    const nueva = randomUUID();
    const vencida = randomUUID();
    const ahora = Date.now();

    await adapter.createVerificationToken?.({
      identifier,
      token: vieja,
      expires: new Date(ahora + 60_000),
    });
    await adapter.createVerificationToken?.({
      identifier,
      token: nueva,
      expires: new Date(ahora + 900_000),
    });
    await adapter.createVerificationToken?.({
      identifier,
      token: vencida,
      expires: new Date(ahora - 1_000),
    });

    expect(await pendientes.findPendingFingerprints({ identifier, now: new Date() })).toEqual([
      fingerprintOfMagicLink(nueva),
      fingerprintOfMagicLink(vieja),
    ]);
  });

  /** El hecho del que cuelga el sondeo entero: usar el enlace borra la fila. */
  it("canjear el enlace hace desaparecer su huella, que es la señal de que entró", async () => {
    const identifier = `tenant-${randomUUID()}@ejemplo.com`;
    const token = randomUUID();
    await adapter.createVerificationToken?.({
      identifier,
      token,
      expires: new Date(Date.now() + MAGIC_LINK_MAX_AGE_SECONDS * 1000),
    });

    await adapter.useVerificationToken?.({ identifier, token });

    expect(await pendientes.findPendingFingerprints({ identifier, now: new Date() })).toEqual([]);
  });

  /** Y el buzón de al lado no se entera de nada. */
  it("no mezcla buzones: cada dirección ve sólo sus enlaces", async () => {
    const mío = `tenant-${randomUUID()}@ejemplo.com`;
    const ajeno = `tenant-${randomUUID()}@ejemplo.com`;
    await adapter.createVerificationToken?.({
      identifier: ajeno,
      token: randomUUID(),
      expires: new Date(Date.now() + MAGIC_LINK_MAX_AGE_SECONDS * 1000),
    });

    expect(await pendientes.findPendingFingerprints({ identifier: mío, now: new Date() })).toEqual(
      [],
    );
  });
});
