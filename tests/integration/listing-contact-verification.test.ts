import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  DrizzleListingContactVerification,
  type VerifiedContactDatabase,
} from "../../src/modules/identity/infrastructure/drizzle-verified-contact";
import * as schema from "../../src/shared/db/schema";

/**
 * `DrizzleListingContactVerification` contra Postgres real (tasks.md 22.32).
 *
 * Lo que sólo la base puede contestar es el `JOIN`: que agarre el triple
 * EXACTO del aviso —cuenta, método y valor— y ninguno parecido, y que un
 * aviso sin fila viva conteste `null` en vez de reventar. El tipo de retorno
 * (`Date | null`) ya impide que el valor cruce el proceso en JavaScript; esta
 * prueba comprueba lo que el tipo no puede: que el `WHERE`/`JOIN` de verdad
 * aísla el triple.
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
const db = drizzle(pool, { schema }) as unknown as VerifiedContactDatabase;
const verification = new DrizzleListingContactVerification(db);

const CITY = randomUUID();
const ZONE = randomUUID();
const PUBLISHER = randomUUID();
const OTHER_PUBLISHER = randomUUID();

const VERIFIED_LISTING = randomUUID();
const UNVERIFIED_LISTING = randomUUID();
const MISMATCHED_VALUE_LISTING = randomUUID();
const MISMATCHED_METHOD_LISTING = randomUUID();
const CROSS_ACCOUNT_COLLISION_LISTING = randomUUID();

const VERIFIED_AT = new Date("2026-08-19T12:00:00.000Z");

async function insertListing(
  id: string,
  publisherId: string,
  contactMethod: string,
  contactValue: string,
): Promise<void> {
  await pool.query(
    `INSERT INTO "listing"
       (id, publisher_id, publisher_type, property_type, city_id, zone_id, title, description,
        price_usd, rooms, area_m2, bathrooms, parking_spots,
        has_power_plant, has_regular_water, is_furnished, has_security, has_appliances,
        contact_method, contact_value, status, published_at, expires_at)
     VALUES ($1,$2,'owner','anexo',$3,$4,'Anexo con planta','Descripción larga.',
             450,2,78,1,0, true,true,false,true,false,
             $5,$6,'active',now(),now() + interval '30 days')`,
    [id, publisherId, CITY, ZONE, contactMethod, contactValue],
  );
}

beforeAll(async () => {
  await pool.query('INSERT INTO "city" (id, name) VALUES ($1,$2)', [CITY, `Ciudad ${CITY}`]);
  await pool.query(
    `INSERT INTO "zone" (id, city_id, name, kind, source) VALUES ($1,$2,$3,'municipio','INE')`,
    [ZONE, CITY, `Municipio ${ZONE}`],
  );
  await pool.query('INSERT INTO "user" (id, name, email) VALUES ($1,$2,$3)', [
    PUBLISHER,
    "María F.",
    `${PUBLISHER}@rentas.invalid`,
  ]);
  await pool.query('INSERT INTO "user" (id, name, email) VALUES ($1,$2,$3)', [
    OTHER_PUBLISHER,
    "Otra Cuenta",
    `${OTHER_PUBLISHER}@rentas.invalid`,
  ]);

  // La fila viva pertenece EXACTAMENTE al triple del aviso verificado.
  await pool.query(
    `INSERT INTO "verified_contact" (user_id, method, value, verified_at)
     VALUES ($1,'whatsapp','+58 412 555 0134',$2)`,
    [PUBLISHER, VERIFIED_AT],
  );
  // Otro triple de la MISMA cuenta, para que la prueba de valor equivocado no
  // pase por accidente por falta de cualquier fila del publicador.
  await pool.query(
    `INSERT INTO "verified_contact" (user_id, method, value, verified_at)
     VALUES ($1,'email','maria@example.com',now())`,
    [PUBLISHER],
  );

  await insertListing(VERIFIED_LISTING, PUBLISHER, "whatsapp", "+58 412 555 0134");
  await insertListing(UNVERIFIED_LISTING, OTHER_PUBLISHER, "whatsapp", "+58 424 111 2233");
  // Mismo método y misma cuenta, pero OTRO número: la fila viva no le sirve.
  await insertListing(MISMATCHED_VALUE_LISTING, PUBLISHER, "whatsapp", "+58 414 999 0000");
  // Mismo valor y misma cuenta, pero por OTRO canal: tampoco le sirve.
  await insertListing(MISMATCHED_METHOD_LISTING, PUBLISHER, "telefono", "+58 412 555 0134");
  // Mismo método y mismo valor que la fila viva de PUBLISHER, pero el aviso es
  // de OTHER_PUBLISHER: la fila verificada no es suya.
  await insertListing(
    CROSS_ACCOUNT_COLLISION_LISTING,
    OTHER_PUBLISHER,
    "whatsapp",
    "+58 412 555 0134",
  );
});

afterAll(async () => {
  await pool.query('DELETE FROM "listing" WHERE publisher_id = ANY($1)', [
    [PUBLISHER, OTHER_PUBLISHER],
  ]);
  await pool.query('DELETE FROM "user" WHERE id = ANY($1)', [[PUBLISHER, OTHER_PUBLISHER]]);
  await pool.query('DELETE FROM "city" WHERE id = $1', [CITY]);
  await pool.end();
});

describe("findVerifiedAt", () => {
  it("devuelve el instante crudo cuando el triple del aviso tiene fila viva", async () => {
    expect(await verification.findVerifiedAt(VERIFIED_LISTING)).toEqual(VERIFIED_AT);
  });

  it("devuelve null cuando la cuenta del aviso no tiene ninguna fila", async () => {
    expect(await verification.findVerifiedAt(UNVERIFIED_LISTING)).toBeNull();
  });

  /**
   * **El corazón de la 22.32.** Sin comparar `value` en el `JOIN`, un aviso
   * con OTRO número de la misma cuenta verificada leería «verificado» por el
   * solo hecho de compartir publicador — que es exactamente la garantía que
   * `decideContactVerification` ya protege del lado de publicar, y la que
   * este puerto nuevo tiene que sostener del lado de la ficha bloqueada.
   */
  it("no contesta que sí para otro valor de la misma cuenta verificada", async () => {
    expect(await verification.findVerifiedAt(MISMATCHED_VALUE_LISTING)).toBeNull();
  });

  it("no contesta que sí para el mismo valor por otro método", async () => {
    expect(await verification.findVerifiedAt(MISMATCHED_METHOD_LISTING)).toBeNull();
  });

  /**
   * **El seguimiento que dejó abierto la 22.32.** El triple `(método, valor)`
   * de este aviso coincide letra por letra con la fila viva de PUBLISHER,
   * pero el aviso es de OTHER_PUBLISHER: sin comparar `user_id` en el `JOIN`,
   * una cuenta ajena leería «verificado» con la verificación de otra.
   */
  it("no contesta que sí para el mismo método y valor de una cuenta ajena", async () => {
    expect(await verification.findVerifiedAt(CROSS_ACCOUNT_COLLISION_LISTING)).toBeNull();
  });

  it("un aviso que no existe no revienta: devuelve null", async () => {
    expect(await verification.findVerifiedAt(randomUUID())).toBeNull();
  });
});
