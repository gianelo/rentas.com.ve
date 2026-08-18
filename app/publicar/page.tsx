import { asc } from "drizzle-orm";
import type { Metadata } from "next";
import { db } from "@/shared/db/client";
import { cities as citiesTable, zones as zonesTable } from "@/shared/db/schema";
import { requireSession } from "../_lib/require-session";
import { PublishForm } from "./PublishForm";
import styles from "./publish-page.module.css";

export const metadata: Metadata = {
  title: "Publicar — Rentas",
};

interface PublishPageProps {
  /** Only the city, so the zone `<select>` can be rebuilt on a plain GET. */
  searchParams: Promise<{ ciudad?: string }>;
}

/**
 * SISTEMA.md screen 3, step 1 of 2.
 *
 * Session-gated before anything is read: publishing is a protected action
 * (account-identity spec), and `requireSession` is the one place that
 * becomes a redirect. It carries `/publicar` as the callback so signing in
 * returns here rather than dropping someone on the home page having lost
 * what they came to do.
 *
 * Reads go through `db` (`neon-http`) rather than the transactional client
 * added for the publish write — this is the read path D2's latency argument
 * is about, and it holds no connection.
 */
export default async function PublishPage({ searchParams }: PublishPageProps) {
  await requireSession("/publicar");

  const { ciudad } = await searchParams;

  const [cities, zones] = await Promise.all([
    db
      .select({ id: citiesTable.id, name: citiesTable.name })
      .from(citiesTable)
      .orderBy(asc(citiesTable.name)),
    db
      .select({ id: zonesTable.id, name: zonesTable.name, cityId: zonesTable.cityId })
      .from(zonesTable)
      .orderBy(asc(zonesTable.name)),
  ]);

  return (
    <>
      {/* The bar the artboard puts on both viewports: the wordmark, and how
          far along the two steps someone is. */}
      <header className={styles.bar}>
        <div className={styles.barInner}>
          <p className={styles.brand}>rentas.</p>
          <span className={styles.step}>Paso 1 de 2</span>
        </div>
      </header>

      <main className={styles.column}>
        <h1 className={styles.title}>Publicar una propiedad</h1>
        {/* The city arrives as a query parameter so choosing one reloads the
            page with the zone list already filtered — the same no-JS cascade
            the search side uses. Nothing is written by a GET, so a stale pair
            is a rendering question rather than a data one. */}
        <PublishForm cities={cities} zones={zones} values={{ cityId: ciudad }} />
      </main>
    </>
  );
}
