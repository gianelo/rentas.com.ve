#!/usr/bin/env tsx
/**
 * **Borra la taxonomía provisional de un despliegue y siembra la real**
 * (tarea 17.15). Se corre a mano, una vez, mirándolo.
 *
 * El 2026-09-05 producción tenía diez zonas provisionales bajo dos ciudades
 * que `docs/territorio/` no nombra, en vez de las 5.796 zonas bajo 5 áreas
 * que el producto ofrece. El paso 2 de publicar no tenía una sola zona que
 * dar y publicar era imposible. `pnpm db:seed:taxonomy` no alcanza: siembra
 * lo que falta, y lo que sobra —las ciudades provisionales con sus avisos
 * colgando— se queda, así que el desplegable ofrecería «Chacao» dos veces.
 *
 * **Se niega antes de borrar, y ésa es la razón por la que esto se puede
 * aprobar sin abrir la base a mano.** Si un solo aviso pertenece a alguien
 * que no es un publicante de siembra, el guardián lo dice y no toca nada: la
 * precondición «acá no hay datos de nadie» se comprueba contra la base de
 * verdad al correr, en vez de asumirse por lo que alguien vio ayer. Lo mismo
 * con las tablas que guardan rastros de personas —revelados de contacto,
 * reportes, moderación—: cualquiera con filas detiene la corrida.
 *
 * **Ensayo por defecto.** Sin `--confirm` cuenta y explica, y no escribe.
 *
 * **Nunca borra de R2.** Al borrar las filas de las fotos sus objetos quedan
 * huérfanos, y esto los NOMBRA para que una persona limpie el bucket después.
 * Un objeto de más cuesta centavos y se borra mañana; uno borrado por error no
 * vuelve. Además así esta herramienta no necesita credenciales del bucket.
 *
 * **NO es atómico, y hay que saberlo antes de correrlo.** El driver HTTP de
 * Neon no soporta transacciones interactivas, así que el borrado y la siembra
 * son unas veinte sentencias sueltas: seis DELETE, doce lotes de zonas y ocho
 * de alias. Si se corta a la mitad —se cae la red, se agota el tiempo— el
 * despliegue queda sin avisos y con la taxonomía a medio sembrar.
 *
 * **Se recupera volviendo a correrlo con `--confirm`**, y por eso se puede
 * vivir con ello: sin avisos el guardián pasa solo, el borrado no encuentra
 * nada que borrar y la siembra empieza de nuevo. Los ids salen del camino
 * completo, así que las filas que alcanzaron a entrar son exactamente las que
 * el upsert vuelve a producir. Mientras tanto el chequeo de humo de la
 * taxonomía deja el estado a medias fuera de producción.
 *
 * Es una ventana aceptable SÓLO porque el producto todavía no está lanzado.
 * El día que haya avisos de gente adentro, esto ya no es la herramienta: hace
 * falta una migración que los conserve, que es justo lo que el guardián exige.
 *
 *     pnpm db:reseed:taxonomy              # ensayo
 *     pnpm db:reseed:taxonomy --confirm    # borra y siembra
 */
import { sql } from "drizzle-orm";
import {
  describeTaxonomyGaps,
  type TaxonomyGap,
} from "../src/modules/operability/domain/taxonomy-gap";
import {
  type SmokeDatabase,
  smokeRows,
} from "../src/modules/operability/infrastructure/schema-shapes";
import {
  expectedTaxonomy,
  findTaxonomyGapsIn,
} from "../src/modules/operability/infrastructure/taxonomy-census";
import {
  loadDotEnvWithoutOverriding,
  type SeedDatabase,
  seedTaxonomy,
} from "../src/shared/db/seed";

/** Sembrar necesita `insert`/`select`; contar y borrar, `execute`. */
export type ReseedDatabase = SeedDatabase & SmokeDatabase;

/**
 * **El orden lo manda el esquema, no el gusto.** `listing.city_id` es ON
 * DELETE RESTRICT y `listing_zone_city_fk` —el compuesto (zone_id, city_id)—
 * no declara `onDelete`, o sea NO ACTION: mientras exista un aviso no se puede
 * borrar ni su ciudad ni su zona. Las fotos van primero por la misma razón, y
 * aunque `zone_alias`, `listing_photo` y sus derivadas caerían solas por
 * CASCADE, se borran explícitas para contarlas antes. Es el orden que
 * `scripts/seed-e2e.ts` ya usa.
 *
 * `"user"` NO está: nada obliga a borrarlo, y ahí adentro está la cuenta del
 * fundador. Los publicantes de siembra quedan sin avisos, que es inofensivo.
 */
