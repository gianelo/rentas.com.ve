import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { LegacyPublicationDraftPort } from "../../src/modules/listing-publication/application/ports/legacy-publication-draft.port";
import {
  discardPublicationDraft,
  type PublicationDraftDependencies,
  readPublicationDraft,
  savePublicationDraft,
} from "../../src/modules/listing-publication/application/publication-draft-session";
import type { StoredPublicationDraft } from "../../src/modules/listing-publication/domain/publication-steps";
import {
  DrizzlePublicationDraftStore,
  type PublicationDraftDatabase,
} from "../../src/modules/listing-publication/infrastructure/drizzle-publication-draft-store";
import * as schema from "../../src/shared/db/schema";

/**
 * tasks.md 18.30 — **el caso de uso contra la base de verdad**, que es la costura
 * que este archivo de configuración existe para cubrir: con un doble del puerto,
 * "una fila con la forma de ayer" es un objeto que escribe la prueba; contra
 * Postgres es un `jsonb` que volvió de una columna. La cookie sí va con doble,
 * porque `next/headers` no existe fuera de un pedido.
 */
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

function dependencias(
  cookie: StoredPublicationDraft | null = null,
): PublicationDraftDependencies & {
  readonly legacy: { readonly clear: ReturnType<typeof vi.fn> };
} {
  const legacy: LegacyPublicationDraftPort = {
    read: async () => cookie,
    clear: vi.fn(async () => undefined),
  };
  return { store, legacy } as never;
}

const borrador: StoredPublicationDraft = {
  listing: { propertyType: "apartamento", priceUsd: 450, title: "Apartamento en Altamira" },
  photos: [{ key: `${MARIA}/uploads/uno.webp`, name: "cocina.webp", bytes: 120_000 }],
  violations: [],
};

beforeAll(async () => {
  await pool.query('INSERT INTO "user" (id, name, email) VALUES ($1, $2, $3)', [
    MARIA,
    "Maria",
    `sesion-${MARIA}@example.com`,
  ]);
});

afterAll(async () => {
  await pool.query('DELETE FROM "user" WHERE id = $1', [MARIA]);
  await pool.end();
});

describe("el borrador de publicar, del caso de uso a Postgres", () => {
  it("lo guardado vuelve, y la cookie del puente ya no se consulta", async () => {
    const deps = dependencias({
      listing: { title: "El de la cookie" },
      photos: [],
      violations: [],
    });
    const ahora = new Date();

    await savePublicationDraft(MARIA, borrador, ahora, deps);

    // Las 24 horas las puso `draftExpiresAt`, así que un instante muy posterior
    // al viejo TTL de treinta minutos sigue devolviendo el borrador.
    expect(
      await readPublicationDraft(MARIA, new Date(ahora.getTime() + 60 * 60_000), deps),
    ).toEqual(borrador);
    expect(deps.legacy.clear).toHaveBeenCalledTimes(1);
  });

  it("una fila con la forma de ayer vuelve limpia, y el resto del borrador sobrevive", async () => {
    // Escrita por SQL a propósito: es la única forma de tener en la columna lo
    // que el formulario de ayer escribía y el de hoy ya no sabe leer.
    await pool.query(
      `INSERT INTO "publish_draft" (publisher_id, answers, photos, expires_at)
       VALUES ($1, $2::jsonb, $3::jsonb, now() + interval '1 hour')
       ON CONFLICT (publisher_id) DO UPDATE SET answers = excluded.answers,
         photos = excluded.photos, expires_at = excluded.expires_at`,
      [
        MARIA,
        JSON.stringify({
          listing: { title: "Real", rooms: 2, priceUsd: "450", barrio: "un campo de ayer" },
          violations: ["nope"],
        }),
        JSON.stringify([{ key: "a", name: "A", bytes: 10 }, { key: "sin nombre" }]),
      ],
    );

    const draft = await readPublicationDraft(MARIA, new Date(), dependencias());

    expect(draft?.listing).toEqual({ title: "Real", rooms: 2 });
    expect(draft?.photos).toEqual([{ key: "a", name: "A", bytes: 10 }]);
  });

  it("descartar deja la cuenta sin fila, y el puente sin cookie", async () => {
    const deps = dependencias();
    await savePublicationDraft(MARIA, borrador, new Date(), deps);

    await discardPublicationDraft(MARIA, deps);

    expect(await readPublicationDraft(MARIA, new Date(), deps)).toBeNull();
    // Dos: guardar y descartar. **Toda escritura de la tabla se lleva la
    // cookie**, no sólo la última, que es lo que impide que quede una segunda
    // fuente en cualquier punto del flujo.
    expect(deps.legacy.clear).toHaveBeenCalledTimes(2);
  });
});
