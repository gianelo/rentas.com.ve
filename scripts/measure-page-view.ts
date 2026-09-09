#!/usr/bin/env tsx
/**
 * **La medición que tasks.md 27.1 pidió y nadie había corrido: una vista de
 * página COMPLETA, consulta por consulta, con datos realistas.** Es la
 * precondición escrita de la 27.3 ("depende de la medición de la 27.1") y de
 * la 27.4 (el techo de filas necesita un número, no una intuición) — las
 * rebanadas A–D de la 27.1 midieron su propia consulta, ninguna sumó una
 * vista entera.
 *
 * **Cómo mide.** Instancia las clases REALES del camino de lectura
 * (`DrizzleCatalogue`, `DrizzleActiveZones`, `DrizzleHomeCollections`,
 * `DrizzleListingPhotos`, `DrizzleFacetedSearch`, `DrizzleListingSearch`)
 * contra el mismo `pg.Pool` de `scripts/seed-e2e.ts`, pidiéndoles lo mismo que
 * `app/page.tsx`, `app/alquiler/[ciudad]/page.tsx` y
 * `app/alquiler/[ciudad]/[zona]/page.tsx`. Ninguna consulta se transcribe a
 * mano: se intercepta el `pool.query` real que Drizzle emite y esa MISMA
 * sentencia se vuelve a correr envuelta en `count(*)`/`pg_column_size(sub)`
 * para filas y bytes, y en `EXPLAIN ANALYZE` para el plan.
 *
 * **Los datos.** Limpia el residuo de otras suites de integración —ciudades
 * sin `slug`, que la taxonomía real nunca produce— y siembra avisos activos
 * en doce zonas reales de Caracas sobre la taxonomía real ya sembrada (5
 * áreas, miles de zonas), para llenar una página de resultados
 * (`RESULTS_PER_PAGE`) con facetas que cuenten algo distinto de cero.
 *
 * Uso: `TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5433/rentas_test pnpm tsx scripts/measure-page-view.ts`
 * Re-corrible: cada corrida vuelve a limpiar los avisos y a sembrar antes de medir.
 */
import { createHash } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import type { CatalogueDatabase } from "../src/modules/listing-catalogue/infrastructure/drizzle-catalogue";
import { DrizzleCatalogue } from "../src/modules/listing-catalogue/infrastructure/drizzle-catalogue";
import { homeCollections } from "../src/modules/listing-discovery/domain/home-collections";
import { DrizzleActiveZones } from "../src/modules/listing-discovery/infrastructure/drizzle-active-zones";
import { DrizzleHomeCollections } from "../src/modules/listing-discovery/infrastructure/drizzle-home-collections";
import { DrizzleListingPhotos } from "../src/modules/listing-discovery/infrastructure/drizzle-listing-photos";
import { RESULTS_PER_PAGE } from "../src/modules/listing-search/domain/pagination";
import { DrizzleFacetedSearch } from "../src/modules/listing-search/infrastructure/drizzle-faceted-search";
import { DrizzleListingSearch } from "../src/modules/listing-search/infrastructure/drizzle-listing-search";

const PROPERTY_TYPES = ["apartamento", "casa", "quinta", "anexo", "habitacion"] as const;
const PUBLISHER_EMAIL = "measure-27@rentas.invalid";

/** Doce zonas reales de Caracas y cuántos avisos les toca, para llenar una página real de `RESULTS_PER_PAGE`. */
const ZONE_LOAD: ReadonlyArray<readonly [name: string, count: number]> = [
  ["Altamira", 5],
  ["Alta Florida", 3],
  ["Alto Hatillo", 3],
  ["Alameda Plaza", 2],
  ["Alta Vista", 2],
  ["Alto de La Loma", 2],
  ["Aeropuerto Francisco de Miranda", 2],
  ["Agropecuaria El Paso del Avestruz", 2],
  ["Alimentador San Bernardino", 2],
  ["Alto de Irapa", 2],
  ["Alto del Paují", 2],
  ["Alto La Palua", 2],
];

interface CapturedQuery {
  readonly text: string;
  readonly values: readonly unknown[];
}

/** Filas y bytes crudos de una consulta ya capturada, contra el pool sin parchar. */
interface Measured {
  readonly rows: number;
  readonly bytes: number;
  readonly scan: string;
}

