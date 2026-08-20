import { asc } from "drizzle-orm";
import type { Metadata } from "next";
import { buildSearchCriteria } from "@/modules/listing-search/domain/search-criteria";
import { DrizzleListingSearch } from "@/modules/listing-search/infrastructure/drizzle-listing-search";
import { db } from "@/shared/db/client";
import { cities as citiesTable, zones as zonesTable } from "@/shared/db/schema";
import { Container } from "../components/layout/Container";
import { SidebarLayout } from "../components/layout/SidebarLayout";
import { ResultRow } from "../components/molecules/ResultRow";
import { SearchFilters } from "../components/molecules/SearchFilters";
import styles from "./search.module.css";

export const metadata: Metadata = {
  title: "Alquileres de larga estancia en Venezuela — Rentas",
  description:
    "Alquileres de larga estancia en Distrito Capital y Maracaibo. Publicar y buscar es gratis, sin comisión.",
};

interface SearchPageProps {
  searchParams: Promise<Record<string, string | undefined>>;
}

/**
 * Artboard 2a — the search results, and **the site's root**.
 *
 * There is no separate home page, and that is a decision rather than an
 * omission: the design has no home artboard and never mentions one, while a
 * classifieds product's strongest surface is its listings. A landing page
 * that only links onward spends the domain's strongest URL on a click.
 *
 * What it gives up, recorded so it is a choice and not a discovery: there is
 * nowhere to put a value proposition or a publish pitch beyond the bar's
 * "Publicar" button. If that is ever wanted it needs its own place.
 *
 * **No session and no client JavaScript.** This is the read path D13 is
 * about: browsing, filtering and navigating are server-rendered with the
 * state in the URL, so the page works before any bundle arrives and a
 * crawler sees the same thing a visitor does. The filter form is a plain
 * `GET`, which is also what makes a filtered search pasteable into a
 * WhatsApp message — the way listings actually circulate here.
 *
 * Reads go through `db` (`neon-http`), not the transactional client: this is
 * exactly the path D2's latency argument was about.
 */
export default async function SearchPage({ searchParams }: SearchPageProps) {
  const params = await searchParams;

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

  // **The first city when the URL names none**, which is what artboard 2a
  // draws: its sidebar shows Distrito Capital already chosen.
  //
  // The first version showed nothing until a city was picked, reasoning that
  // a default would answer D5's question on the visitor's behalf. That was
  // wrong in practice: both cities are visible as chips either way, so
  // nothing is hidden -- and what the caution actually bought was a root
  // whose first impression is an empty column, which reads as broken rather
  // than as an invitation. D5 is about never MIXING cities, and a named
  // default does not mix anything.
  //
  // The page supplies the default and SearchFilters stays dumb about it, so
  // it lives in one place rather than two that can disagree.
  const selectedCity = params.city ?? cities[0]?.id;

  const criteria = buildSearchCriteria(
    {
      city: selectedCity,
      zone: params.zone,
      minPrice: params.minPrice,
      maxPrice: params.maxPrice,
      minRooms: params.minRooms,
    },
    zones,
  );

  const results = criteria ? await new DrizzleListingSearch(db).search(criteria) : [];
  const zoneName = new Map(zones.map((zone) => [zone.id, zone.name]));
  const cityName = new Map(cities.map((city) => [city.id, city.name]));

  return (
    <>
      {/* The bar artboard 2a draws on both viewports: the wordmark, and the
          one action the whole supply side depends on. */}
      <header className={styles.bar}>
        <div className={styles.barInner}>
          <p className={styles.brand}>rentas.</p>
          <a className={styles.publish} href="/publicar">
            Publicar
          </a>
        </div>
      </header>

      <Container>
        <SidebarLayout
          sidebar={
            <SearchFilters
              cities={cities}
              zones={zones}
              values={{
                city: selectedCity,
                zone: params.zone,
                minPrice: params.minPrice,
                maxPrice: params.maxPrice,
                minRooms: params.minRooms,
              }}
            />
          }
        >
          {/* **An addition to the design, and stated as one.** Artboard 2a
            renders the count as plain text and gives this screen no heading
            at all. That is defensible on a results page reached from
            elsewhere; it is not defensible on the site's root, which needs a
            real `<h1>` for a screen reader's document outline and for the
            strongest URL on the domain. So the heading exists and is
            visually hidden, and the screen still looks exactly as drawn. */}
          <h1 className={styles.srOnly}>Alquileres de larga estancia en Venezuela</h1>

          <p className={styles.count} data-testid="result-count">
            {criteria === null
              ? "Todavía no hay ciudades cargadas."
              : results.length === 1
                ? "1 propiedad activa"
                : `${results.length} propiedades activas`}
          </p>

          {criteria !== null && results.length === 0 ? (
            // An empty result is a normal answer, not an error. Saying so, and
            // saying what to change, beats a blank column that reads as broken.
            <p className={styles.empty}>
              No hay avisos con esos filtros. Probá ampliando el rango de precio o quitando la zona.
            </p>
          ) : null}

          <ol className={styles.results}>
            {results.map((listing) => (
              <li key={listing.id}>
                <ResultRow
                  priceUsd={listing.priceUsd}
                  title={listing.title}
                  zone={zoneName.get(listing.zoneId) ?? ""}
                  city={cityName.get(listing.cityId) ?? ""}
                  rooms={listing.rooms}
                  areaM2={listing.areaM2}
                  publisherType={listing.publisherType}
                />
              </li>
            ))}
          </ol>
        </SidebarLayout>
      </Container>
    </>
  );
}
