import type { Metadata } from "next";
import { resolveSelectedCity, zonesForCity } from "@/modules/listing-catalogue/domain/catalogue";
import { DrizzleCatalogue } from "@/modules/listing-catalogue/infrastructure/drizzle-catalogue";
import { buildSearchCriteria } from "@/modules/listing-search/domain/search-criteria";
import { DrizzleListingSearch } from "@/modules/listing-search/infrastructure/drizzle-listing-search";
import { db } from "@/shared/db/client";
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

  const catalogue = new DrizzleCatalogue(db);
  const [cities, zones] = await Promise.all([catalogue.listCities(), catalogue.listZones()]);

  // Which city, and which zones go with it, are both decided in
  // listing-catalogue's domain. This page states neither rule: it fetches
  // through the port, asks, and renders. That is the whole job `design.md`
  // gives the `app/` tree — "a thin delivery adapter that only translates
  // HTTP/RSC into a use case call".
  //
  // `resolveSelectedCity` also rejects a city id the catalogue does not hold,
  // which this page previously passed straight through: `?city=cualquier-cosa`
  // reached `WHERE city_id = $1` and rendered an empty page for a catalogue
  // full of listings.
  const selectedCity = resolveSelectedCity(cities, params.city);
  // D5 on the read path: the selector offers one city's zones, never both.
  const selectableZones = zonesForCity(zones, selectedCity);

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
              zones={selectableZones}
              values={{
                city: selectedCity ?? undefined,
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
