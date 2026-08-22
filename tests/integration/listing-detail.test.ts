import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type DetailDatabase,
  DrizzleListingDetail,
} from "../../src/modules/listing-discovery/infrastructure/drizzle-listing-detail";
import * as schema from "../../src/shared/db/schema";

/**
 * `DrizzleListingDetail` contra Postgres real.
 *
 * Lo que sólo la base puede contestar son los cuatro joins: que el nombre de la
 * zona padre llegue —y que un aviso cuya zona NO tiene padre siga apareciendo,
 * que es lo que separa un `leftJoin` de un `innerJoin`— y que el estado decida
 * bien qué se sirve y qué no.
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
const db = drizzle(pool, { schema }) as unknown as DetailDatabase;
const details = new DrizzleListingDetail(db);

const CITY = randomUUID();
const PARENT_ZONE = randomUUID();
const CHILD_ZONE = randomUUID();
const ORPHAN_ZONE = randomUUID();
const PUBLISHER = randomUUID();
const ACTIVE = randomUUID();
const EXPIRED = randomUUID();
const HIDDEN = randomUUID();
const IN_ORPHAN = randomUUID();

async function insertListing(id: string, zoneId: string, status: string): Promise<void> {
  await pool.query(
    `INSERT INTO "listing"
       (id, publisher_id, publisher_type, property_type, city_id, zone_id, title, description,
        price_usd, rooms, area_m2, bathrooms, parking_spots,
        has_power_plant, has_regular_water, is_furnished, has_security, has_appliances,
        contact_method, contact_value, status, published_at, expires_at)
     VALUES ($1,$2,'owner','anexo',$3,$4,'Anexo con planta','Descripción larga.',
             450,2,78,1,0, true,true,false,true,false,
             'email','sin-contacto',$5,now(),now() + interval '30 days')`,
    [id, PUBLISHER, CITY, zoneId, status],
  );
}

beforeAll(async () => {
  await pool.query('INSERT INTO "city" (id, name) VALUES ($1,$2)', [CITY, `Ciudad ${CITY}`]);
  await pool.query(
    `INSERT INTO "zone" (id, city_id, name, kind, source) VALUES ($1,$2,$3,'parroquia','INE')`,
    [PARENT_ZONE, CITY, `Coquivacoa ${PARENT_ZONE}`],
  );
  await pool.query(
    `INSERT INTO "zone" (id, city_id, parent_id, name, kind, category, source)
     VALUES ($1,$2,$3,$4,'elemento','sector','IPOSTEL')`,
    [CHILD_ZONE, CITY, PARENT_ZONE, `Centro ${CHILD_ZONE}`],
  );
  // Sin padre: es lo que un `innerJoin` haría desaparecer en silencio.
  await pool.query(
    `INSERT INTO "zone" (id, city_id, name, kind, source) VALUES ($1,$2,$3,'municipio','INE')`,
    [ORPHAN_ZONE, CITY, `Municipio ${ORPHAN_ZONE}`],
  );
  await pool.query('INSERT INTO "user" (id, name, email) VALUES ($1,$2,$3)', [
    PUBLISHER,
    "María F.",
    `${PUBLISHER}@rentas.invalid`,
  ]);

  await insertListing(ACTIVE, CHILD_ZONE, "active");
  await insertListing(EXPIRED, CHILD_ZONE, "expired");
  await insertListing(HIDDEN, CHILD_ZONE, "hidden");
  await insertListing(IN_ORPHAN, ORPHAN_ZONE, "active");
});

afterAll(async () => {
  await pool.query('DELETE FROM "listing" WHERE publisher_id = $1', [PUBLISHER]);
  await pool.query('DELETE FROM "user" WHERE id = $1', [PUBLISHER]);
  await pool.query('DELETE FROM "city" WHERE id = $1', [CITY]);
  await pool.end();
});

describe("findForDetail", () => {
  it("trae todo lo que la ficha dibuja en una consulta", async () => {
    const detail = await details.findForDetail(ACTIVE);

    expect(detail).toMatchObject({
      id: ACTIVE,
      propertyType: "anexo",
      publisherType: "owner",
      publisherName: "María F.",
      rooms: 2,
      bathrooms: 1,
      areaM2: 78,
      // Un cero se guarda y se devuelve: la tira dibuja cuatro celdas siempre.
      parkingSpots: 0,
      contactMethod: "email",
    });
  });

  /**
   * **Los cinco atributos, con su asimetría intacta.** `false` significa "no lo
   * declaró", nunca "no lo tiene", y la ficha lista sólo lo declarado. Si el
   * adaptador los perdiera, la sección "La propiedad tiene" desaparecería sin
   * que nada fallara.
   */
  it("devuelve los cinco atributos tal como se declararon", async () => {
    const detail = await details.findForDetail(ACTIVE);

    expect(detail).toMatchObject({
      hasPowerPlant: true,
      hasRegularWater: true,
      isFurnished: false,
      hasSecurity: true,
      hasAppliances: false,
    });
  });

  it("trae el nombre de la zona padre, que es lo que desambigua una homónima", async () => {
    // `Centro` aparece en muchas parroquias; sin el padre la ficha no puede
    // decir cuál. En la taxonomía real `Buena Vista` se repite 12 veces.
    const detail = await details.findForDetail(ACTIVE);

    expect(detail?.zoneName).toContain("Centro");
    expect(detail?.zoneParentName).toContain("Coquivacoa");
    expect(detail?.zoneCategory).toBe("sector");
  });

  /**
   * **La razón por la que el join es `left` y no `inner`.** Los niveles de
   * arriba del árbol no tienen padre. Con un `inner`, un aviso publicado
   * directamente en un municipio devolvería `null` y la ficha sería un 404 —
   * sin que nada en la consulta pareciera roto.
   */
  it("sirve un aviso cuya zona no tiene padre", async () => {
    const detail = await details.findForDetail(IN_ORPHAN);

    expect(detail?.id).toBe(IN_ORPHAN);
    expect(detail?.zoneParentName).toBeNull();
  });

  /**
   * **Un aviso vencido SÍ se sirve**, al revés que en la búsqueda. La ficha
   * tiene un estado vencido dibujado — sin contacto, con la fecha y una salida
   * a los avisos activos de la zona — y devolver `null` lo convertiría en un
   * 404 sobre una URL que Google ya indexó.
   */
  it("sirve un aviso vencido, porque su ficha tiene un estado dibujado", async () => {
    const detail = await details.findForDetail(EXPIRED);

    expect(detail?.status).toBe("expired");
  });

  it("no sirve un aviso oculto", async () => {
    // `hidden` es el estado al que llega un aviso reportado. Servirlo dejaría
    // visible exactamente lo que la moderación quitó.
    expect(await details.findForDetail(HIDDEN)).toBeNull();
  });

  it("devuelve null para un id que no existe, igual que para uno oculto", async () => {
    // Indistinguibles a propósito: quien sondea URLs no puede averiguar si un
    // aviso fue dado de baja o nunca existió.
    expect(await details.findForDetail(randomUUID())).toBeNull();
  });

  /**
   * **El contacto no está en el tipo, y esto lo prueba contra la fila real.**
   * El valor sólo llega por el caso de uso que registra la revelación. Si la
   * consulta lo trajera, cualquier componente que serialice el aviso lo
   * mandaría al navegador, y esa fuga es silenciosa.
   */
  it("nunca trae el valor del contacto, sólo el método", async () => {
    const detail = await details.findForDetail(ACTIVE);

    expect(JSON.stringify(detail)).not.toContain("sin-contacto");
    expect(detail?.contactMethod).toBe("email");
  });
});
