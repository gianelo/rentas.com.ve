import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { Container } from "@/../components/layout/Container";
import { SidebarLayout } from "@/../components/layout/SidebarLayout";
import { ListingCard, ListingGrid } from "@/../components/molecules/ListingCard";
import { SearchPanel } from "@/../components/organisms/SearchPanel";
import { SearchSummaryBar } from "@/../components/organisms/SearchSummaryBar";
import { DrizzleCatalogue } from "@/modules/listing-catalogue/infrastructure/drizzle-catalogue";
import { buildListingGrid } from "@/modules/listing-discovery/domain/listing-grid";
import { slugify } from "@/modules/listing-discovery/domain/listing-url";
import {
  isFilteredZoneRoute,
  resolveCityRoute,
} from "@/modules/listing-discovery/domain/zone-route";
import { DrizzleListingPhotos } from "@/modules/listing-discovery/infrastructure/drizzle-listing-photos";
import { readPhotoPublicBaseUrl } from "@/modules/listing-discovery/infrastructure/photo-public-base-url";
import { buildFilterPanel } from "@/modules/listing-search/application/build-filter-panel";
import { resolvePagination } from "@/modules/listing-search/domain/pagination";
import { buildSearchCriteria } from "@/modules/listing-search/domain/search-criteria";
import {
  buildSearchHref,
  readZoneList,
  SEARCH_QUERY_NAMES,
} from "@/modules/listing-search/domain/search-query";
import { DrizzleFacetedSearch } from "@/modules/listing-search/infrastructure/drizzle-faceted-search";
import { DrizzleListingSearch } from "@/modules/listing-search/infrastructure/drizzle-listing-search";
import { db } from "@/shared/db/client";
import styles from "./ciudad.module.css";

