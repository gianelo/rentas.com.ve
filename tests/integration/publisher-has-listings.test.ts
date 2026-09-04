import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PublicationDatabase } from "../../src/modules/listing-publication/infrastructure/drizzle-listing-repository";
import { DrizzlePublisherHasListings } from "../../src/modules/listing-publication/infrastructure/drizzle-publisher-has-listings";
import * as schema from "../../src/shared/db/schema";

/**
 * tasks.md 14.56 — el `EXISTS` que decide si la barra dice «Mis avisos».
 *
 * **Contra Postgres real y no contra un doble**, porque lo que está bajo
 * prueba es la consulta: que el `WHERE publisher_id` filtre de verdad (una
 * cuenta no ve el aviso de otra), que un borrador SIN fotos cuente igual que
 * uno activo —es exactamente la cuenta recién importada de la 9.15, la que
 * más necesita ver su enlace— y que la sentencia no traiga filas para
 * contarlas.
 */
const url = process.env.TEST_DATABASE_URL;
if (!url) {
  throw new Error(
    "TEST_DATABASE_URL is not set. Start the disposable database with " +
      "`pnpm db:test:up && pnpm db:test:migrate`.",
  );
}

const pool = new Pool({ connectionString: url });
const db = drizzle(pool, { schema }) as unknown as PublicationDatabase;
const carteras = new DrizzlePublisherHasListings(db);

const CITY = randomUUID();
const ZONE = randomUUID();
const CON_AVISO = randomUUID();
const SIN_AVISO = randomUUID();
const CON_BORRADOR = randomUUID();

async function insertListing(publisherId: string, status: string): Promise<void> {
  await pool.query(
    `INSERT INTO "listing"
       (id, publisher_id, publisher_type, property_type, city_id, zone_id, title, description,
        price_usd, rooms, area_m2, bathrooms, parking_spots,
        has_power_plant, has_regular_water, is_furnished, has_security, has_appliances,
        contact_method, contact_value, status, published_at, expires_at)
     VALUES ($1,$2,'owner','apartamento',$3,$4,'Apartamento en Chacao','Descripción larga.',
             450,2,78,1,0, false,false,false,false,false,
             'email','sin-contacto',$5, now(), now() + interval '30 days')`,
    [randomUUID(), publisherId, CITY, ZONE, status],
  );
}

beforeAll(async () => {
  await pool.query('INSERT INTO "city" (id, name) VALUES ($1,$2)', [CITY, `Ciudad ${CITY}`]);
  await pool.query(
    `INSERT INTO "zone" (id, city_id, name, kind, source) VALUES ($1,$2,$3,'parroquia','INE')`,
    [ZONE, CITY, `Zona ${ZONE}`],
  );
  for (const id of [CON_AVISO, SIN_AVISO, CON_BORRADOR]) {
    await pool.query('INSERT INTO "user" (id, name, email) VALUES ($1,$2,$3)', [
      id,
      `Cuenta ${id}`,
      `cartera-${id}@example.com`,
    ]);
  }
  await insertListing(CON_AVISO, "active");
  await insertListing(CON_BORRADOR, "draft");
});

afterAll(async () => {
  await pool.query('DELETE FROM "listing" WHERE publisher_id = ANY($1)', [
    [CON_AVISO, SIN_AVISO, CON_BORRADOR],
  ]);
  await pool.query('DELETE FROM "user" WHERE id = ANY($1)', [[CON_AVISO, SIN_AVISO, CON_BORRADOR]]);
  await pool.query('DELETE FROM "zone" WHERE id = $1', [ZONE]);
  await pool.query('DELETE FROM "city" WHERE id = $1', [CITY]);
  await pool.end();
});

describe("¿este publicador tiene al menos un aviso? (14.56)", () => {
  it("una cuenta con un aviso activo contesta que sí", async () => {
    expect(await carteras.hasAnyListing(CON_AVISO)).toBe(true);
  });

  it("una cuenta recién creada contesta que no — es la que la barra no debe prometerle nada", async () => {
    expect(await carteras.hasAnyListing(SIN_AVISO)).toBe(false);
  });

  /**
   * **Un borrador cuenta**, y es la mitad que importa: la cartera importada
   * nace en `draft` y sin fotos (9.15). Si esto filtrara por `status =
   * 'active'`, la inmobiliaria que acaba de importar cincuenta avisos vería
   * la barra muda justo cuando más necesita el enlace.
   */
  it("un borrador sin fotos cuenta igual que un aviso activo", async () => {
    expect(await carteras.hasAnyListing(CON_BORRADOR)).toBe(true);
  });

  it("la cartera de otro no cuenta: el filtro va en el WHERE, no después", async () => {
    expect(await carteras.hasAnyListing(randomUUID())).toBe(false);
  });

  /**
   * **La sentencia se corta en la primera fila.** Es la diferencia entre
   * `EXISTS` y `COUNT`, y sin esta aserción el adaptador podría volver a
   * recorrer la cartera entera sin que ninguna otra prueba se pusiera roja.
   * Se mide el SQL que el adaptador MANDA —por el registro de Drizzle—, no
   * una sentencia reescrita a mano acá, que afirmaría sobre otro sujeto.
   */
  it("le pide a Postgres UNA fila como mucho, nunca un conteo", async () => {
    const enviadas: string[] = [];
    const espiada = drizzle(pool, {
      schema,
      logger: { logQuery: (query) => enviadas.push(query) },
    }) as unknown as PublicationDatabase;

    await new DrizzlePublisherHasListings(espiada).hasAnyListing(CON_AVISO);

    expect(enviadas).toHaveLength(1);
    const sql = (enviadas[0] ?? "").toLowerCase();
    expect(sql).toContain("limit");
    expect(sql).not.toContain("count(");
  });
});
