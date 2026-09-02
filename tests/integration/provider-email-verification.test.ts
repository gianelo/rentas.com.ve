import { randomUUID } from "node:crypto";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolveContactVerification } from "../../src/modules/identity/application/resolve-contact-verification";
import {
  DrizzleContactVerificationEvidence,
  DrizzleVerifiedContacts,
  type VerifiedContactDatabase,
} from "../../src/modules/identity/infrastructure/drizzle-verified-contact";
import { buildProviderEmailVerificationEvent } from "../../src/modules/identity/infrastructure/provider-email-verification-event";
import * as schema from "../../src/shared/db/schema";

/**
 * tasks.md 19.14 — **la cadena entera de quien entra por Google, contra
 * Postgres de verdad.**
 *
 * El arnés de `emailverified-de-auth-js.test.ts` conduce Auth.js con un
 * adaptador que ANOTA en vez de escribir, así que prueba que el asiento
 * dispara y con qué. Lo que no puede probar es que la escritura llegue: el
 * asiento actualiza por `adapter.updateUser` del `DrizzleAdapter` de verdad,
 * con un objeto parcial (`{ id, emailVerified }`), y si esa columna no
 * estuviera mapeada o el adaptador exigiera la fila entera, la suite unitaria
 * quedaría verde con el producto roto. Es la forma exacta del defecto que
 * este repositorio ya se comió con `resultsOrigin`.
 *
 * Y sigue una vuelta más, porque el instante no es el objetivo sino el
 * medio: con la fecha puesta, `resolveContactVerification` tiene que dejar la
 * fila de `verified_contact` que la ficha lee para escribir «verificado por
 * email el …» (19.10). Eso es lo que hoy tiene quien entra por enlace mágico
 * y no tenía quien entra por Google.
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

/** El MISMO adaptador que `auth.ts` monta, no uno de mentira. */
const adapter = DrizzleAdapter(db, {
  usersTable: schema.users,
  accountsTable: schema.accounts,
  sessionsTable: schema.sessions,
  verificationTokensTable: schema.verificationTokens,
});

const AHORA = new Date("2026-09-02T15:00:00.000Z");
const asiento = buildProviderEmailVerificationEvent(adapter, () => AHORA);

const POR_GOOGLE = randomUUID();
const SIN_AFIRMACION = randomUUID();
const CORREO_POR_GOOGLE = `google-${POR_GOOGLE}@example.com`;
const CORREO_SIN_AFIRMACION = `sin-${SIN_AFIRMACION}@example.com`;

/** Una cuenta como la deja `handle-login.js:260`: creada y sin instante. */
async function insertarCuentaDeGoogle(id: string, email: string): Promise<void> {
  await pool.query(
    `INSERT INTO "user" (id, name, email, "emailVerified") VALUES ($1, $2, $3, NULL)`,
    [id, `Cuenta ${id}`, email],
  );
}

/**
 * **Se lee por Drizzle y NO con `pool.query`, y la diferencia está medida.**
 * `user."emailVerified"` es la única marca de tiempo del esquema SIN
 * `withTimezone` —viene del esquema por omisión del adaptador de Auth.js, como
 * `image`—, así que Postgres guarda un reloj de pared pelado. Drizzle lo
 * escribe y lo vuelve a leer en UTC, de modo que el camino de producción
 * —escribir por `adapter.updateUser`, leer por
 * `DrizzleContactVerificationEvidence`— devuelve el instante exacto en
 * cualquier zona. `node-postgres` crudo, en cambio, interpreta ese reloj de
 * pared en la zona DEL PROCESO: con `TZ=America/Bogota` devuelve el mismo
 * valor corrido cinco horas. La primera versión de esta prueba se leyó así y
 * acusó un desvío que no existe.
 */
async function leerEmailVerified(id: string): Promise<Date | null> {
  const filas = await db
    .select({ emailVerified: schema.users.emailVerified })
    .from(schema.users)
    .where(eq(schema.users.id, id));
  return filas[0]?.emailVerified ?? null;
}

/** El reloj de pared que quedó guardado, que es lo que no depende de quién lea. */
async function leerRelojDePared(id: string): Promise<string | null> {
  const { rows } = await pool.query(
    `SELECT to_char("emailVerified", 'YYYY-MM-DD HH24:MI:SS') AS pared FROM "user" WHERE id = $1`,
    [id],
  );
  return (rows[0]?.pared as string | undefined) ?? null;
}

async function contarFilasVerificadas(userId: string): Promise<number> {
  const { rows } = await pool.query(
    'SELECT count(*)::int AS n FROM "verified_contact" WHERE user_id = $1',
    [userId],
  );
  return rows[0].n as number;
}

beforeAll(async () => {
  await insertarCuentaDeGoogle(POR_GOOGLE, CORREO_POR_GOOGLE);
  await insertarCuentaDeGoogle(SIN_AFIRMACION, CORREO_SIN_AFIRMACION);
});

afterAll(async () => {
  await pool.query('DELETE FROM "user" WHERE id = ANY($1)', [[POR_GOOGLE, SIN_AFIRMACION]]);
  await pool.end();
});

describe("la fecha de Google llega hasta la ficha (19.14)", () => {
  it("la entrada por Google le deja el instante a la cuenta, y con eso publicar deja fila", async () => {
    expect(await leerEmailVerified(POR_GOOGLE)).toBeNull();
    expect(await contarFilasVerificadas(POR_GOOGLE)).toBe(0);

    await asiento({
      user: { id: POR_GOOGLE, email: CORREO_POR_GOOGLE },
      account: { provider: "google" },
      profile: { email: CORREO_POR_GOOGLE, email_verified: true },
    });

    expect(await leerEmailVerified(POR_GOOGLE)).toEqual(AHORA);
    // Y lo guardado es el reloj de pared UTC del instante, no el de quien
    // escribe: si Drizzle empezara a escribir en la zona del proceso, el
    // camino de producción seguiría siendo simétrico y esta línea sería la
    // única que lo delataría.
    expect(await leerRelojDePared(POR_GOOGLE)).toBe("2026-09-02 15:00:00");

    // La vuelta que importa: con el instante puesto, publicar con el propio
    // correo deja la fila que la ficha lee. Sin él —que es lo de hoy— la
    // decisión es `unverified` y no se escribe nada.
    const decision = await resolveContactVerification(
      { userId: POR_GOOGLE, contact: { method: "email", value: CORREO_POR_GOOGLE } },
      {
        evidence: new DrizzleContactVerificationEvidence(db as unknown as VerifiedContactDatabase),
        verifiedContacts: new DrizzleVerifiedContacts(db as unknown as VerifiedContactDatabase),
        now: () => AHORA,
      },
    );

    expect(decision).toEqual({ kind: "verified-by-account-email", verifiedAt: AHORA });
    expect(await contarFilasVerificadas(POR_GOOGLE)).toBe(1);
  });

  it("no le escribe nada a la cuenta cuya entrada no trae la afirmación de Google", async () => {
    await asiento({
      user: { id: SIN_AFIRMACION, email: CORREO_SIN_AFIRMACION },
      account: { provider: "google" },
      profile: { email: CORREO_SIN_AFIRMACION, email_verified: false },
    });

    expect(await leerEmailVerified(SIN_AFIRMACION)).toBeNull();
    expect(await contarFilasVerificadas(SIN_AFIRMACION)).toBe(0);
  });
});
