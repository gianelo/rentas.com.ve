import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { Container } from "@/../components/layout/Container";
import { ListingCard, ListingGrid } from "@/../components/molecules/ListingCard";
import { DrizzleCatalogue } from "@/modules/listing-catalogue/infrastructure/drizzle-catalogue";
import { buildListingGrid } from "@/modules/listing-discovery/domain/listing-grid";
import {
  isFilteredZoneRoute,
  resolveZoneRoute,
} from "@/modules/listing-discovery/domain/zone-route";
import { DrizzleListingPhotos } from "@/modules/listing-discovery/infrastructure/drizzle-listing-photos";
import { readPhotoPublicBaseUrl } from "@/modules/listing-discovery/infrastructure/photo-public-base-url";
import { buildSearchCriteria } from "@/modules/listing-search/domain/search-criteria";
import { DrizzleListingSearch } from "@/modules/listing-search/infrastructure/drizzle-listing-search";
import { db } from "@/shared/db/client";
import styles from "./zona.module.css";

interface ZonaProps {
  params: Promise<{ ciudad: string; zona: string }>;
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
 * Los resultados de una zona — **y no una pantalla aparte**.
 *
 * La 14.24 borró `/buscar` después de mirar cómo escribe Airbnb sus URLs: el
 * lugar va en la RUTA y los filtros volátiles en la query. Como
 * `ListingSearchPort` garantiza a nivel de tipo que toda búsqueda lleva una
 * ciudad, toda búsqueda posible ya cae en una ruta de lugar, y esta página *es*
 * la búsqueda de esta zona. Lo que eso borra: la "página de zona" que la Fase
 * 11 planeaba como una vista propia deja de existir como concepto.
 *
 * **Destraba dos enlaces que hoy mueren en un 404.** La ficha ya apunta acá
 * desde «← Resultados» y desde «Ver avisos activos en …», y hasta ahora no
 * había nada del otro lado. Los dos llegan con los segmentos ya canónicos,
 * porque la ficha se redirige a la ruta que `buildListingPath` arma y esta
 * página resuelve contra la misma `slugify`.
 *
 * **Sin sesión y sin JavaScript de cliente.** Es el camino de lectura del D13:
 * un rastreador ve exactamente lo mismo que un visitante, y la dirección se
 * puede pegar en un grupo de WhatsApp, que es como circulan los avisos acá.
 */
export default async function ZonaPage({ params, searchParams }: ZonaProps) {
  const [{ ciudad, zona }, query] = await Promise.all([params, searchParams]);

  const [cities, zones] = await loadCatalogue();

  // Qué lugar nombran los dos segmentos lo decide el dominio. Se resuelven
  // juntos porque la zona sola es ambigua: `Centro` existe en Maracaibo y en
  // Distrito Capital.
  const place = resolveZoneRoute(cities, zones, ciudad, zona);
  // 404 y nunca una ciudad por defecto: responder 200 con los avisos de otra
  // parte publica contenido duplicado bajo una dirección inventada.
  if (!place) notFound();

  const criteria = buildSearchCriteria(
    {
      city: place.city.id,
      zone: place.zone.id,
      // Renombre de campos en el borde de entrega, que es justo lo que
      // `design.md` deja hacer acá: los nombres cortos de la URL son los del
      // fundador (F12) y los largos son los del dominio. Ninguna regla se
      // decide en esta línea.
      minPrice: query.min,
      maxPrice: query.max,
      minRooms: query.hab,
    },
    zones,
  );

  // `null` significaría "nadie eligió ciudad", y acá la ciudad la afirma la
  // ruta. Es inalcanzable, pero el tipo lo permite y una lista vacía es la
  // respuesta honesta si alguna vez dejara de serlo.
  const results = criteria ? await new DrizzleListingSearch(db).search(criteria) : [];

  // **UNA llamada para las veinte portadas.** Neon es HTTP: pedirlas de a una
  // son veinte viajes de red, que es el N+1 clásico pagado en latencia real.
  // La firma del puerto lo hace inexpresable — no existe un `coverFor(id)`.
  const covers = await new DrizzleListingPhotos(db).coversFor(results.map((row) => row.id));

  // Quién entra en la cuadrícula (regla F9), a dónde lleva cada tarjeta y de
  // qué derivada sale cada portada: las tres son del dominio.
  const cards = buildListingGrid(
    results.map((row) => ({
      ...row,
      cityName: place.city.name,
      zoneName: place.zone.name,
    })),
    covers,
    readPhotoPublicBaseUrl(),
  );

  return (
    <Container>
      <nav className={styles.breadcrumb} aria-label="Miga de pan">
        {/* Tres elementos y ni uno más: los separadores «›» los dibuja el CSS
            con un `::before`. Puestos como `<li>` propios, un lector de
            pantalla anunciaría "lista de cinco elementos" y leería en voz alta
            dos signos de puntuación que no son pasos de la ruta. */}
        <ol className={styles.crumbs}>
          <li className={styles.crumb}>
            <a className={styles.crumbLink} href="/">
              Inicio
            </a>
          </li>
          {/* La ciudad va sin enlace, y es decisión. `/alquiler/<ciudad>` está
              planeada en la 14.24 y todavía no existe: una miga de pan que
              lleva a un 404 es peor que una que no lleva a ninguna parte. */}
          <li className={styles.crumb}>{place.city.name}</li>
          <li className={styles.crumb} aria-current="page">
            {place.zone.name}
          </li>
        </ol>
      </nav>

      <h1 className={styles.title}>Alquiler en {place.zone.name}</h1>

      {/* El conteo es el de lo que hay en pantalla, no el de lo que devolvió
          la consulta. Los avisos sin portada no se dibujan (F9), y una línea
          que dice 12 sobre una cuadrícula de 9 es la clase de número que hace
          desconfiar del resto de la página. */}
      <p className={styles.count} data-testid="result-count">
        {cards.length === 1 ? "1 propiedad activa" : `${cards.length} propiedades activas`}
      </p>

      {cards.length === 0 ? (
        <p className={styles.empty}>
          {isFilteredZoneRoute(query)
            ? `No hay avisos en ${place.zone.name} con esos filtros. Probá ampliando el rango de precio o quitando las habitaciones.`
            : `Todavía no hay avisos publicados en ${place.zone.name}.`}
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

export async function generateMetadata({ params, searchParams }: ZonaProps): Promise<Metadata> {
  const [{ ciudad, zona }, query] = await Promise.all([params, searchParams]);

  const [cities, zones] = await loadCatalogue();
  const place = resolveZoneRoute(cities, zones, ciudad, zona);
  if (!place) return {};

  return {
    title: `Alquiler en ${place.zone.name}, ${place.city.name} — Rentas`,
    description: `Avisos de alquiler de larga estancia en ${place.zone.name}, ${place.city.name}. Publicar y buscar es gratis, sin comisión.`,
    // La regla mecánica de la 14.24: la zona se indexa, la zona refinada no.
    // Las refinadas son combinatorias, y publicarlas todas es contenido
    // duplicado sobre el dominio entero.
    robots: isFilteredZoneRoute(query) ? { index: false, follow: true } : undefined,
  };
}
