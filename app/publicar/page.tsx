import { asc } from "drizzle-orm";
import type { Metadata } from "next";
import { db } from "@/shared/db/client";
import { cities as citiesTable, zones as zonesTable } from "@/shared/db/schema";
import { Container } from "../../components/layout/Container";
import { PageShell } from "../../components/layout/PageShell";
import { requireSession } from "../_lib/require-session";
import { PublishForm } from "./PublishForm";

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
    <PageShell>
      <Container>
        <h1>Publicar un alquiler</h1>
        {/* The city arrives as a query parameter so choosing one reloads the
            page with the zone list already filtered — the same no-JS cascade
            CityZoneSelect uses on the search side. Nothing is written by a
            GET, so a stale pair is a rendering question, not a data one. */}
        <PublishForm cities={cities} zones={zones} values={{ cityId: ciudad }} />
      </Container>
    </PageShell>
  );
}