const DELETION_ORDER = [
  "listing_photo_derivative",
  "listing_photo",
  "listing",
  "zone_alias",
  "zone",
  "city",
] as const;

/**
 * Tablas que referencian avisos con RESTRICT y guardan rastros de gente: un
 * revelado de contacto es la métrica del producto y no se puede recrear. Con
 * filas acá el borrado fallaría a mitad de camino; se detiene antes.
 */
const TRACE_TABLES = ["contact_reveal_event", "listing_report", "moderation_action"] as const;

/** Los publicantes que `seedDemo` crea, por el correo que les pone. */
const SEED_PUBLISHER_EMAIL = "seed-%@rentas.invalid";

export interface TableRows {
  readonly table: string;
  readonly rows: number;
}

export interface UnsafeListing {
  readonly listingId: string;
  readonly title: string;
  /** Enmascarado desde la consulta hacia afuera: acá no circula una dirección. */
  readonly publisher: string;
}

export interface ReseedPlan {
  readonly deletions: readonly TableRows[];
  readonly traces: readonly TableRows[];
  readonly unsafeListings: readonly UnsafeListing[];
  readonly orphanedKeys: readonly string[];
  readonly expectedCities: number;
  readonly expectedZones: number;
}

export type ReseedStatus = "refused" | "dry-run" | "reseeded" | "unverified";

export interface ReseedResult {
  readonly status: ReseedStatus;
  readonly plan: ReseedPlan;
  readonly gaps: readonly TaxonomyGap[];
  readonly report: string;
}

/**
 * Deja la inicial y el dominio. Alcanza para reconocer una cuenta propia sin
 * escribir la dirección en una terminal y en el registro del despliegue.
 */
export function maskEmail(email: string | null): string {
  const [local, domain] = (email ?? "").split("@");
  if (!local || !domain) return "(sin correo)";
  return `${local.slice(0, 1)}***@${domain}`;
}

async function countRows(db: ReseedDatabase, table: string): Promise<number> {
  // `sql.raw` con un nombre de tabla que sale de las constantes de este
  // archivo, nunca de un argumento: no hay entrada de nadie en esta cadena.
  const rows = smokeRows<{ n: number }>(
    await db.execute(sql.raw(`select count(*)::int as n from "${table}"`)),
  );
  return Number(rows[0]?.n ?? 0);
}

export async function planReseed(db: ReseedDatabase): Promise<ReseedPlan> {
  const deletions: TableRows[] = [];
  for (const table of DELETION_ORDER) {
    deletions.push({ table, rows: await countRows(db, table) });
  }

  const traces: TableRows[] = [];
  for (const table of TRACE_TABLES) {
    const rows = await countRows(db, table);
    if (rows > 0) traces.push({ table, rows });
  }

  const unsafe = smokeRows<{ listing_id: string; title: string; email: string | null }>(
    await db.execute(sql`
      select l.id as listing_id, l.title, u.email
      from "listing" l
      join "user" u on u.id = l.publisher_id
      where u.email is null or u.email not like ${SEED_PUBLISHER_EMAIL}
      order by l.id
    `),
  );

  const derivatives = smokeRows<{ key: string }>(
    await db.execute(sql`select key from "listing_photo_derivative" order by key`),
  );

  const { cityNames, zoneIds } = expectedTaxonomy();
  return {
    deletions,
    traces,
    unsafeListings: unsafe.map((row) => ({
      listingId: row.listing_id,
      title: row.title,
      publisher: maskEmail(row.email),
    })),
    orphanedKeys: derivatives.map((row) => row.key),
    expectedCities: cityNames.length,
    expectedZones: zoneIds.length,
  };
}

/** Sólo se llega acá con el plan aprobado por el guardián. */
export async function applyReseed(db: ReseedDatabase): Promise<void> {
  for (const table of DELETION_ORDER) {
    await db.execute(sql.raw(`delete from "${table}"`));
  }
  await seedTaxonomy(db);
}

