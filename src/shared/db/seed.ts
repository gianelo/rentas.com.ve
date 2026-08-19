import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
// TYPE-ONLY, and it has to stay that way. `./client` calls
// `getPooledDatabaseUrl()` at module scope, so a value import would make
// merely *importing* this file throw when DATABASE_URL is unset — before
// any caller has said which database it wants. A `database = db` default
// parameter does not help: the default is evaluated at call time, but the
// import that produces it runs at load time. `import type` is erased
// entirely by the compiler, so it costs nothing at runtime; the real client
// is pulled in by dynamic import inside `seed()`, and only when no handle
// was passed. This is not a style preference — CI caught the value import
// as a hard failure that local runs hid, because a local `.env` supplies
// DATABASE_URL and CI supplies only TEST_DATABASE_URL.
import type { db } from "./client";
import { cities, listings, users, zones } from "./schema";

/**
 * PROVISIONAL taxonomy (tasks.md 2.3). The founder has not supplied the
 * definitive city/zone list yet — this is a placeholder so the cascading
 * select (components/molecules/CityZoneSelect.tsx) and search have
 * something real to filter against.
 *
 * Replacing this list is a data edit to the array below, never a code or
 * schema change. Zones are a curated table with no free text (design.md
 * D5): a zone missing here is a publisher who cannot publish under it,
 * which is exactly why this list is flagged provisional rather than
 * quietly treated as final.
 */
export const PROVISIONAL_TAXONOMY: ReadonlyArray<{
  readonly city: string;
  readonly zones: readonly string[];
}> = [
  {
    city: "Distrito Capital",
    zones: ["Chacao", "Altamira", "La Castellana", "Los Palos Grandes", "El Rosal", "Las Mercedes"],
  },
  {
    city: "Maracaibo",
    zones: ["Tierra Negra", "Bella Vista", "La Lago", "Indio Mara"],
  },
];

/**
 * SEEDED LISTINGS — real rows in Postgres, not test fixtures and not a
 * mock. Search reads them through the same query a published listing will
 * use, so what a visitor sees on the preview is the real read path over
 * real data; only the origin of the rows is provisional.
 *
 * Every field comes from the design's own content registry
 * (design/reference/sistema/SISTEMA.md, "Contenido real usado"): its zones,
 * its price band of $250–$900, its literal titles, and the details that
 * decide a rental in this market — planta eléctrica, vigilancia 24 horas,
 * agua regular, puesto de estacionamiento, línea blanca incluida. The
 * registry exists precisely so nothing here is lorem ipsum: a layout tuned
 * against filler text breaks the first time a real title runs long.
 *
 * `publisherType` is mixed deliberately. The owner/broker distinction has
 * to be legible in greyscale (SISTEMA.md, "Distinción dueño / inmobiliaria"),
 * and a seed of all-owners would let that regression ship unnoticed.
 */
const SEEDED_LISTINGS: ReadonlyArray<{
  readonly city: string;
  readonly zone: string;
  readonly publisherType: "owner" | "broker";
  readonly title: string;
  readonly description: string;
  readonly priceUsd: number;
  readonly rooms: number;
  readonly areaM2: number;
}> = [
  {
    city: "Distrito Capital",
    zone: "Chacao",
    publisherType: "owner",
    title: "Apartamento 2 habitaciones con puesto de estacionamiento",
    description:
      "Piso 7 con vista abierta. Planta eléctrica, vigilancia 24 horas y agua regular. Puesto de estacionamiento techado. Depósito de dos meses.",
    priceUsd: 520,
    rooms: 2,
    areaM2: 78,
  },
  {
    city: "Distrito Capital",
    zone: "Altamira",
    publisherType: "owner",
    title: "Estudio en Altamira, ideal para una persona",
    description:
      "Amoblado completo, línea blanca incluida. Edificio con vigilancia y planta eléctrica. A cinco minutos del metro.",
    priceUsd: 320,
    rooms: 1,
    areaM2: 38,
  },
  {
    city: "Distrito Capital",
    zone: "La Castellana",
    publisherType: "broker",
    title: "Apartamento amplio en La Castellana, 3 habitaciones",
    description:
      "Tres habitaciones, dos baños y maletero. Planta eléctrica, tanque propio y vigilancia 24 horas. Dos puestos de estacionamiento.",
    priceUsd: 900,
    rooms: 3,
    areaM2: 145,
  },
  {
    city: "Distrito Capital",
    zone: "Los Palos Grandes",
    publisherType: "owner",
    title: "Apto amoblado cerca del metro, edificio con vigilancia",
    description:
      "Totalmente amoblado con línea blanca. Agua regular por tanque propio. Vigilancia 24 horas. Se pide depósito de dos meses.",
    priceUsd: 610,
    rooms: 2,
    areaM2: 84,
  },
  {
    city: "Distrito Capital",
    zone: "El Rosal",
    publisherType: "broker",
    title: "Apartamento 1 habitación en El Rosal, edificio remodelado",
    description:
      "Remodelado este año. Cocina con línea blanca nueva, planta eléctrica del edificio y puesto de estacionamiento asignado.",
    priceUsd: 430,
    rooms: 1,
    areaM2: 52,
  },
  {
    city: "Distrito Capital",
    zone: "Las Mercedes",
    publisherType: "broker",
    title: "Apartamento 2 habitaciones en Las Mercedes con maletero",
    description:
      "Edificio con vigilancia 24 horas, planta eléctrica y agua regular. Maletero incluido y un puesto de estacionamiento.",
    priceUsd: 750,
    rooms: 2,
    areaM2: 96,
  },
  {
    city: "Maracaibo",
    zone: "Tierra Negra",
    publisherType: "owner",
    title: "Apartamento 3 habitaciones en Tierra Negra, con planta",
    description:
      "Planta eléctrica propia y tanque de agua. Tres habitaciones con aire acondicionado. Puesto de estacionamiento techado.",
    priceUsd: 480,
    rooms: 3,
    areaM2: 120,
  },
  {
    city: "Maracaibo",
    zone: "Bella Vista",
    publisherType: "owner",
    title: "Estudio amoblado en Bella Vista, línea blanca incluida",
    description:
      "Estudio con cocina equipada y línea blanca. Edificio con vigilancia y planta eléctrica. Agua regular.",
    priceUsd: 250,
    rooms: 1,
    areaM2: 34,
  },
  {
    city: "Maracaibo",
    zone: "La Lago",
    publisherType: "broker",
    title: "Apartamento 2 habitaciones en La Lago, vista al lago",
    description:
      "Piso alto con vista al lago. Planta eléctrica, vigilancia 24 horas y dos puestos de estacionamiento. Depósito de dos meses.",
    priceUsd: 690,
    rooms: 2,
    areaM2: 92,
  },
  {
    city: "Maracaibo",
    zone: "Indio Mara",
    publisherType: "owner",
    title: "Apartamento 2 habitaciones en Indio Mara, agua regular",
    description:
      "Dos habitaciones con aire acondicionado, agua regular por tanque propio y planta eléctrica del edificio.",
    priceUsd: 380,
    rooms: 2,
    areaM2: 68,
  },
];

