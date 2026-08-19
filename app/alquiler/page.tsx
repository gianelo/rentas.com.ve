import { asc } from "drizzle-orm";
import type { Metadata } from "next";
import { buildSearchCriteria } from "@/modules/listing-search/domain/search-criteria";
import { DrizzleListingSearch } from "@/modules/listing-search/infrastructure/drizzle-listing-search";
import { db } from "@/shared/db/client";
import { cities as citiesTable, zones as zonesTable } from "@/shared/db/schema";
import { Container } from "../../components/layout/Container";
import { SidebarLayout } from "../../components/layout/SidebarLayout";
import { ResultRow } from "../../components/molecules/ResultRow";
import { SearchFilters } from "../../components/molecules/SearchFilters";
import styles from "./search.module.css";

export const metadata: Metadata = {
  title: "Alquileres — Rentas",
};

interface SearchPageProps {
  searchParams: Promise<Record<string, string | undefined>>;
}

/**
 * Artboard 2a — the search results.
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

  // `buildSearchCriteria` returns null without a city, and D5 is why: there
  // is no "search everywhere". A visitor who has not chosen one is asked to,
  // rather than shown a mixed list that quietly crosses cities.
  const criteria = buildSearchCriteria(
    {
      city: params.city,
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
    <Container>
      <SidebarLayout
        sidebar={
          <SearchFilters
            cities={cities}
            zones={zones}
            values={{
              city: params.city,
              zone: params.zone,
              minPrice: params.minPrice,
              maxPrice: params.maxPrice,
              minRooms: params.minRooms,
            }}
          />
        }
      >
        <h1 className={styles.count} data-testid="result-count">
          {criteria === null
            ? "Elegí una ciudad para ver los alquileres."
            : results.length === 1
              ? "1 propiedad activa"
              : `${results.length} propiedades activas`}
        </h1>

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
  );
}