function describeOrphans(plan: ReseedPlan): string {
  if (plan.orphanedKeys.length === 0) return "  Ningún objeto de R2 queda huérfano.";
  return (
    `  ${plan.orphanedKeys.length} objeto(s) de R2 quedan HUÉRFANOS. Esta herramienta\n` +
    "  no borra del bucket a propósito: un objeto de más cuesta centavos y se\n" +
    "  puede borrar mañana, uno borrado por error no vuelve. Las claves son:\n" +
    plan.orphanedKeys.map((key) => `    ${key}`).join("\n")
  );
}

function describePlan(plan: ReseedPlan): string {
  return (
    plan.deletions.map((row) => `  ${row.table.padEnd(26)}${row.rows}`).join("\n") +
    `\n\n  La taxonomía quedaría con ${plan.expectedCities} área(s) y ` +
    `${plan.expectedZones} zona(s) de docs/territorio/.\n\n` +
    describeOrphans(plan)
  );
}

function describeRefusal(plan: ReseedPlan): string {
  const listings = plan.unsafeListings
    .map((row) => `    ${row.listingId}  ${row.publisher}  ${row.title}`)
    .join("\n");
  const traces = plan.traces.map((row) => `    ${row.table}: ${row.rows} fila(s)`).join("\n");

  return (
    "reseed-taxonomy: ME NIEGO A BORRAR — acá hay datos de gente.\n\n" +
    (plan.unsafeListings.length > 0
      ? `  ${plan.unsafeListings.length} aviso(s) no son de un publicante de siembra:\n${listings}\n\n`
      : "") +
    (plan.traces.length > 0
      ? `  Rastros de personas que bloquean el borrado:\n${traces}\n\n`
      : "") +
    "  No se tocó nada. Esto existe para una base que sólo tiene datos\n" +
    "  provisionales; con datos reales adentro hace falta una migración que los\n" +
    "  conserve, y eso se decide a mano."
  );
}

export async function reseedTaxonomy(
  db: ReseedDatabase,
  options: { readonly confirm: boolean },
): Promise<ReseedResult> {
  const plan = await planReseed(db);

  if (plan.unsafeListings.length > 0 || plan.traces.length > 0) {
    return { status: "refused", plan, gaps: [], report: describeRefusal(plan) };
  }

  if (!options.confirm) {
    return {
      status: "dry-run",
      plan,
      gaps: [],
      report:
        "reseed-taxonomy: ENSAYO — no se escribe nada. Pasá --confirm para ejecutar.\n\n" +
        "  Se borrarían:\n" +
        describePlan(plan),
    };
  }

  await applyReseed(db);

  // Se verifica por el mismo camino que el chequeo de humo del despliegue
  // (`scripts/taxonomy-smoke.ts`), no por una cuenta propia: una herramienta
  // que se aprueba a sí misma con su propia aritmética no prueba nada.
  const gaps = await findTaxonomyGapsIn(db);
  if (gaps.length > 0) {
    return {
      status: "unverified",
      plan,
      gaps,
      report:
        "reseed-taxonomy: SE BORRÓ Y LA SIEMBRA NO QUEDÓ COMPLETA.\n\n" +
        `${describeTaxonomyGaps(gaps)}\n\n` +
        "  Volvé a correr `pnpm db:seed:taxonomy`, que es idempotente y no borra\n" +
        "  nada, y después `pnpm smoke:taxonomy`.",
    };
  }

  return {
    status: "reseeded",
    plan,
    gaps,
    report:
      `reseed-taxonomy: listo. ${plan.expectedCities} área(s) y ${plan.expectedZones} ` +
      "zona(s) sembradas, y el chequeo de humo de la taxonomía las encuentra.\n\n" +
      describeOrphans(plan),
  };
}

// Sólo cuando se invoca directo, nunca al importar: la prueba de integración
// importa estas funciones y les pasa el contenedor desechable.
if (import.meta.url === `file://${process.argv[1]}`) {
  // Igual que `seed.ts`: `tsx` no lee `.env`, y lo que ya está en el entorno
  // real GANA sobre el archivo — un despliegue pasa su cadena de conexión por
  // el entorno y un archivo local no puede redirigirla.
  loadDotEnvWithoutOverriding(process.env);

  const confirm = process.argv.includes("--confirm");
  const { db } = await import("../src/shared/db/client");

  const result = await reseedTaxonomy(db as unknown as ReseedDatabase, { confirm });
  if (result.status === "refused" || result.status === "unverified") {
    console.error(result.report);
    process.exit(1);
  }
  console.log(result.report);
}