async function run(connectionString: string): Promise<void> {
  const pool = new Pool({ connectionString });
  const db = drizzle(pool) as unknown as CatalogueDatabase;

  // **La captura vive en `pool.query`, y no reescribe nada de Drizzle.**
  // `drizzle-orm/node-postgres` llama `client.query(config, params)` con
  // `client` siendo este mismo `pool` — interceptar acá es ver TODO el
  // tráfico real, sin tocar un solo adaptador.
  const captured: CapturedQuery[] = [];
  // biome-ignore lint/suspicious/noExplicitAny: parche de instrumentación de este script de medición, nunca código de producción.
  const rawQuery = pool.query.bind(pool) as (...args: any[]) => Promise<any>;
  // biome-ignore lint/suspicious/noExplicitAny: mismo motivo.
  (pool as any).query = (config: unknown, values?: unknown[]) => {
    const isConfigObject = typeof config === "object" && config !== null && "text" in config;
    const text = isConfigObject ? (config as { text: string }).text : (config as string);
    const params = isConfigObject
      ? ((config as { values?: unknown[] }).values ?? values ?? [])
      : (values ?? []);
    if (typeof text === "string" && /^\s*(select|with)/i.test(text)) {
      captured.push({ text, values: params });
    }
    return rawQuery(config, values);
  };

  async function capture<T>(
    fn: () => Promise<T>,
  ): Promise<{ result: T; queries: readonly CapturedQuery[] }> {
    const start = captured.length;
    const result = await fn();
    return { result, queries: captured.slice(start) };
  }

  async function measure(query: CapturedQuery): Promise<Measured> {
    const wrapped = `select count(*)::bigint as rows, coalesce(sum(pg_column_size(sub)),0)::bigint as bytes from (${query.text}) as sub`;
    const counted = await rawQuery(wrapped, query.values);
    const explained = await rawQuery(`explain analyze ${query.text}`, query.values);
    const plan = (explained.rows as { "QUERY PLAN": string }[])
      .map((row) => row["QUERY PLAN"])
      .join("\n");
    const scan =
      /(?:Bitmap )?Index (?:Only )?Scan (?:using|on) \S+/.exec(plan)?.[0] ??
      /(?:Bitmap Heap|Seq) Scan on \S+/.exec(plan)?.[0] ??
      "?";
    return { rows: Number(counted.rows[0].rows), bytes: Number(counted.rows[0].bytes), scan };
  }

  /** Corre `fn`, mide cada consulta SQL que emite e imprime una línea por consulta. Devuelve el resultado real. */
  async function report<T>(label: string, fn: () => Promise<T>): Promise<T> {
    const { result, queries } = await capture(fn);
    let totalRows = 0;
    let totalBytes = 0;
    for (const query of queries) {
      const measured = await measure(query);
      totalRows += measured.rows;
      totalBytes += measured.bytes;
      console.log(
        `  ${label}: ${measured.rows} fila(s), ${measured.bytes} bytes — ${measured.scan}`,
      );
    }
    if (queries.length === 0) console.log(`  ${label}: 0 consultas SQL emitidas`);
    else if (queries.length > 1) {
      console.log(
        `    (total: ${totalRows} filas, ${totalBytes} bytes en ${queries.length} consultas)`,
      );
    }
    return result;
  }

  try {
    const { caracasId, zoneIds } = await resetAndSeed(pool);

    const catalogue = new DrizzleCatalogue(db);
    const activeZonesHome = new DrizzleActiveZones(db);
    const homeCollectionsPort = new DrizzleHomeCollections(db);
    const photos = new DrizzleListingPhotos(db);
    const search = new DrizzleListingSearch(db);
    const facets = new DrizzleFacetedSearch(db);

    console.log(`RESULTS_PER_PAGE = ${RESULTS_PER_PAGE}, zonas sembradas = ${zoneIds.length}\n`);

    // ---- HOME (app/page.tsx) ----
    console.log("== HOME (app/page.tsx) ==");
    const cities = await report("listCities()", () => catalogue.listCities());
    await report("DrizzleActiveZones.listActiveZones() (sin ciudad)", () =>
      activeZonesHome.listActiveZones(),
    );
    const specs = homeCollections([...cities], null);
    const collections = await report(
      `DrizzleHomeCollections.collectionsFor(${specs.length} colecciones)`,
      () => homeCollectionsPort.collectionsFor(specs),
    );
    const homeListingIds = [
      ...new Set([...collections.values()].flatMap((page) => page.rows.map((row) => row.id))),
    ];
    await report(`DrizzleListingPhotos.coversFor(${homeListingIds.length} avisos)`, () =>
      photos.coversFor(homeListingIds),
    );

    // ---- CIUDAD (app/alquiler/[ciudad]/page.tsx) ----
    console.log("\n== CIUDAD — Caracas (app/alquiler/[ciudad]/page.tsx) ==");
    console.log(
      "  loadCities() [reutiliza listCities() de arriba — cache() lo dedupe a 0 consultas]",
    );
    // **El resultado se guarda y se usa** (task 27.8): antes se pedía y se
    // tiraba, y `countFacets` recibía `[]` — que con la consulta ya acotada
    // habría medido una fila trivial en vez de la pantalla real. Las zonas
    // ofrecidas son las que `buildFilterPanel` pasa hoy: las de este catálogo.
    const cityActiveZones = await report(
      "DrizzleCatalogue.listActiveZones(cityId) [panel de filtros]",
      () => catalogue.listActiveZones(caracasId),
    );
    const cityCriteria = { cityId: caracasId, page: 1 };
    const cityResults = await report(
      `DrizzleListingSearch.search(criteria) [LIMIT ${RESULTS_PER_PAGE}]`,
      () => search.search(cityCriteria),
    );
    await report(`DrizzleListingPhotos.coversFor(${cityResults.length} avisos)`, () =>
      photos.coversFor(cityResults.map((row) => row.id)),
    );
    const cityOfferedZoneIds = cityActiveZones.map((zone) => zone.id);
    await report(
      `DrizzleFacetedSearch.countFacets(criteria, ${cityOfferedZoneIds.length} zonas ofrecidas) [panel de filtros]`,
      () => facets.countFacets(cityCriteria, cityOfferedZoneIds),
    );

    // ---- ZONA (app/alquiler/[ciudad]/[zona]/page.tsx) ----
    console.log("\n== ZONA — Caracas/Altamira (app/alquiler/[ciudad]/[zona]/page.tsx) ==");
    await report("DrizzleCatalogue.findZoneBySlug(citySlug, zoneSlug) [resuelve la ruta]", () =>
      catalogue.findZoneBySlug("caracas", "altamira"),
    );
    console.log("  loadCities() [dedupe por cache(), mismo query que arriba]");
    const zoneActiveZones = await report(
      "DrizzleCatalogue.listActiveZones(cityId) [panel de filtros]",
      () => catalogue.listActiveZones(caracasId),
    );
    const zoneCriteria = { cityId: caracasId, zoneIds: [zoneIds[0] as string], page: 1 };
    const zoneResults = await report("DrizzleListingSearch.search(criteria) [zona única]", () =>
      search.search(zoneCriteria),
    );
    await report(`DrizzleListingPhotos.coversFor(${zoneResults.length} avisos)`, () =>
      photos.coversFor(zoneResults.map((row) => row.id)),
    );
    const zoneOfferedZoneIds = zoneActiveZones.map((zone) => zone.id);
    await report(
      `DrizzleFacetedSearch.countFacets(criteria, ${zoneOfferedZoneIds.length} zonas ofrecidas) [panel de filtros]`,
      () => facets.countFacets(zoneCriteria, zoneOfferedZoneIds),
    );
  } finally {
    await pool.end();
  }
}

