import { asc } from "drizzle-orm";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { db } from "@/shared/db/client";
import { cities as citiesTable, zones as zonesTable } from "@/shared/db/schema";
import { FormShell } from "../../components/layout/FormShell";
import { requireSession } from "../_lib/require-session";
import { submitPublishStep1 } from "./actions";
import { DRAFT_COOKIE, parseDraft } from "./draft";
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

  // What step 1 sent back to itself: the words already typed, and what was
  // wrong with them. A page cannot clear a cookie in Next — only an action or
  // a route handler can — so this one expires on its own after ten minutes.
  // Returning inside that window and finding your draft restored is the
  // better failure anyway: the alternative is retyping a description written
  // one-handed on a phone.
  const draft = parseDraft((await cookies()).get(DRAFT_COOKIE)?.value);

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

      <main className={styles.page}>
        {/* FormShell owns the 600px column — the heading is inside it, not
            beside it. Writing a max-width into this page's own stylesheet is
            what put the heading against the left edge of a 1280 screen, and
            it would have to be remembered again on every screen after this
            one. The primitive already existed; not using it was the bug. */}
        <FormShell>
          <h1 className={styles.title}>Publicar una propiedad</h1>

          {/* The city arrives as a query parameter so choosing one reloads the
            page with the zone list already filtered — the same no-JS cascade
            the search side uses. Nothing is written by a GET, so a stale pair
            is a rendering question rather than a data one. */}
          <PublishForm
            action={submitPublishStep1}
            cities={cities}
            zones={zones}
            values={{ ...draft?.values, cityId: ciudad ?? draft?.values.cityId }}
            violations={draft?.violations}
          />
        </FormShell>
      </main>
    </>
  );
}
