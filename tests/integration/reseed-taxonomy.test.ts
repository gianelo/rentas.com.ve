import { drizzle } from "drizzle-orm/node-postgres";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type ReseedDatabase, reseedTaxonomy } from "../../scripts/reseed-taxonomy";
import { type SeedDatabase, seed } from "../../src/shared/db/seed";
import { withPoolCleanup } from "./support/pool-cleanup";

/**
 * **La resiembra de la taxonomía (17.15), contra la forma exacta que
 * producción tenía el 2026-09-05.**
 *
 * La herramienta borra datos, así que lo que hay que probar no es que
 * siembre: es que se NIEGUE. La base se arma acá igual que la de producción
 * —dos ciudades que la taxonomía no nombra, diez zonas provisionales, avisos
 * colgando de ellas— y se afirman las tres respuestas en orden: se niega si
 * un aviso es de una persona real, el ensayo no toca nada, y sólo con
 * `--confirm` cambia algo.
 *
 * Se ejercita la función exportada y no el CLI porque el handle es un
 * parámetro, igual que en `seed.ts`: así la prueba corre contra el contenedor
 * desechable y nunca contra Neon.
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

const client = new Client({ connectionString: getTestDatabaseUrl() });
const database = drizzle(client);
const reseedDatabase = database as unknown as ReseedDatabase;

/** Las dos ciudades que producción tenía, con los nombres que tenía. */
const PROVISIONAL_CITIES = [
  { id: "provisional-distrito-capital", name: "Distrito Capital" },
  { id: "provisional-maracaibo", name: "Maracaibo" },
] as const;

/**
 * Diez zonas, todas `parroquia` y todas con `ubigeo` NULL: el censo exacto
 * que el fundador encontró, y no un puñado redondeado.
 */
const PROVISIONAL_ZONES = [
  { name: "Chacao", city: "provisional-distrito-capital" },
  { name: "Baruta", city: "provisional-distrito-capital" },
  { name: "El Hatillo", city: "provisional-distrito-capital" },
  { name: "Altamira", city: "provisional-distrito-capital" },
  { name: "La Castellana", city: "provisional-distrito-capital" },
  { name: "Las Mercedes", city: "provisional-distrito-capital" },
  { name: "El Rosal", city: "provisional-distrito-capital" },
  { name: "Bella Vista", city: "provisional-maracaibo" },
  { name: "Tierra Negra", city: "provisional-maracaibo" },
  { name: "Indio Mara", city: "provisional-maracaibo" },
] as const;

/** El aviso que cada prueba siembra, con los valores que el esquema exige. */
const LISTING_COLUMNS = `INSERT INTO "listing" (
   id, publisher_id, publisher_type, property_type, city_id, zone_id, title, description,
   price_usd, rooms, area_m2, bathrooms, parking_spots,
   has_power_plant, has_regular_water, is_furnished, has_security, has_appliances,
   contact_method, contact_value, status, published_at, expires_at)
 VALUES ($1, $2, 'owner', 'apartamento', $3, $4, $5,
   'Aviso provisional, sembrado por esta prueba para que la herramienta tenga qué borrar.',
   420, 2, 78, 2, 1, false, true, false, true, false,
   'whatsapp', 'sin-contacto', 'active', $6, $7)`;

const SEED_PUBLISHER = {
  id: "provisional-seed-owner",
  name: "Publicante de ejemplo (dueño)",
  email: "seed-owner@rentas.invalid",
} as const;

/** Una persona de verdad, con un correo de verdad. Nadie borra sus avisos. */
const REAL_PUBLISHER = {
  id: "provisional-real-publisher",
  name: "Alguien real",
  email: "inquilino@gmail.com",
} as const;

async function wipe(): Promise<void> {
  await client.query('DELETE FROM "listing_photo_derivative"');
  await client.query('DELETE FROM "listing_photo"');
  await client.query('DELETE FROM "listing"');
  await client.query('DELETE FROM "zone_alias"');
  await client.query('DELETE FROM "zone"');
  await client.query('DELETE FROM "user"');
  await client.query('DELETE FROM "city"');
}

async function countRows(table: string): Promise<number> {
  const result = await client.query<{ n: string }>(`SELECT count(*) AS n FROM "${table}"`);
  return Number(result.rows[0]?.n ?? 0);
}

async function insertUser(user: { id: string; name: string; email: string }): Promise<void> {
  await client.query('INSERT INTO "user" (id, name, email) VALUES ($1, $2, $3)', [
    user.id,
    user.name,
    user.email,
  ]);
}

