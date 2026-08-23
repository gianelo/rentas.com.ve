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
  resolveZoneRoute,
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
 * **Esta página no decide nada de la búsqueda.** Traduce la petición en una
 * llamada a `buildFilterPanel` y dibuja lo que vuelve: la tabla de nombres de
 * la dirección es `SEARCH_QUERY_NAMES`, a dónde lleva cada opción del acordeón
 * lo decide `listing-search/domain/search-panel.ts`, y qué páginas hay lo
 * decide `pagination.ts`. Es la regla permanente del fundador, y encima tiene
 * una razón mecánica: el suelo de cobertura del 90 % llega a `domain/` y no
 * llega a `app/`, así que una regla escrita acá es una regla que ninguna
 * corrida de tests puede poner en rojo.
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

  // La ruta de la ciudad sola es adónde vuelve «Limpiar todo» (F8) y adónde
  // caen las búsquedas de dos zonas o más, que no tienen ruta propia.
  const cityPath = `/alquiler/${ciudad}`;
  const basePath = `${cityPath}/${zona}`;

  // Las zonas extra de F4. Acá sólo se traducen los ids de la dirección a
  // filas del catálogo, igual que `resolveZoneRoute` hace con los dos
  // segmentos de la ruta; **cuál sobrevive lo decide `buildSearchCriteria`**,
  // que ya deja caer la que no pertenece a esta ciudad sin llevarse la
  // búsqueda entera.
  const askedZoneIds = readZoneList(query[SEARCH_QUERY_NAMES.zone]);
  const extraZones = zones.filter(
    (candidate) =>
      candidate.cityId === place.city.id &&
      candidate.id !== place.zone.id &&
      askedZoneIds.includes(candidate.id),
  );

  // La zona de la ruta siempre entra, y las extra se suman con O. La ruta
  // afirma un lugar; la query sólo puede ensanchar la búsqueda dentro de la
  // misma ciudad.
  const chosenZoneIds = [place.zone.id, ...extraZones.map((extra) => extra.id)];

  // `null` significaría "nadie eligió ciudad", y acá la ciudad la afirma la
  // ruta: es inalcanzable. La caída es la búsqueda de la ciudad entera y no
  // una lista vacía, porque si alguna vez dejara de ser inalcanzable, la
  // respuesta honesta es "todo lo que hay acá" y no una pantalla en blanco.
  const criteria = buildSearchCriteria(
    {
      city: place.city.id,
      zone: chosenZoneIds.join(","),
      // Renombre de campos en el borde de entrega, que es justo lo que
      // `design.md` deja hacer acá: los nombres cortos de la URL son los del
      // fundador (F12) y los largos son los del dominio. La tabla es del
      // dominio y no se vuelve a escribir acá — una segunda tabla que
      // casualmente coincide es el bug que `indexing-contract.test.ts` existe
      // para atrapar.
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
  ) ?? { cityId: place.city.id };

  const results = await new DrizzleListingSearch(db).search(criteria);

  // **UNA llamada para las veinticuatro portadas.** Neon es HTTP: pedirlas de
  // a una son veinticuatro viajes de red, que es el N+1 clásico pagado en
  // latencia real. La firma del puerto lo hace inexpresable — no existe un
  // `coverFor(id)`.
  const covers = await new DrizzleListingPhotos(db).coversFor(results.map((row) => row.id));

  // Quién entra en la cuadrícula (regla F9), a dónde lleva cada tarjeta y de
  // qué derivada sale cada portada: las tres son del dominio.
  const cards = buildListingGrid(
    results.map((row) => ({
      ...row,
      cityName: place.city.name,
      zoneName: zones.find((candidate) => candidate.id === row.zoneId)?.name ?? place.zone.name,
    })),
    covers,
    readPhotoPublicBaseUrl(),
  );

  // **El panel va después de las filas, y son tres viajes en serie y no dos.**
  // Se paga a propósito: el atajo de F7 —con un solo resultado el botón lleva
  // a la ficha, no a una lista de uno— necesita la dirección de esa ficha, y
  // la dirección la arma `buildListingGrid` sobre las filas. Sin esto el botón
  // tendría que mandar a una pantalla intermedia que no informa nada.
  //
  // Que la ficha se pase cuando hay UNA tarjeta y no cuando el total es 1 es
  // lo mismo dicho antes: `resolveSearchConfirm` sólo la mira con el total en
  // 1, y con el total en 1 la única página trae esa única tarjeta.
  const { panel, counts } = await buildFilterPanel(new DrizzleFacetedSearch(db), {
    basePath,
    cityPath,
    query,
    cityId: place.city.id,
    cities: cities.map((candidate) => ({
      id: candidate.id,
      name: candidate.name,
      path: `/alquiler/${slugify(candidate.name)}`,
    })),
    // Las de esta ciudad, con la misma `slugify` que resuelve la ruta: es lo
    // que hace que tocar una sola zona caiga en su dirección canónica en vez
    // de en la ciudad con un parámetro.
    zones: zones
      .filter((candidate) => candidate.cityId === place.city.id)
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
    buildSearchHref(basePath, query, { page: page > 1 ? String(page) : null });

  return (
    <Container>
      {/* La barra del teléfono: adónde volver, qué se está mirando y el
          engranaje que abre el acordeón. En escritorio se esconde por CSS,
          porque ahí los filtros ya están a la vista en la barra lateral. */}
      <SearchSummaryBar
        backHref={cityPath}
        headline={panel.headline}
        summary={panel.summary}
        activeFilters={panel.activeFilters}
        // El ancla es la mitad del enlace: sin `#filtros` el engranaje recarga
        // la misma pantalla y el panel queda debajo de la cuadrícula, fuera de
        // vista.
        openHref={`${buildSearchHref(basePath, query, { step: "ciudad" })}#filtros`}
      />

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
          {/* La ciudad **ya lleva enlace**: `/alquiler/<ciudad>` existe desde
              que se construyó la pantalla de ciudad. Antes iba sin enlace, y
              la razón anotada era que una miga de pan que lleva a un 404 es
              peor que una que no lleva a ninguna parte. */}
          <li className={styles.crumb}>
            <a className={styles.crumbLink} href={cityPath}>
              {place.city.name}
            </a>
          </li>
          <li className={styles.crumb} aria-current="page">
            {place.zone.name}
          </li>
        </ol>
      </nav>

      <h1 className={styles.title}>Alquiler en {place.zone.name}</h1>

      {/* El título nombra la zona de la ruta, así que las zonas extra tienen
          que decirse: si no, la lista trae avisos de un sitio que el
          encabezado no menciona y parece un error. */}
      {extraZones.length > 0 ? (
        <p className={styles.alsoIn}>
          Incluye también {extraZones.map((extra) => extra.name).join(", ")}.
        </p>
      ) : null}

      {/* El conteo es el de la búsqueda entera, no el de esta página.
          **Cambió con la 14.10 y por su culpa**: antes decía cuántas tarjetas
          había en pantalla, que era lo honesto cuando la consulta traía todo.
          Con paginación, "9 propiedades" sobre la primera de trece páginas es
          el número equivocado con ventaja.

          Queda anotada la parte que sigue sin cerrar: los avisos sin portada
          no se dibujan (F9) pero sí se cuentan, así que este número puede ser
          mayor que la cantidad de tarjetas. La respuesta correcta es que la
          consulta no traiga los avisos sin portada, y eso es una tarea aparte
          — no un número maquillado acá. */}
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

        {/* Dos enlaces y ningún botón: son direcciones, y tienen que poder
            abrirse en otra pestaña, guardarse y pegarse. Sin JavaScript de
            cliente, igual que el resto de esta pantalla (D13). */}
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
