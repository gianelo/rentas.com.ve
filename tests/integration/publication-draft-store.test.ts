import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { StoredPublicationDraft } from "../../src/modules/listing-publication/domain/publication-steps";
import {
  DrizzlePublicationDraftStore,
  type PublicationDraftDatabase,
} from "../../src/modules/listing-publication/infrastructure/drizzle-publication-draft-store";
import * as schema from "../../src/shared/db/schema";

/** tasks.md 18.29 — contra Postgres de verdad, porque **lo que está bajo prueba es la
 *  base y no el código**: la primaria, el `WHERE expires_at > $ahora` y que un `jsonb`
 *  vuelva con la forma exacta con la que se guardó. */
const url = process.env.TEST_DATABASE_URL;
if (!url) {
  throw new Error(
    "TEST_DATABASE_URL is not set. Start the disposable database with " +
      "`pnpm db:test:up && pnpm db:test:migrate`.",
  );
}

const pool = new Pool({ connectionString: url });
const store = new DrizzlePublicationDraftStore(
  drizzle(pool, { schema }) as unknown as PublicationDraftDatabase,
);

const MARIA = randomUUID();
const AGENCIA = randomUUID();
const SE_FUE = randomUUID();
const UN_DIA = 86_400_000;

async function countDraftRows(publisherId: string): Promise<number> {
  const { rows } = await pool.query(
    'SELECT count(*)::int AS n FROM "publish_draft" WHERE publisher_id = $1',
    [publisherId],
  );
  return rows[0].n as number;
}

/** Contra el reloj de la base, nunca contra una fecha escrita a mano. */
async function databaseNow(): Promise<Date> {
  const { rows } = await pool.query("SELECT now() AS ahora");
  return rows[0].ahora as Date;
}

function draftOf(overrides: Partial<StoredPublicationDraft> = {}): StoredPublicationDraft {
  return {
    listing: { propertyType: "apartamento", priceUsd: 450, title: "Apartamento en Altamira" },
    photos: [{ key: `${MARIA}/uploads/uno.jpg`, name: "cocina.jpg", bytes: 120_000 }],
    violations: [],
    ...overrides,
  };
}

beforeAll(async () => {
  for (const id of [MARIA, AGENCIA, SE_FUE]) {
    const values = [id, `Cuenta ${id}`, `borrador-${id}@example.com`];
    await pool.query('INSERT INTO "user" (id, name, email) VALUES ($1, $2, $3)', values);
  }
});

afterAll(async () => {
  // `ON DELETE cascade`, así que borrar las cuentas se lleva los borradores.
  await pool.query('DELETE FROM "user" WHERE id = ANY($1)', [[MARIA, AGENCIA, SE_FUE]]);
  await pool.end();
});

describe("publish_draft contra Postgres real", () => {
  it("lo guardado vuelve entero, y lo que no se contestó vuelve sin contestar", async () => {
    const ahora = await databaseNow();
    const borrador = draftOf({
      featuresDeclared: true,
      violations: ["priceUsd.invalid"],
      raw: { priceUsd: "quinientos" },
    });
    await store.save(MARIA, borrador, new Date(ahora.getTime() + UN_DIA));
    expect(await store.load(MARIA, ahora)).toEqual(borrador);

    // `raw` ausente vuelve AUSENTE y no como `null`: un `null` donde no había nada
    // haría que `readRaw` viera un objeto que nadie escribió.
    await store.save(AGENCIA, draftOf(), new Date(ahora.getTime() + UN_DIA));
    const sinCrudo = await store.load(AGENCIA, ahora);
    expect(sinCrudo).not.toBeNull();
    expect(Object.hasOwn(sinCrudo as object, "raw")).toBe(false);
  });

  it("empezar de nuevo pisa la fila: la primaria no deja que existan dos borradores de una cuenta", async () => {
    const ahora = await databaseNow();
    const vence = new Date(ahora.getTime() + UN_DIA);
    const photos = [{ key: `${MARIA}/uploads/dos.jpg`, name: "sala.jpg", bytes: 90_000 }];
    const segundo = draftOf({ listing: { title: "El segundo" }, photos });
    await store.save(MARIA, draftOf({ listing: { title: "El primero" } }), vence);
    await store.save(MARIA, segundo, vence);

    // Se afirma el borrador ENTERO: el `set` del upsert es otro camino que el
    // `INSERT`, y sin esto perder las fotos al reescribir la fila pasa en verde.
    expect(await countDraftRows(MARIA)).toBe(1);
    expect(await store.load(MARIA, ahora)).toEqual(segundo);

    // **La garantía se comprueba violándola, no leyendo el DDL.** Sin la primaria
    // este `INSERT` pasaría y la cuenta tendría dos borradores.
    await expect(
      pool.query(
        `INSERT INTO "publish_draft" (publisher_id, answers, photos, expires_at)
         VALUES ($1, '{}'::jsonb, '[]'::jsonb, now())`,
        [MARIA],
      ),
    ).rejects.toThrow(/publish_draft_pkey|duplicate key/);
  });

  it("guardar de nuevo corre el vencimiento: quien vuelve retoma donde estaba", async () => {
    const ahora = await databaseNow();
    const borrador = draftOf({ listing: { title: "A medio hacer" } });
    const despues = new Date(ahora.getTime() + 2_000);
    await store.save(AGENCIA, borrador, new Date(ahora.getTime() + 1_000));
    expect(await store.load(AGENCIA, despues)).toBeNull();

    await store.save(AGENCIA, borrador, new Date(ahora.getTime() + UN_DIA));

    expect((await store.load(AGENCIA, despues))?.listing.title).toBe("A medio hacer");
    expect(await countDraftRows(AGENCIA)).toBe(1);
  });

  it("un borrador vencido no vuelve, y en el instante exacto tampoco", async () => {
    const vence = new Date((await databaseNow()).getTime() + UN_DIA);
    await store.save(SE_FUE, draftOf(), vence);

    expect(await store.load(SE_FUE, new Date(vence.getTime() - 1))).not.toBeNull();
    // El borde cerrado de `hasDraftExpired`, comprobado en el `WHERE`. Y la fila
    // sigue ahí: `load` no la devuelve pero tampoco la borra — eso es del barrido.
    expect(await store.load(SE_FUE, vence)).toBeNull();
    expect(await countDraftRows(SE_FUE)).toBe(1);
  });

  it("descartar borra sólo el borrador de esa cuenta, y descartar dos veces no falla", async () => {
    const vence = new Date((await databaseNow()).getTime() + UN_DIA);
    await store.save(SE_FUE, draftOf(), vence);
    await store.save(MARIA, draftOf(), vence);

    await store.discard(SE_FUE);

    expect(await countDraftRows(SE_FUE)).toBe(0);
    expect(await countDraftRows(MARIA)).toBe(1);
    // Publicar de verdad y abandonar terminan en el mismo estado: sin fila.
    await expect(store.discard(SE_FUE)).resolves.toBeUndefined();
  });
});
