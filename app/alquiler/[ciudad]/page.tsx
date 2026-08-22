import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { Container } from "@/../components/layout/Container";
import { ListingCard, ListingGrid } from "@/../components/molecules/ListingCard";
import { DrizzleCatalogue } from "@/modules/listing-catalogue/infrastructure/drizzle-catalogue";
import { buildListingGrid } from "@/modules/listing-discovery/domain/listing-grid";
import {
  isFilteredZoneRoute,
  resolveCityRoute,
} from "@/modules/listing-discovery/domain/zone-route";
import { DrizzleListingPhotos } from "@/modules/listing-discovery/infrastructure/drizzle-listing-photos";
import { readPhotoPublicBaseUrl } from "@/modules/listing-discovery/infrastructure/photo-public-base-url";
import { buildSearchCriteria } from "@/modules/listing-search/domain/search-criteria";
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
 * dos veces que eso no se publica: la miga de pan de la página de zona deja la
 * ciudad **sin enlace** con la razón anotada al lado, y la 11.1 lo dice
 * textual — «un enlace a una ruta que no existe es un enlace roto».
 *
 * La 14.24 la había dejado planeada y sin construir. Es el mismo mecanismo que
 * la página de zona, con un segmento menos: `ListingSearchPort` garantiza a
 * nivel de tipo que toda búsqueda lleva una ciudad, así que **la ciudad sola ya
 * es una búsqueda válida** — y esta página *es* esa búsqueda.
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

  const criteria = buildSearchCriteria(
    {
      city: city.id,
      // Sin zona: eso es exactamente lo que distingue esta pantalla de la de
      // zona. Los filtros volátiles siguen viajando en la query con los
      // nombres cortos del fundador (F12).
      minPrice: query.min,
      maxPrice: query.max,
      minRooms: query.hab,
    },
    zones,
  );

  const results = criteria ? await new DrizzleListingSearch(db).search(criteria) : [];

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

  return (
    <Container>
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

      {/* El conteo es el de lo que hay en pantalla, no el de lo que devolvió la
          consulta: los avisos sin portada no se dibujan (F9), y una línea que
          dice 12 sobre una cuadrícula de 9 hace desconfiar del resto. */}
      <p className={styles.count} data-testid="result-count">
        {cards.length === 1 ? "1 propiedad activa" : `${cards.length} propiedades activas`}
      </p>

      {cards.length === 0 ? (
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