function stableId(key: string): string {
  const hex = createHash("sha256").update(key).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/**
 * Limpia el residuo de otras suites de integración (ciudades sin `slug`, que
 * la taxonomía real nunca produce) y siembra avisos activos en Caracas,
 * repartidos en doce zonas reales — sobre la taxonomía real que ya vive en el
 * contenedor, nunca reemplazándola.
 */
async function resetAndSeed(
  pool: Pool,
): Promise<{ caracasId: string; zoneIds: readonly string[] }> {
  await pool.query("delete from listing_photo_derivative");
  await pool.query("delete from listing_photo");
  await pool.query("delete from listing");
  // El residuo de otras suites: la taxonomía real siempre tiene `slug`
  // (backfill de la 27.1, slice A); una ciudad de prueba nunca lo tiene.
  // Cascada por FK hasta zone y zone_alias — ver schema.ts.
  await pool.query("delete from city where slug is null");

  const { rows: cityRows } = await pool.query("select id from city where name = 'Caracas' limit 1");
  const caracasId: string | undefined = cityRows[0]?.id;
  if (!caracasId) {
    throw new Error("measure-page-view: 'Caracas' no está en la taxonomía sembrada.");
  }

  const { rows: publisherRows } = await pool.query(
    `insert into "user" (id, name, email) values ($1, $2, $3)
     on conflict (email) do update set name = excluded.name
     returning id`,
    [stableId(`publisher:${PUBLISHER_EMAIL}`), "Medición 27 — publicante", PUBLISHER_EMAIL],
  );
  const publisherId: string = publisherRows[0].id;

  const zoneIds: string[] = [];
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  let seeded = 0;
  for (const [zoneName, count] of ZONE_LOAD) {
    const { rows: zoneRows } = await pool.query(
      "select id from zone where city_id = $1 and name = $2 limit 1",
      [caracasId, zoneName],
    );
    const zoneId: string | undefined = zoneRows[0]?.id;
    if (!zoneId) throw new Error(`measure-page-view: zona "${zoneName}" no encontrada en Caracas.`);
    zoneIds.push(zoneId);

    for (let i = 0; i < count; i++) {
      seeded++;
      const listingId = stableId(`measure-listing:${zoneName}:${i}`);
      const propertyType = PROPERTY_TYPES[seeded % PROPERTY_TYPES.length];
      await pool.query(
        `insert into listing (
           id, publisher_id, publisher_type, city_id, zone_id, title, description,
           price_usd, rooms, area_m2, bathrooms, parking_spots, property_type,
           has_power_plant, has_regular_water, is_furnished, has_security, has_appliances,
           contact_method, contact_value, status, published_at, expires_at
         ) values (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
           $14, $15, $16, $17, $18, $19, $20, 'active', $21, $22
         )
         on conflict (id) do update set published_at = excluded.published_at, expires_at = excluded.expires_at`,
        [
          listingId,
          publisherId,
          seeded % 2 === 0 ? "owner" : "broker",
          caracasId,
          zoneId,
          `Aviso de medición ${seeded} en ${zoneName}`,
          "Aviso sembrado para medir la vista de página completa (tasks.md 27.1, F27.1). No es un aviso real.",
          250 + ((seeded * 37) % 650),
          1 + (seeded % 4),
          35 + ((seeded * 11) % 110),
          1 + (seeded % 3),
          seeded % 3,
          propertyType,
          seeded % 2 === 0,
          seeded % 3 === 0,
          seeded % 4 === 0,
          seeded % 2 === 1,
          seeded % 5 === 0,
          "whatsapp",
          "sin-contacto",
          new Date(now.getTime() - seeded * 60_000),
          expiresAt,
        ],
      );
      const photoId = `${listingId}-foto`;
      await pool.query(
        `insert into listing_photo (id, listing_id, position, created_at) values ($1,$2,0,$3)
         on conflict (id) do nothing`,
        [photoId, listingId, now],
      );
      for (const [name, bytes] of [["thumb", 4096] as const, ["card", 8192] as const]) {
        await pool.query(
          `insert into listing_photo_derivative (photo_id, name, key, bytes) values ($1,$2,$3,$4)
           on conflict (photo_id, name) do nothing`,
          [photoId, name, `measure/${listingId}/${name}.webp`, bytes],
        );
      }
    }
  }

  // Relleno en las OTRAS ciudades con estados mixtos: con sólo Caracas y sólo
  // `active`, `listing_city_status_idx` describe la tabla entera y el plan
  // gana con `Seq Scan` sin que el índice esté roto — es selectividad, no el
  // índice. 75 avisos por cada otra ciudad real, con `expired`/`hidden`
  // mezclados, es lo que le deja algo que descartar.
  await pool.query(
    `with target_zone as (
       select distinct on (c.id) c.id as city_id, z.id as zone_id
       from city c
       join zone z on z.city_id = c.id
       where c.id != $1
       order by c.id, z.id
     )
     insert into listing (
       id, publisher_id, publisher_type, city_id, zone_id, title, description,
       price_usd, rooms, area_m2, bathrooms, parking_spots, property_type,
       has_power_plant, has_regular_water, is_furnished, has_security, has_appliances,
       contact_method, contact_value, status, published_at, expires_at
     )
     select
       'filler-' || tz.city_id || '-' || gs,
       $2,
       case when gs % 2 = 0 then 'owner' else 'broker' end,
       tz.city_id, tz.zone_id,
       'Aviso relleno ' || gs,
       'Aviso sembrado para que el índice de ciudad/estado tenga algo que descartar (tasks.md 27.1, F27.1).',
       250 + (gs * 13 % 650), 1 + (gs % 4), 35 + (gs * 7 % 110), 1 + (gs % 3), gs % 3,
       (array['apartamento','casa','quinta','anexo','habitacion'])[1 + (gs % 5)],
       gs % 2 = 0, gs % 3 = 0, gs % 4 = 0, gs % 2 = 1, gs % 5 = 0,
       'whatsapp', 'sin-contacto',
       case when gs % 5 = 0 then 'expired' when gs % 7 = 0 then 'hidden' else 'active' end,
       now() - (gs || ' minutes')::interval,
       case when gs % 5 = 0 then now() - interval '1 day' else now() + interval '30 days' end
     from target_zone tz
     cross join generate_series(1, 75) gs
     on conflict (id) do nothing`,
    [caracasId, publisherId],
  );

  return { caracasId, zoneIds };
}

const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) {
  throw new Error(
    "measure-page-view: TEST_DATABASE_URL no está puesta. `pnpm db:test:up` primero.",
  );
}
await run(connectionString);