interface CiudadProps {
  params: Promise<{ ciudad: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}

/**
 * `generateMetadata` y el componente corren los dos por petición y los dos
 * necesitan el catálogo. `cache` los hace compartir una sola respuesta: sin
 * esto son cuatro viajes a Neon en vez de dos, y Neon es HTTP.
 */
const loadCatalogue = cache(async () => {
  const catalogue = new DrizzleCatalogue(db);

  return Promise.all([catalogue.listCities(), catalogue.listZones()]);
});

/**
 * Los avisos de una ciudad entera — **el nivel que faltaba entre el inicio y
 * la zona**.
 *
 * **Existe porque el inicio la necesita, y esa es la única razón honesta para
 * escribirla ahora.** La placa «Ver los 23» de cada tira de ciudad apunta acá.
 * Sin esta pantalla esa placa era un enlace roto, y el repositorio ya escribió
 * dos veces que eso no se publica: la 11.1 lo dice textual — «un enlace a una
 * ruta que no existe es un enlace roto».
 *
 * La 14.24 la había dejado planeada y sin construir. Es el mismo mecanismo que
 * la página de zona, con un segmento menos: `ListingSearchPort` garantiza a
 * nivel de tipo que toda búsqueda lleva una ciudad, así que **la ciudad sola ya
 * es una búsqueda válida** — y esta página *es* esa búsqueda. Por eso dibuja el
 * mismo acordeón y lo arma con el mismo `buildFilterPanel`: dos pantallas que
 * hacen la misma pregunta con dos bloques de orquestación copiados es cómo
 * empiezan a discrepar.
 *
 * **Sin sesión y sin JavaScript de cliente**, igual que el resto del camino de
 * lectura (D13).
 */
export default async function CiudadPage({ params, searchParams }: CiudadProps) {
  const [{ ciudad }, query] = await Promise.all([params, searchParams]);

  const [cities, zones] = await loadCatalogue();

  // Qué ciudad nombra el segmento lo decide el dominio. 404 y nunca la primera
  // ciudad: responder 200 con los avisos de otra parte publica contenido
  // duplicado bajo una dirección inventada.
  const city = resolveCityRoute(cities, ciudad);
  if (!city) notFound();

  // Acá la ruta que se ve y la ruta de la ciudad son la misma: no hay zona en
  // el camino, así que «Limpiar todo» vuelve a esta misma dirección sin
  // filtros.
  const cityPath = `/alquiler/${ciudad}`;

  // **La única diferencia real con la página de zona**: no hay zona afirmada
  // por la ruta, así que las elegidas salen enteras de `?zona=`. Cuáles
  // sobreviven lo decide `buildSearchCriteria`, que deja caer la que no
  // pertenece a esta ciudad sin llevarse la búsqueda entera.
  const askedZoneIds = readZoneList(query[SEARCH_QUERY_NAMES.zone]);
  const chosenZones = zones.filter(
    (candidate) => candidate.cityId === city.id && askedZoneIds.includes(candidate.id),
  );
  const chosenZoneIds = chosenZones.map((zone) => zone.id);

  // `null` significaría "nadie eligió ciudad", y acá la ciudad la afirma la
  // ruta: es inalcanzable. La caída es la búsqueda de la ciudad entera, que es
  // la respuesta honesta si alguna vez dejara de serlo.
  const criteria = buildSearchCriteria(
    {
      city: city.id,
      zone: chosenZoneIds.join(","),
      // La tabla de nombres es del dominio y no se vuelve a escribir acá: una
      // segunda tabla que casualmente coincide deja de coincidir en el próximo
      // parámetro, y ése es el bug que `indexing-contract.test.ts` atrapa.
      minPrice: query[SEARCH_QUERY_NAMES.minPrice],
      maxPrice: query[SEARCH_QUERY_NAMES.maxPrice],
      minRooms: query[SEARCH_QUERY_NAMES.minRooms],
      propertyType: query[SEARCH_QUERY_NAMES.propertyType],
      publisherType: query[SEARCH_QUERY_NAMES.publisherType],
      hasPowerPlant: query[SEARCH_QUERY_NAMES.hasPowerPlant],
      hasRegularWater: query[SEARCH_QUERY_NAMES.hasRegularWater],
      isFurnished: query[SEARCH_QUERY_NAMES.isFurnished],
      hasSecurity: query[SEARCH_QUERY_NAMES.hasSecurity],
      hasAppliances: query[SEARCH_QUERY_NAMES.hasAppliances],
      page: query[SEARCH_QUERY_NAMES.page],
    },
    zones,
  ) ?? { cityId: city.id };

  const results = await new DrizzleListingSearch(db).search(criteria);

  // **UNA llamada para todas las portadas.** Neon es HTTP: pedirlas de a una
  // son tantos viajes de red como avisos, que es el N+1 clásico pagado en
  // latencia real. La firma del puerto lo hace inexpresable.
  const covers = await new DrizzleListingPhotos(db).coversFor(results.map((row) => row.id));

  // A diferencia de la página de zona, acá los avisos vienen de zonas
  // distintas, así que el nombre de cada una se busca por su id.
  const zoneName = new Map(zones.map((zone) => [zone.id, zone.name]));

  const cards = buildListingGrid(
    results.map((row) => ({
      ...row,
      cityName: city.name,
      zoneName: zoneName.get(row.zoneId) ?? "",
    })),
    covers,
    readPhotoPublicBaseUrl(),
  );

  // El panel va después de las filas por la misma razón que en la página de
  // zona: el atajo de F7 —con un solo resultado el botón lleva a la ficha—
  // necesita la dirección de esa ficha, y la arma `buildListingGrid`.
  const { panel, counts } = await buildFilterPanel(new DrizzleFacetedSearch(db), {
    basePath: cityPath,
    cityPath,
    query,
    cityId: city.id,
    cities: cities.map((candidate) => ({
      id: candidate.id,
      name: candidate.name,
      path: `/alquiler/${slugify(candidate.name)}`,
    })),
    zones: zones
      .filter((candidate) => candidate.cityId === city.id)
      .map((candidate) => ({
        id: candidate.id,
        name: candidate.name,
        path: `${cityPath}/${slugify(candidate.name)}`,
      })),
    chosenZoneIds,
    criteria,
    onlyListingHref: cards.length === 1 ? cards[0]?.href : undefined,
  });

  const total = counts.total;
  const pagination = resolvePagination(criteria.page, total);
  const pageHref = (page: number) =>
    buildSearchHref(cityPath, query, { page: page > 1 ? String(page) : null });

  return (
    <Container>
      <SearchSummaryBar
        // Desde la ciudad se vuelve al inicio: es el nivel de arriba, y es de
        // donde vino quien tocó la placa «Ver los 23».
        backHref="/"
        headline={panel.headline}
        summary={panel.summary}
        activeFilters={panel.activeFilters}
        openHref={`${buildSearchHref(cityPath, query, { step: "ciudad" })}#filtros`}
      />

      <nav className={styles.breadcrumb} aria-label="Miga de pan">
        <ol className={styles.crumbs}>
          <li className={styles.crumb}>
            <a className={styles.crumbLink} href="/">
              Inicio
            </a>
          </li>
          <li className={styles.crumb} aria-current="page">
            {city.name}
          </li>
        </ol>
      </nav>

      <h1 className={styles.title}>Alquiler en {city.name}</h1>

      {/* El título nombra la ciudad entera, así que las zonas elegidas tienen
          que decirse: si no, la cuadrícula trae menos avisos que los que el
          encabezado promete y parece un error. */}
      {chosenZones.length > 0 ? (
        <p className={styles.alsoIn}>Sólo en {chosenZones.map((zone) => zone.name).join(", ")}.</p>
      ) : null}

      {/* El conteo es el de la búsqueda entera y no el de esta página.
          **Cambió al llegar la paginación, y por su culpa**: antes decía
          cuántas tarjetas había en pantalla, que era lo honesto cuando la
          consulta traía todo. Con 24 por página, "24 propiedades" sobre la
          primera de trece es el número equivocado con ventaja.

          Sigue sin cerrar la misma parte que en la página de zona: los avisos
          sin portada no se dibujan (F9) pero sí se cuentan, así que este número
          puede ser mayor que la cantidad de tarjetas. */}
      <p className={styles.count} data-testid="result-count">
        {total === 1 ? "1 propiedad activa" : `${total} propiedades activas`}
        {pagination.count > 1 ? ` — página ${pagination.current} de ${pagination.count}` : ""}
      </p>

      <SidebarLayout sidebar={<SearchPanel model={panel} />}>
        {pagination.beyondEnd ? (
          // La página que ya no existe: el enlace viejo pegado en un chat.
          // Se responde con la salida, no con una cuadrícula vacía sin causa.
          <p className={styles.empty}>
            Esa página ya no existe: la búsqueda tiene {pagination.count}.{" "}
            <a className={styles.pageLink} href={pageHref(pagination.count)}>
              Ver la última
            </a>
            .
          </p>
        ) : cards.length === 0 ? (
          <p className={styles.empty}>
            {isFilteredZoneRoute(query)
              ? `No hay avisos en ${city.name} con esos filtros. Probá ampliando el rango de precio o quitando las habitaciones.`
              : `Todavía no hay avisos publicados en ${city.name}.`}
          </p>
        ) : (
          <ListingGrid>
            {cards.map((card) => (
              <li key={card.id}>
                <ListingCard
                  href={card.href}
                  priceUsd={card.priceUsd}
                  title={card.title}
                  zone={card.zoneName}
                  rooms={card.rooms}
                  areaM2={card.areaM2}
                  publisherType={card.publisherType}
                  photo={card.photo}
                />
              </li>
            ))}
          </ListingGrid>
        )}

        {/* **La paginación que esta pantalla no tenía.** La consulta ya
            recortaba a 24 y la página no ofrecía ni un enlace: el aviso 25 en
            adelante existía y no había forma de llegar. Truncar en silencio es
            peor que no traer nada, porque nadie puede verlo.

            Enlaces y ningún botón: son direcciones, y tienen que poder abrirse
            en otra pestaña, guardarse y pegarse (D13). */}
        {pagination.count > 1 && !pagination.beyondEnd ? (
          <nav className={styles.pages} aria-label="Paginación">
            {pagination.previous === null ? null : (
              <a className={styles.pageLink} href={pageHref(pagination.previous)} rel="prev">
                ← Anterior
              </a>
            )}
            <span className={styles.pageStatus}>
              Página {pagination.current} de {pagination.count}
            </span>
            {pagination.next === null ? null : (
              <a className={styles.pageLink} href={pageHref(pagination.next)} rel="next">
                Siguiente →
              </a>
            )}
          </nav>
        ) : null}
      </SidebarLayout>
    </Container>
  );
}

export async function generateMetadata({ params, searchParams }: CiudadProps): Promise<Metadata> {
  const [{ ciudad }, query] = await Promise.all([params, searchParams]);

  const [cities] = await loadCatalogue();
  const city = resolveCityRoute(cities, ciudad);
  if (!city) return {};

  return {
    title: `Alquiler en ${city.name} — Rentas`,
    description: `Avisos de alquiler de larga estancia en ${city.name}. Publicar y buscar es gratis, sin comisión.`,
    // La misma regla mecánica que la página de zona: la ciudad se indexa, la
    // ciudad refinada no. Las refinadas son combinatorias, y publicarlas todas
    // es contenido duplicado sobre el dominio entero.
    robots: isFilteredZoneRoute(query) ? { index: false, follow: true } : undefined,
  };
}
