import { db } from "./client";
import { cities, zones } from "./schema";

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
 * Idempotent by construction: every insert conflicts on the table's own
 * unique constraint (`city.name`, `zone(city_id, name)`) and resolves to a
 * no-op update rather than a duplicate row on a repeat run — no
 * read-before-write, no delete-then-insert. This matters more than usual
 * here: the Vercel Preview environment's Neon branch is schema-only, this
 * script is the only thing that populates it, and it runs on every preview
 * deploy (tasks.md 2.3).
 */
export async function seed(): Promise<void> {
  for (const { city, zones: zoneNames } of PROVISIONAL_TAXONOMY) {
    const [cityRow] = await db
      .insert(cities)
      .values({ name: city })
      .onConflictDoUpdate({ target: cities.name, set: { name: city } })
      .returning({ id: cities.id });

    if (!cityRow) {
      throw new Error(`seed: upsert for city "${city}" returned no row`);
    }

    for (const zoneName of zoneNames) {
      await db
        .insert(zones)
        .values({ cityId: cityRow.id, name: zoneName })
        .onConflictDoNothing({ target: [zones.cityId, zones.name] });
    }
  }
}

// Runs only when invoked directly (`pnpm db:seed`), never on import — so
// this module can also be imported for its data (PROVISIONAL_TAXONOMY)
// without a side-effecting database call.
if (import.meta.url === `file://${process.argv[1]}`) {
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