async function insertListing(id: string, zoneName: string, publisherId: string): Promise<void> {
  const zone = PROVISIONAL_ZONES.find((candidate) => candidate.name === zoneName);
  if (!zone) throw new Error(`la prueba pide una zona que no sembró: ${zoneName}`);

  const at = new Date();
  const expires = new Date(at.getTime() + 30 * 24 * 60 * 60 * 1000);
  const zoneId = `provisional-${zoneName}`;
  const title = `Aviso en ${zoneName}`;
  await client.query(LISTING_COLUMNS, [id, publisherId, zone.city, zoneId, title, at, expires]);
}

describe("la resiembra de la taxonomía", () => {
  beforeAll(async () => {
    await client.connect();
    await wipe();

    for (const city of PROVISIONAL_CITIES) {
      await client.query('INSERT INTO "city" (id, name) VALUES ($1, $2)', [city.id, city.name]);
    }
    for (const zone of PROVISIONAL_ZONES) {
      await client.query(
        `INSERT INTO "zone" (id, city_id, parent_id, kind, category, name, ubigeo, postal_code, source)
         VALUES ($1, $2, NULL, 'parroquia', NULL, $3, NULL, NULL, 'INE')`,
        [`provisional-${zone.name}`, zone.city, zone.name],
      );
    }

    await insertUser(SEED_PUBLISHER);
    await insertListing("provisional-listing-1", "Chacao", SEED_PUBLISHER.id);
    await insertListing("provisional-listing-2", "Altamira", SEED_PUBLISHER.id);
    await insertListing("provisional-listing-3", "Bella Vista", SEED_PUBLISHER.id);
    await insertListing("provisional-listing-4", "Tierra Negra", SEED_PUBLISHER.id);
  });

  afterAll(async () => {
    await withPoolCleanup(client, async () => {
      // Esta suite comparte el contenedor con las otras: se devuelve la base
      // al estado que cualquiera de ellas espera encontrar.
      await wipe();
      await seed(database as unknown as SeedDatabase);
    });
  }, 180_000);

  it("se niega cuando un aviso es de una persona real, y no borra nada", async () => {
    await insertUser(REAL_PUBLISHER);
    await insertListing("provisional-listing-real", "El Rosal", REAL_PUBLISHER.id);

    try {
      const result = await reseedTaxonomy(reseedDatabase, { confirm: true });

      expect(result.status).toBe("refused");
      // El correo se nombra enmascarado: el mensaje va a una terminal y a un
      // registro de despliegue, y ninguno de los dos necesita la dirección.
      expect(result.report).not.toContain(REAL_PUBLISHER.email);
      expect(result.report).toContain("provisional-listing-real");

      // Lo que importa de una negativa: que no haya pasado nada.
      expect(await countRows("listing")).toBe(5);
      expect(await countRows("zone")).toBe(10);
      expect(await countRows("city")).toBe(2);
    } finally {
      await client.query('DELETE FROM "listing" WHERE id = $1', ["provisional-listing-real"]);
      await client.query('DELETE FROM "user" WHERE id = $1', [REAL_PUBLISHER.id]);
    }
  });

  it("el ensayo cuenta lo que borraría y no escribe nada", async () => {
    const result = await reseedTaxonomy(reseedDatabase, { confirm: false });

    expect(result.status).toBe("dry-run");
    expect(result.plan.deletions).toStrictEqual([
      { table: "listing_photo_derivative", rows: 0 },
      { table: "listing_photo", rows: 0 },
      { table: "listing", rows: 4 },
      { table: "zone_alias", rows: 0 },
      { table: "zone", rows: 10 },
      { table: "city", rows: 2 },
    ]);

    expect(await countRows("listing")).toBe(4);
    expect(await countRows("zone")).toBe(10);
    expect(await countRows("city")).toBe(2);
  });

  it("con --confirm borra lo provisional y deja la taxonomía real", async () => {
    const result = await reseedTaxonomy(reseedDatabase, { confirm: true });

    expect(result.status).toBe("reseeded");
    expect(result.gaps).toStrictEqual([]);

    // Ni la ciudad que la taxonomía no nombra ni las zonas que colgaban de
    // ella: si sobrevivieran, el desplegable volvería a ofrecer «Chacao» dos
    // veces y la resiembra habría dejado la base peor que antes.
    const survivors = await client.query('SELECT id FROM "city" WHERE id LIKE $1', [
      "provisional-%",
    ]);
    expect(survivors.rows).toStrictEqual([]);
    expect(await countRows("listing")).toBe(0);
    expect(await countRows("zone")).toBe(5796);
  }, 180_000);
});