/**
 * A stable id derived from the row's own identity, so a repeat run conflicts
 * on the primary key instead of inserting a duplicate. This is what keeps
 * the listing seed idempotent WITHOUT adding a `seed_key` column: seeding is
 * not a product concern and should leave no trace in the schema.
 *
 * Not an RFC 4122 UUID — the version and variant bits are not set. The
 * column is `text`, nothing parses it as a UUID, and pretending otherwise
 * would be the kind of detail that is true until someone relies on it.
 */
function stableId(key: string): string {
  const hex = createHash("sha256").update(key).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/**
 * Seed publishers use the reserved `.invalid` TLD (RFC 2606), which can
 * never resolve to a real mailbox. That is the point: `user.email` is
 * unique and Auth.js matches a Google sign-in on it, so a seed address that
 * could ever be registered for real would eventually let a visitor sign in
 * and inherit a seeded publisher's listings.
 */
const SEED_PUBLISHERS = [
  { key: "owner", name: "Publicante de ejemplo (dueño)" },
  { key: "broker", name: "Inmobiliaria de ejemplo" },
] as const;

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Idempotent by construction: every insert conflicts on the table's own
 * unique constraint (`city.name`, `zone(city_id, name)`, `user.email`,
 * `listing.id`) and resolves to a no-op update rather than a duplicate row
 * on a repeat run — no read-before-write, no delete-then-insert. This
 * matters more than usual here: the Vercel Preview environment's Neon branch
 * is schema-only, this script is the only thing that populates it, and it
 * runs on every preview deploy (tasks.md 2.3).
 */
export type SeedDatabase = Pick<typeof db, "insert" | "select">;

/**
 * Loads `.env` into an environment object WITHOUT overwriting anything the
 * real environment already set. Exported so the precedence rule can be
 * tested directly, because it is the dangerous half of this: if `.env` won,
 * a deploy that supplies the real connection string through its environment
 * could be silently redirected to whatever a stray local file names. Same
 * rule, same reason, as vitest.integration.config.ts.
 *
 * `process.loadEnvFile` is Node's own parser (built in since 20.12, and
 * this project requires >= 22), so no dotenv dependency and no hand-rolled
 * quoting rules.
 */
export function loadDotEnvWithoutOverriding(env: Record<string, string | undefined>): void {
  const alreadySet = { ...env };
  try {
    process.loadEnvFile(".env");
  } catch {
    // No .env — normal on a deploy, where the values come from the
    // environment itself. Not an error, and not something to warn about.
  }
  for (const [key, value] of Object.entries(alreadySet)) {
    if (value !== undefined) env[key] = value;
  }
}

/**
 * The database handle is a parameter, defaulting to the real client, for
 * the same reason `drizzle.test.config.ts` exists: `./client` resolves
 * `DATABASE_URL` at import time and speaks Neon's HTTP driver, so a seed
 * hardwired to it can only ever be exercised against the real database.
 * That would leave this function's first genuine run on a preview deploy —
 * an unverified script populating the only environment anyone looks at.
 *
 * With the handle injected, tests/integration/seed.test.ts drives the exact
 * same code against the disposable Postgres container and asserts the rows
 * it produces, including a second run to prove idempotency.
 */
export async function seed(database?: SeedDatabase): Promise<void> {
  // Resolved here, not as a default parameter: the real client must not be
  // loaded at all when a handle was supplied (see the import note above).
  const target: SeedDatabase = database ?? (await import("./client")).db;
  for (const { city, zones: zoneNames } of PROVISIONAL_TAXONOMY) {
    const [cityRow] = await target
      .insert(cities)
      .values({ name: city })
      .onConflictDoUpdate({ target: cities.name, set: { name: city } })
      .returning({ id: cities.id });

    if (!cityRow) {
      throw new Error(`seed: upsert for city "${city}" returned no row`);
    }

    for (const zoneName of zoneNames) {
      await target
        .insert(zones)
        .values({ cityId: cityRow.id, name: zoneName })
        .onConflictDoNothing({ target: [zones.cityId, zones.name] });
    }
  }

  const publisherIds = new Map<string, string>();
  for (const { key, name } of SEED_PUBLISHERS) {
    const email = `seed-${key}@rentas.invalid`;
    const [row] = await target
      .insert(users)
      .values({ id: stableId(`publisher:${key}`), name, email })
      .onConflictDoUpdate({ target: users.email, set: { name } })
      .returning({ id: users.id });

    if (!row) {
      throw new Error(`seed: upsert for publisher "${key}" returned no row`);
    }
    publisherIds.set(key, row.id);
  }

  const publishedAt = new Date();
  const expiresAt = new Date(publishedAt.getTime() + THIRTY_DAYS_MS);

  for (const listing of SEEDED_LISTINGS) {
    const [zoneRow] = await target
      .select({ id: zones.id, cityId: zones.cityId })
      .from(zones)
      .innerJoin(cities, eq(zones.cityId, cities.id))
      .where(and(eq(cities.name, listing.city), eq(zones.name, listing.zone)))
      .limit(1);

    // A listing whose zone is missing from the taxonomy is a seed bug, not
    // a row to skip quietly: the composite foreign key would reject it
    // anyway, and a silent skip would show up later as a city that renders
    // fewer results than it should for no visible reason.
    if (!zoneRow) {
      throw new Error(`seed: zone "${listing.zone}" not found in city "${listing.city}"`);
    }

    const publisherId = publisherIds.get(listing.publisherType);
    if (!publisherId) {
      throw new Error(`seed: no seed publisher for type "${listing.publisherType}"`);
    }

    await target
      .insert(listings)
      .values({
        id: stableId(`listing:${listing.city}:${listing.zone}:${listing.title}`),
        publisherId,
        publisherType: listing.publisherType,
        cityId: zoneRow.cityId,
        zoneId: zoneRow.id,
        title: listing.title,
        description: listing.description,
        priceUsd: listing.priceUsd,
        rooms: listing.rooms,
        areaM2: listing.areaM2,
        // Seeded listings are demo data, so the contact is deliberately
        // UNUSABLE. Inventing a plausible number would put a contact into
        // the product that nobody owns, and the reveal button would hand a
        // tenant something that goes nowhere.
        contactMethod: "whatsapp" as const,
        contactValue: "sin-contacto",
        status: "active",
        publishedAt,
        expiresAt,
      })
      // Refreshes the 30-day window on every preview deploy, so a seeded
      // catalogue never silently expires out of search and leaves the
      // preview looking broken.
      .onConflictDoUpdate({ target: listings.id, set: { publishedAt, expiresAt } });
  }
}

// Runs only when invoked directly (`pnpm db:seed`), never on import — so
// this module can also be imported for its data (PROVISIONAL_TAXONOMY)
// without a side-effecting database call.
if (import.meta.url === `file://${process.argv[1]}`) {
  // `tsx` does not read `.env` — it only ever sees `process.env`. Without
  // this block `pnpm db:seed` could only work where DATABASE_URL already
  // came from the environment, which is why the command had never once run
  // on a developer machine: it failed with "DATABASE_URL environment
  // variable is not set" while the value sat in `.env`, right there.
  // `drizzle-kit` carries its own .env loading, so `pnpm db:migrate`
  // worked and hid the asymmetry.
  //
  // Deliberately inside the CLI entry and NOT at module scope. Loading
  // `.env` on import would push DATABASE_URL into the environment of every
  // test that imports this file, which is precisely the blindness that let
  // the module-scope client import ship (see tests/integration/seed.test.ts).
  //
  // A value already present in the real environment MUST WIN over `.env`,
  // matching vitest.integration.config.ts: a deploy supplies the real
  // connection string through the environment, and a local file must never
  // be able to redirect it.
  loadDotEnvWithoutOverriding(process.env);

  seed()
    .then(() => {
      console.log("seed: complete");
      process.exit(0);
    })
    .catch((error) => {
      console.error("seed: failed", error);
      process.exit(1);
    });
}
