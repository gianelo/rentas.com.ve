import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { Container } from "@/../components/layout/Container";
import { SidebarLayout } from "@/../components/layout/SidebarLayout";
import { ListingCard, ListingGrid } from "@/../components/molecules/ListingCard";
import {
  type SearchFilterControl,
  type SearchFilterField,
  SearchFilters,
} from "@/../components/molecules/SearchFilters";
import { DrizzleCatalogue } from "@/modules/listing-catalogue/infrastructure/drizzle-catalogue";
import { buildListingGrid } from "@/modules/listing-discovery/domain/listing-grid";
import { slugify } from "@/modules/listing-discovery/domain/listing-url";
import {
  isFilteredZoneRoute,
  resolveZoneRoute,
} from "@/modules/listing-discovery/domain/zone-route";
import { DrizzleListingPhotos } from "@/modules/listing-discovery/infrastructure/drizzle-listing-photos";
import { readPhotoPublicBaseUrl } from "@/modules/listing-discovery/infrastructure/photo-public-base-url";
import { resolvePagination } from "@/modules/listing-search/domain/pagination";
import { buildSearchCriteria } from "@/modules/listing-search/domain/search-criteria";
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
 * **Los nombres cortos son los del fundador (F12)**, y el renombre a los
 * largos del dominio pasa acá, en el borde de entrega. Escritos como una tabla
 * y no repartidos por el archivo: son el contrato de la dirección, y una
 * dirección compartida por WhatsApp hace meses tiene que seguir significando
 * lo mismo.
 *
 * Los cinco de los servicios no estaban en la lista del fundador; se eligieron
 * en el mismo registro corto y en español, que es el criterio que la lista
 * establece.
 */
const QUERY_NAMES: Readonly<Record<SearchFilterField, string>> = {
  city: "ciudad",
  zone: "zona",
  minPrice: "min",
  maxPrice: "max",
  minRooms: "hab",
  propertyType: "tipo",
  publisherType: "pub",
  hasPowerPlant: "planta",
  hasRegularWater: "agua",
  isFurnished: "amoblado",
  hasSecurity: "vigilancia",
  hasAppliances: "electro",
};

/**
 * La página va aparte porque no es un campo del formulario: enviarlo volvería
 * a la página 3 después de cambiar un filtro, cuando lo correcto es volver a
 * la primera de la búsqueda nueva.
 */
const PAGE_PARAM = "pag";

/** Los grupos que esta pantalla puede leer de vuelta. El lugar lo trae la ruta. */
const FILTER_CONTROLS: readonly SearchFilterControl[] = [
  "price",
  "rooms",
  "propertyType",
  "publisherType",
  "attributes",
];

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

  // Las zonas extra de F4, en la forma legible que el fundador escribió:
  // `?zona=chacao,altamira`. Acá sólo se traducen los nombres de la dirección
  // a ids, igual que `resolveZoneRoute` hace con los dos segmentos de la ruta;
  // **cuál sobrevive lo decide `buildSearchCriteria`**, que ya deja caer la
  // que no pertenece a esta ciudad sin llevarse la búsqueda entera.
  const extraZones = zones.filter(
    (candidate) =>
      candidate.cityId === place.city.id &&
      candidate.id !== place.zone.id &&
      readList(query[QUERY_NAMES.zone]).includes(slugify(candidate.name)),
  );

  const criteria = buildSearchCriteria(
    {
      city: place.city.id,
      // La zona de la ruta siempre entra, y las extra se suman con O. La ruta
      // afirma un lugar; la query sólo puede ensanchar la búsqueda dentro de
      // la misma ciudad.
      zone: [place.zone.id, ...extraZones.map((extra) => extra.id)].join(","),
      // Renombre de campos en el borde de entrega, que es justo lo que
      // `design.md` deja hacer acá: los nombres cortos de la URL son los del
      // fundador (F12) y los largos son los del dominio. Ninguna regla se
      // decide en esta línea.
      minPrice: query[QUERY_NAMES.minPrice],
      maxPrice: query[QUERY_NAMES.maxPrice],
      minRooms: query[QUERY_NAMES.minRooms],
      propertyType: query[QUERY_NAMES.propertyType],
      publisherType: query[QUERY_NAMES.publisherType],
      hasPowerPlant: query[QUERY_NAMES.hasPowerPlant],
      hasRegularWater: query[QUERY_NAMES.hasRegularWater],
      isFurnished: query[QUERY_NAMES.isFurnished],
      hasSecurity: query[QUERY_NAMES.hasSecurity],
      hasAppliances: query[QUERY_NAMES.hasAppliances],
      page: query[PAGE_PARAM],
    },
    zones,
  );

  // `null` significaría "nadie eligió ciudad", y acá la ciudad la afirma la
  // ruta. Es inalcanzable, pero el tipo lo permite y una lista vacía es la
  // respuesta honesta si alguna vez dejara de serlo.
  //
  // **Las dos consultas salen juntas.** Neon es HTTP, así que en paralelo
  // cuestan un viaje y no dos. La segunda trae el total *de la búsqueda
  // entera*, que es lo que la paginación necesita: la primera ya viene
  // recortada a una página y no puede decir cuántas hay.
  const [results, counts] = criteria
    ? await Promise.all([
        new DrizzleListingSearch(db).search(criteria),
        // Sin zonas ofrecidas: esta pantalla todavía no dibuja un filtro de
        // zona, y el puerto cuenta "las opciones que estoy mostrando".
        new DrizzleFacetedSearch(db).countFacets(criteria, []),
      ])
    : [[], undefined];

  const total = counts?.total ?? 0;
  const pagination = resolvePagination(criteria?.page, total);

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
      zoneName: zones.find((candidate) => candidate.id === row.zoneId)?.name ?? place.zone.name,
    })),
    covers,
    readPhotoPublicBaseUrl(),
  );

  const basePath = `/alquiler/${ciudad}/${zona}`;
  const pageHref = (page: number) => buildPageHref(basePath, query, page);

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

      <SidebarLayout
        sidebar={
          <SearchFilters
            cities={cities}
            zones={zones.filter((candidate) => candidate.cityId === place.city.id)}
            controls={FILTER_CONTROLS}
            names={QUERY_NAMES}
            resultCount={total}
            values={{
              minPrice: query[QUERY_NAMES.minPrice],
              maxPrice: query[QUERY_NAMES.maxPrice],
              minRooms: query[QUERY_NAMES.minRooms],
              propertyType: criteria?.propertyType,
              publisherType: criteria?.publisherType,
              attributes: criteria?.attributes,
            }}
          />
        }
      >
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

/** Una lista separada por comas, sin vacíos. Traducción, no decisión. */
function readList(raw: string | undefined): readonly string[] {
  return (raw ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item !== "");
}

/**
 * La misma dirección con otra página. Se conserva todo lo demás — incluidos
 * los `utm_*` que trae un enlace compartido — porque quitar un parámetro que
 * esta pantalla no entiende sería decidir por quien armó el enlace.
 */
function buildPageHref(
  basePath: string,
  query: Record<string, string | undefined>,
  page: number,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (key === PAGE_PARAM || value === undefined || value === "") continue;
    params.set(key, value);
  }
  // La primera página es la ausencia del parámetro: una sola dirección
  // canónica para la misma pantalla.
  if (page > 1) params.set(PAGE_PARAM, String(page));

  const search = params.toString();
  return search === "" ? basePath : `${basePath}?${search}`;
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
