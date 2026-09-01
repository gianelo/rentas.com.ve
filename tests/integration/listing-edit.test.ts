import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type {
  AuthenticatedSession,
  SessionPort,
} from "../../src/modules/identity/application/ports/session.port";
import {
  EditListingNotFoundError,
  EditListingRejectedError,
  editListing,
} from "../../src/modules/listing-publication/application/edit-listing";
import {
  DrizzleListingEdit,
  DrizzleZoneCatalogue,
  type PublicationDatabase,
} from "../../src/modules/listing-publication/infrastructure/drizzle-listing-repository";
import * as schema from "../../src/shared/db/schema";

/**
 * tasks.md 18.14 — editar un aviso publicado, contra Postgres de verdad.
 *
 * **Tres garantías que ningún doble puede probar, porque las tres son un
 * `WHERE`:**
 *
 * 1. que el `UPDATE` toca la fila de QUIEN edita y ninguna otra — con la fila
 *    de otra cuenta presente en la misma tabla y leída después;
 * 2. que `publisher_type` sigue diciendo lo mismo después de la edición, que
 *    es la garantía que el filtro «solo de dueños» necesita hacia atrás;
 * 3. que un aviso vencido y uno oculto por reportes no son editables, así que
 *    editar no puede ser el camino por el que algo apagado vuelve solo.
 *
 * Y una cuarta que no es un `WHERE` sino una tabla: **cambiar el contacto no
 * borra una sola fila de evidencia de revelado.** `contact_reveal_event` no
 * tiene columna para el valor del contacto —guarda que hubo un revelado, de
 * qué aviso, quién publicó y quién preguntó—, así que quien vuelve ve el
 * número vigente en vez de uno viejo, que sería peor.
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

const listings = new DrizzleListingEdit(db as unknown as PublicationDatabase);
const zones = new DrizzleZoneCatalogue(db as unknown as PublicationDatabase);

const CITY = randomUUID();
const ZONE = randomUUID();

const VALID_DESCRIPTION =
  "Apartamento en piso alto con vista abierta, cocina equipada con linea blanca, " +
  "planta electrica del edificio, vigilancia 24 horas y agua regular por tanque propio.";

function sessionFor(userId: string): SessionPort {
  const session: AuthenticatedSession = { userId, email: null, name: null };
  return { getSession: async () => session };
}

const USER_IDS: string[] = [];

async function insertUser(): Promise<string> {
  const id = randomUUID();
  USER_IDS.push(id);
  await pool.query(
    `INSERT INTO "user" (id, name, email, contact_method, contact_value)
     VALUES ($1,$2,$3,'whatsapp','04121234567')`,
    [id, "Dueño", `duenio-${id}@example.com`],
  );
  return id;
}

async function insertListing(
  publisherId: string,
  options: {
    readonly status?: string;
    readonly publisherType?: string;
    /** `false` deja el aviso sin una sola foto, que es lo que el validador refusa. */
    readonly withPhoto?: boolean;
    /** Para la 18.37. Sin decir nada, la columna queda en `false`. */
    readonly hasPowerPlant?: boolean;
  } = {},
): Promise<string> {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO "listing" (
       id, publisher_id, publisher_type, property_type, city_id, zone_id, title, description,
       price_usd, rooms, area_m2, bathrooms, parking_spots, status,
       has_power_plant,
       contact_method, contact_value, published_at, expires_at)
     VALUES ($1,$2,$3,'apartamento',$4,$5,$6,$7,610,3,128,2,1,$8,$9,'whatsapp','04121234567',
       now(), now() + interval '30 days')`,
    [
      id,
      publisherId,
      options.publisherType ?? "owner",
      CITY,
      ZONE,
      "Apartamento amoblado en La Castellana",
      VALID_DESCRIPTION,
      options.status ?? "active",
      options.hasPowerPlant ?? false,
    ],
  );
  if (options.withPhoto !== false) {
    await pool.query(
      `INSERT INTO "listing_photo" (id, listing_id, position, created_at) VALUES ($1,$2,0, now())`,
      [randomUUID(), id],
    );
  }
  return id;
}

async function readListing(id: string) {
  const { rows } = await pool.query(
    `SELECT title, price_usd, contact_method, contact_value, publisher_type, status, zone_id,
            city_id, property_type, parking_spots, reference,
            has_power_plant, has_regular_water, is_furnished
     FROM "listing" WHERE id = $1`,
    [id],
  );
  return rows[0] as
    | {
        title: string;
        price_usd: number;
        contact_method: string;
        contact_value: string;
        publisher_type: string;
        status: string;
        zone_id: string;
        city_id: string;
        property_type: string;
        parking_spots: number;
        reference: string | null;
        has_power_plant: boolean;
        has_regular_water: boolean;
        is_furnished: boolean;
      }
    | undefined;
}

beforeAll(async () => {
  await pool.query(`INSERT INTO "city" (id, name) VALUES ($1,$2)`, [CITY, `Ciudad ${CITY}`]);
  await pool.query(
    `INSERT INTO "zone" (id, city_id, name, kind, source) VALUES ($1,$2,$3,'parroquia','INE')`,
    [ZONE, CITY, `Zona ${ZONE}`],
  );
});

afterAll(async () => {
  // Antes que los usuarios, y no por orden estético: `contact_reveal_event`
  // referencia `user` con `ON DELETE RESTRICT` a propósito, para que cerrar
  // una cuenta no borre en silencio la evidencia del go/pivot. Este `DELETE`
  // explícito es lo que esa decisión le cuesta a la limpieza de una prueba.
  await pool.query(`DELETE FROM "contact_reveal_event" WHERE city_id = $1`, [CITY]);
  if (USER_IDS.length > 0) {
    await pool.query(`DELETE FROM "user" WHERE id = ANY($1)`, [USER_IDS]);
  }
  await pool.query(`DELETE FROM "zone" WHERE city_id = $1`, [CITY]);
  await pool.query(`DELETE FROM "city" WHERE id = $1`, [CITY]);
  await pool.end();
});

describe("editar un aviso publicado — contra Postgres de verdad (18.14)", () => {
  it("escribe la oferta nueva del dueño y deja intacta la fila de la otra cuenta", async () => {
    const owner = await insertUser();
    const stranger = await insertUser();
    const mine = await insertListing(owner);
    const theirs = await insertListing(stranger);

    await editListing(
      {
        listingId: mine,
        edit: { title: "Apartamento con vista, ahora amoblado", priceUsd: 700 },
      },
      { sessionPort: sessionFor(owner), zones, listings },
    );

    const edited = await readListing(mine);
    expect(edited?.title).toBe("Apartamento con vista, ahora amoblado");
    expect(edited?.price_usd).toBe(700);

    // La mitad que hace que la prueba pregunte algo: sin esto, un `UPDATE`
    // sin `WHERE publisher_id` pasaría igual.
    const untouched = await readListing(theirs);
    expect(untouched?.title).toBe("Apartamento amoblado en La Castellana");
    expect(untouched?.price_usd).toBe(610);
  });

  /**
   * tasks.md 18.27 — **los tres campos que la regla general del fundador abre,
   * en las columnas de verdad.** Con un doble del puerto, «se guardó» es una
   * llamada que la prueba mira; contra Postgres es la fila releída. Y el par que
   * hace que la prueba pregunte algo: la zona y la ciudad siguen donde estaban.
   */
  it("corrige la referencia, el tipo y los puestos, y no mueve la zona ni la ciudad", async () => {
    const owner = await insertUser();
    const mine = await insertListing(owner);
    const antes = await readListing(mine);

    await editListing(
      {
        listingId: mine,
        edit: {
          reference: "A dos calles de la plaza Altamira",
          propertyType: "anexo",
          parkingSpots: 0,
        },
      },
      { sessionPort: sessionFor(owner), zones, listings },
    );

    const editado = await readListing(mine);
    expect(editado?.reference).toBe("A dos calles de la plaza Altamira");
    expect(editado?.property_type).toBe("anexo");
    expect(editado?.parking_spots).toBe(0);
    expect(editado?.zone_id).toBe(antes?.zone_id);
    expect(editado?.city_id).toBe(antes?.city_id);
  });

  /** La referencia se BORRA, que es la otra mitad de «corregir cualquier dato»:
   *  una seña equivocada que sólo se puede reemplazar no se puede sacar. */
  it("mandar la referencia en blanco la deja en NULL, no en la de ayer", async () => {
    const owner = await insertUser();
    const mine = await insertListing(owner);

    await editListing(
      { listingId: mine, edit: { reference: "Frente a la panadería" } },
      { sessionPort: sessionFor(owner), zones, listings },
    );
    await editListing(
      { listingId: mine, edit: { reference: "" } },
      { sessionPort: sessionFor(owner), zones, listings },
    );

    expect((await readListing(mine))?.reference).toBeNull();
  });

  /** tasks.md 18.37 — **los cinco en las columnas de verdad.** Con un doble,
   *  «se guardó» es una llamada; contra Postgres es la fila releída, que es lo
   *  único que la búsqueda va a filtrar. */
  it("corrige los cinco atributos: escribe los que se declaran y BORRA los que ya no", async () => {
    const owner = await insertUser();
    const mine = await insertListing(owner, { hasPowerPlant: true });
    const antes = await readListing(mine);

    await editListing(
      {
        listingId: mine,
        edit: {
          hasPowerPlant: false,
          hasRegularWater: true,
          isFurnished: true,
          hasSecurity: false,
          hasAppliances: false,
        },
      },
      { sessionPort: sessionFor(owner), zones, listings },
    );

    const editado = await readListing(mine);
    // Los dos sentidos: sin el par, un `set` que escribiera siempre `true`
    // pasaría la mitad de esta prueba.
    expect(editado?.has_regular_water).toBe(true);
    expect(editado?.is_furnished).toBe(true);
    expect(editado?.has_power_plant).toBe(false);
    expect(editado?.zone_id).toBe(antes?.zone_id);
    expect(editado?.city_id).toBe(antes?.city_id);
  });

  /** La otra mitad: un pedido que no trae atributos deja los cinco como estaban.
   *  Sin esto, corregir el precio se llevaría por delante lo que el aviso declaró. */
  it("una edición que no manda atributos no toca ninguno de los cinco", async () => {
    const owner = await insertUser();
    const mine = await insertListing(owner, { hasPowerPlant: true });

    await editListing(
      { listingId: mine, edit: { priceUsd: 900 } },
      { sessionPort: sessionFor(owner), zones, listings },
    );

    const editado = await readListing(mine);
    expect(editado?.price_usd).toBe(900);
    expect(editado?.has_power_plant).toBe(true);
  });

  it("el aviso de otra cuenta no se puede editar, y su fila no cambia", async () => {
    const owner = await insertUser();
    const stranger = await insertUser();
    const theirs = await insertListing(stranger);

    await expect(
      editListing(
        { listingId: theirs, edit: { priceUsd: 1 } },
        { sessionPort: sessionFor(owner), zones, listings },
      ),
    ).rejects.toBeInstanceOf(EditListingNotFoundError);

    expect((await readListing(theirs))?.price_usd).toBe(610);
  });

  it("después de editar precio y contacto, publisher_type sigue diciendo lo mismo", async () => {
    const owner = await insertUser();
    const broker = await insertListing(owner, { publisherType: "broker" });

    await editListing(
      {
        listingId: broker,
        edit: { priceUsd: 850, contactMethod: "email", contactValue: "nuevo@example.com" },
      },
      { sessionPort: sessionFor(owner), zones, listings },
    );

    const after = await readListing(broker);
    expect(after?.price_usd).toBe(850);
    expect(after?.contact_value).toBe("nuevo@example.com");
    // La garantía que el filtro «solo de dueños» necesita hacia atrás.
    expect(after?.publisher_type).toBe("broker");
  });

  it("mandar un publisher_type distinto se refusa y la fila no se toca", async () => {
    const owner = await insertUser();
    const listingId = await insertListing(owner, { publisherType: "owner" });

    const error = await editListing(
      { listingId, edit: { publisherType: "broker", priceUsd: 900 } },
      { sessionPort: sessionFor(owner), zones, listings },
    ).catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(EditListingRejectedError);
    expect((error as EditListingRejectedError).violations).toContain("publisherType.immutable");

    const after = await readListing(listingId);
    expect(after?.publisher_type).toBe("owner");
    expect(after?.price_usd).toBe(610);
  });

  it("un aviso vencido y uno oculto por reportes no son editables, y siguen apagados", async () => {
    const owner = await insertUser();
    const expired = await insertListing(owner, { status: "expired" });
    const hidden = await insertListing(owner, { status: "hidden" });

    for (const listingId of [expired, hidden]) {
      await expect(
        editListing(
          { listingId, edit: { priceUsd: 999 } },
          { sessionPort: sessionFor(owner), zones, listings },
        ),
      ).rejects.toBeInstanceOf(EditListingNotFoundError);
    }

    expect((await readListing(expired))?.status).toBe("expired");
    expect((await readListing(hidden))?.status).toBe("hidden");
    expect((await readListing(hidden))?.price_usd).toBe(610);
  });

  it("un aviso que no podés editar no te cuenta POR QUÉ sería rechazado", async () => {
    // Un vencido sin una sola foto fallaría `photos.required` si alguien lo
    // validara. Contestarlo con esa violación en vez de con «no existe» le
    // diría a cualquiera que el aviso está ahí y en qué estado — que es
    // exactamente lo que el `WHERE` de la LECTURA impide, y no el de la
    // escritura (AGENTS.md §7).
    const owner = await insertUser();
    const listingId = await insertListing(owner, { status: "expired", withPhoto: false });

    const error = await editListing(
      { listingId, edit: { priceUsd: 700 } },
      { sessionPort: sessionFor(owner), zones, listings },
    ).catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(EditListingNotFoundError);
    expect(error).not.toBeInstanceOf(EditListingRejectedError);
  });

  it("el UPDATE mismo refusa una fila ajena o apagada, no sólo la lectura que lo precede", async () => {
    // **Esta prueba existe porque una mutación quedó verde.** Quitarle
    // `publisher_id` y `status` al `WHERE` de `applyEdit` no rompía nada: la
    // lectura ya había refusado antes de llegar. Pero el guarda de la
    // escritura no está para repetir la lectura — está para la ventana entre
    // las dos, en la que un aviso vence, lo ocultan tres denunciantes o lo
    // borran. Se llama al adaptador directo, que es la única forma de estar
    // parado dentro de esa ventana.
    const owner = await insertUser();
    const stranger = await insertUser();
    const theirs = await insertListing(stranger);
    const expired = await insertListing(owner, { status: "expired" });

    const write = {
      title: "Título escrito por quien no debía",
      description: VALID_DESCRIPTION,
      priceUsd: 111,
      rooms: 3,
      bathrooms: 2,
      areaM2: 128,
      parkingSpots: 1,
      propertyType: "apartamento" as const,
      reference: undefined,
      contactMethod: "whatsapp" as const,
      contactValue: "04121234567",
      hasPowerPlant: false,
      hasRegularWater: false,
      isFurnished: false,
      hasSecurity: false,
      hasAppliances: false,
    };

    expect(await listings.applyEdit(theirs, owner, write)).toBe(false);
    expect(await listings.applyEdit(expired, owner, write)).toBe(false);

    expect((await readListing(theirs))?.price_usd).toBe(610);
    expect((await readListing(expired))?.price_usd).toBe(610);

    // Y la mitad que hace que la prueba pregunte algo: el mismo `write`, sobre
    // la fila que SÍ es de esta cuenta y sigue activa, escribe.
    const mine = await insertListing(owner);
    expect(await listings.applyEdit(mine, owner, write)).toBe(true);
    expect((await readListing(mine))?.price_usd).toBe(111);
  });

  it("cambiar el contacto no borra ni reescribe la evidencia del revelado", async () => {
    const owner = await insertUser();
    const tenant = await insertUser();
    const listingId = await insertListing(owner);

    await pool.query(
      `INSERT INTO "contact_reveal_event"
         (id, listing_id, publisher_id, tenant_user_id, city_id, revealed_at, message)
       VALUES ($1,$2,$3,$4,$5, now(), 'Hola, sigue disponible?')`,
      [randomUUID(), listingId, owner, tenant, CITY],
    );

    await editListing(
      { listingId, edit: { contactMethod: "email", contactValue: "otro@example.com" } },
      { sessionPort: sessionFor(owner), zones, listings },
    );

    const { rows } = await pool.query(
      `SELECT tenant_user_id, message FROM "contact_reveal_event" WHERE listing_id = $1`,
      [listingId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].tenant_user_id).toBe(tenant);
    expect(rows[0].message).toBe("Hola, sigue disponible?");

    // Y quien vuelve ve el número vigente, no el que se reveló.
    expect((await readListing(listingId))?.contact_value).toBe("otro@example.com");
  });
});
