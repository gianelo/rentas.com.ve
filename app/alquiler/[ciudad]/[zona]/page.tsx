import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { AppLink } from "@/../components/atoms/AppLink";
import { Container } from "@/../components/layout/Container";
import { FilterChips } from "@/../components/molecules/FilterChips";
import { ListingCard, ListingGrid } from "@/../components/molecules/ListingCard";
import { OrderMenu } from "@/../components/molecules/OrderMenu";
import type { SearchPillProps } from "@/../components/molecules/SearchPill";
import { Nav } from "@/../components/organisms/Nav";
import { SearchOutcome } from "@/../components/organisms/SearchOutcome";
import { SearchPanel } from "@/../components/organisms/SearchPanel";
import { resolveNavAccount, resolveNavPublish } from "@/modules/identity/domain/nav-account";
import { boundedVocabulary } from "@/modules/listing-catalogue/domain/bounded-vocabulary";
import { homeSearchForm } from "@/modules/listing-catalogue/domain/search-destination";
import { resolveSearchPill } from "@/modules/listing-catalogue/domain/search-pill";
import { DrizzleCatalogue } from "@/modules/listing-catalogue/infrastructure/drizzle-catalogue";
import { buildListingGrid } from "@/modules/listing-discovery/domain/listing-grid";
import {
  isFilteredZoneRoute,
  resolveZoneRoute,
} from "@/modules/listing-discovery/domain/zone-route";
import { DrizzleListingPhotos } from "@/modules/listing-discovery/infrastructure/drizzle-listing-photos";
import { readPhotoPublicBaseUrl } from "@/modules/listing-discovery/infrastructure/photo-public-base-url";
import { buildFilterPanel } from "@/modules/listing-search/application/build-filter-panel";
import { resolvePagination } from "@/modules/listing-search/domain/pagination";
import { PANEL_OPEN_TOKEN } from "@/modules/listing-search/domain/search-accordion";
import { buildSearchCriteria } from "@/modules/listing-search/domain/search-criteria";
import { resolveSearchLocation } from "@/modules/listing-search/domain/search-location";
import { buildOrderMenu } from "@/modules/listing-search/domain/search-order";
import { toPanelZones } from "@/modules/listing-search/domain/search-panel";
import {
  buildSearchHref,
  readZoneList,
  resultsOriginHref,
  SEARCH_QUERY_NAMES,
} from "@/modules/listing-search/domain/search-query";
import { resolveZoneTokens, toSearchZones } from "@/modules/listing-search/domain/zone-catalogue";
import { DrizzleFacetedSearch } from "@/modules/listing-search/infrastructure/drizzle-faceted-search";
import { DrizzleListingSearch } from "@/modules/listing-search/infrastructure/drizzle-listing-search";
import { db } from "@/shared/db/client";
import { readNavAccountFlags } from "../../../_lib/nav-account";
import { readSession } from "../../../_lib/session";
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
  const [{ ciudad, zona }, rawQuery] = await Promise.all([params, searchParams]);

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

  // El catálogo con el slug de cada zona ya calculado por el dominio. La
  // página no formatea nada: el slug es un dato de la zona, no un formateo de
  // la pantalla.
  const searchZones = toSearchZones(zones);

  // **Esta ruta RECHAZA `?zona=`** (resolución del fundador, 2026-08-26: "un
  // dato, un lugar"). La ubicación no aparece dos veces en una dirección: una
  // zona vive acá, varias viven en `/alquiler/<ciudad>?zona=…`. Se ignora con
  // un aviso en vez de romper la página (14.23b), y el dominio devuelve además
  // la query **sin** el parámetro — dejarlo lo arrastraría a cada enlace que
  // esta página compone.
  const location = resolveSearchLocation({
    route: "zone",
    routeZoneId: place.zone.id,
    query: rawQuery,
    queryZoneIds: resolveZoneTokens(
      readZoneList(rawQuery[SEARCH_QUERY_NAMES.zone]),
      searchZones,
      place.city.id,
    ).map((candidate) => candidate.id),
  });
  const chosenZoneIds = location.zoneIds;
  const query = location.query;

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
      order: query[SEARCH_QUERY_NAMES.order],
    },
    searchZones,
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
    // **De acá salió el visitante, y con esto vuelve** (16.9). La URL de la
    // ficha es canónica y no lleva estado de búsqueda (11.1), así que el
    // estado tiene que viajar con el enlace de ida o «← Resultados» aterriza
    // en la zona pelada: quien estrechó su búsqueda a nueve avisos recibiría
    // los setenta otra vez. Qué se lleva ese origen lo decide
    // `resultsOriginHref` y no esta página — la ciudad tiene que componer el
    // mismo, y dos copias escritas en dos pantallas dejan de coincidir en el
    // próximo parámetro.
    resultsOriginHref(basePath, query),
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
  const facets = new DrizzleFacetedSearch(db);
  const { panel, counts, outcome, priceNotices } = await buildFilterPanel(facets, {
    basePath,
    cityPath,
    query,
    cityName: place.city.name,
    // Las de esta ciudad, con el mismo slug que resuelve la ruta y que viaja
    // en `?zona=`: es lo que hace que tocar una sola zona caiga en su
    // dirección canónica en vez de en la ciudad con un parámetro.
    zones: toPanelZones(cityPath, searchZones, place.city.id),
    chosenZoneIds,
    criteria,
    onlyListingHref: cards.length === 1 ? cards[0]?.href : undefined,
  });

  const total = counts.total;

  // **La barra del producto** (14a), en lugar de la barra resumen que sólo
  // existía bajo 768 px. Lo que aquélla llevaba —dónde se está buscando, el
  // conteo y el acceso a los filtros— lo lleva ahora la pastilla, y encima
  // funciona en escritorio, donde la lámina 7b/7c también la dibuja.
  //
  // **La sesión no cuesta una consulta acá**: sin cookie `@auth/core` corta en
  // `if (!sessionToken) return response` antes de llamar al adaptador, y esta
  // pantalla es anónima casi siempre. Tampoco se pide la cartera del importador
  // que `/mis-avisos` consulta: la barra no la mira. El modo de render no
  // cambia — la página ya se servía por petición, porque lee `searchParams`.
  const session = await readSession();
  // **El viaje que la 14.56 agrega, y sólo para quien tiene sesión**: si esta
  // cuenta publicó algo se le pregunta a `listing` con un `EXISTS`. Sin cookie
  // no hay sesión y no hay consulta, que es casi todo el tráfico de esta
  // pantalla.
  const account = resolveNavAccount(session, await readNavAccountFlags(session));
  const publish = resolveNavPublish(account);

  // **Ni el texto ni el número de la pastilla se deciden acá.** `panel.headline`
  // dice dónde se está buscando —las zonas elegidas, o la ciudad cuando no hay
  // ninguna— y `resolveSearchPill` traduce eso a un estado.
  //
  // El conteo de filtros es `pillFilters`, y **la zona no cuenta**: el filtro de
  // la pastilla abre precio, tamaño, quién publica y atributos, porque "ciudad
  // y zona no están ahí: eso lo resuelve el texto" (14i). Hasta la 14.49 el
  // modelo llevaba además `activeFilters` —el número del engranaje de la barra
  // resumen, que sí contaba la zona—, y elegir el equivocado dibujaba un «4
  // filtros» sobre un panel que abre tres sin poner nada en rojo. Ese campo ya
  // no existe, así que hoy el error no compila.
  const searchForm = homeSearchForm(panel.headline);
  const pill: SearchPillProps = {
    action: searchForm.action,
    name: searchForm.name,
    value: searchForm.value,
    placeholder: searchForm.label,
    submitLabel: searchForm.submitLabel,
    state: resolveSearchPill({
      zoneLabel: panel.headline,
      resultCount: total,
      filterCount: panel.pillFilters,
    }),
    // El mismo enlace que llevaba el engranaje: esta dirección con el panel
    // abierto desde el servidor. Sin el ancla, el panel queda debajo de la
    // cuadrícula y fuera de vista.
    filtersHref: `${buildSearchHref(basePath, query, { step: PANEL_OPEN_TOKEN })}#filtros`,
    // **El vocabulario acotado de las sugerencias, sin un byte de datos
    // nuevos** (14.51): `counts.byZone` vino en la MISMA consulta que las filas
    // y las facetas (14.11), y el catálogo ya estaba leído para resolver la
    // ruta. Cuáles zonas entran lo decide el dominio, no esta página.
    suggestions: boundedVocabulary(cities, zones, counts.byZone),
  };

  const pagination = resolvePagination(criteria.page, total);
  const pageHref = (page: number) =>
    buildSearchHref(basePath, query, { page: page > 1 ? String(page) : null });

  return (
    <>
      {/* **La barra del producto, en lugar de la barra resumen** (14.41). Aquélla
          sólo existía bajo 768 px —"en escritorio los filtros están a la
          vista"— y llevaba tres cosas: dónde se está buscando, el conteo y el
          acceso a los filtros. Las tres las lleva ahora la pastilla, y en los
          dos anchos, que es como la dibujan las láminas 6c y 7b/7c.

          La flecha hacia arriba que aquélla tenía la cubre la miga de pan, que
          ya estaba y se dibuja siempre.

          Acá no se decide nada: el estado de la barra sale de
          `resolveNavAccount`/`resolveNavPublish` y el de la pastilla de
          `resolveSearchPill`. */}
      <Nav
        account={account}
        publish={publish}
        pill={pill}
        // Entrar y volver a ESTA búsqueda, con sus filtros. La dirección la
        // vuelve a componer el dominio: una segunda copia de la query escrita
        // acá deja de coincidir en el próximo parámetro.
        signInHref={`/signin?callbackUrl=${encodeURIComponent(buildSearchHref(basePath, query, {}))}`}
      />

      {/* **El panel de filtros, como modal y en los dos anchos** (14.33, lámina
          7c: "Sin barra lateral: los filtros viven solo en el modal"). Va
          primero en el documento porque es lo que hay que alcanzar primero
          cuando está abierto — sin JavaScript no hay forma de atrapar el foco,
          así que el orden del marcado es lo único honesto que queda.

          Que esté abierto o no lo decide la dirección, no esta página. */}
      <SearchPanel model={panel} />

      <Container>
        <nav className={styles.breadcrumb} aria-label="Miga de pan">
          {/* Tres elementos y ni uno más: los separadores «›» los dibuja el CSS
              con un `::before`. Puestos como `<li>` propios, un lector de
              pantalla anunciaría "lista de cinco elementos" y leería en voz alta
              dos signos de puntuación que no son pasos de la ruta. */}
          <ol className={styles.crumbs}>
            <li className={styles.crumb}>
              <AppLink className={styles.crumbLink} href="/">
                Inicio
              </AppLink>
            </li>
            {/* La ciudad **ya lleva enlace**: `/alquiler/<ciudad>` existe desde
                que se construyó la pantalla de ciudad. Antes iba sin enlace, y
                la razón anotada era que una miga de pan que lleva a un 404 es
                peor que una que no lleva a ninguna parte. */}
            <li className={styles.crumb}>
              <AppLink className={styles.crumbLink} href={cityPath}>
                {place.city.name}
              </AppLink>
            </li>
            <li className={styles.crumb} aria-current="page">
              {place.zone.name}
            </li>
          </ol>
        </nav>

        <h1 className={styles.title}>Alquiler en {place.zone.name}</h1>

        {/* **Lo que se ignoró, dicho.** Llegar con `?zona=` a una dirección que
            ya nombra una zona era antes "sumarlas con O"; desde la resolución
            de ubicación esta ruta busca sólo la suya. Callarlo dejaría a
            alguien mirando una lista más corta que la que su enlace prometía.
            El texto lo escribe el dominio. */}
        {location.notice === null ? null : (
          <p className={styles.alsoIn} role="status">
            {location.notice}
          </p>
        )}

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
        {/* **El conteo y el orden, en la misma fila** (14.47, lámina 7c:
            «70 avisos ······ Recientes ▾»). Cuáles son los tres órdenes y cuál
            está puesto lo decide `buildOrderMenu`, no esta página. */}
        <div className={styles.countRow}>
          <p className={styles.count} data-testid="result-count">
            {total === 1 ? "1 propiedad activa" : `${total} propiedades activas`}
            {pagination.count > 1 ? ` — página ${pagination.current} de ${pagination.count}` : ""}
          </p>

          <OrderMenu model={buildOrderMenu(basePath, query)} />
        </div>

        {/* **Lo que se le corrigió al precio, dicho** (14.13, F5). Misma razón
            que el aviso de arriba: una corrección callada es una pantalla
            mintiendo sobre lo que hizo. La frase la escribe el dominio. */}
        {priceNotices.map((notice) => (
          <p key={notice} className={styles.alsoIn} role="status">
            {notice}
          </p>
        ))}

        {/* **Los filtros puestos, quitables de a uno** (lámina 7c). Reemplazan a
            lo que la barra lateral mostraba de un vistazo. Cuáles son y adónde
            lleva cada «×» lo arma el dominio. */}
        <FilterChips chips={panel.chips} clearAllHref={panel.clearAllHref} />

        <div className={styles.results}>
          {pagination.beyondEnd ? (
            // La página que ya no existe: el enlace viejo pegado en un chat.
            // Se responde con la salida, no con una cuadrícula vacía sin causa.
            <p className={styles.empty}>
              Esa página ya no existe: la búsqueda tiene {pagination.count}.{" "}
              <AppLink className={styles.pageLink} href={pageHref(pagination.count)}>
                Ver la última
              </AppLink>
              .
            </p>
          ) : total === 0 ? (
            // **El vacío explicado, con sus salidas** (F11). El aviso genérico
            // que estaba acá proponía ampliar el precio sin saber si ampliarlo
            // devolvía algo; ahora qué filtro lo causó y cuántos avisos hay del
            // otro lado de cada salida los cuenta el dominio contra la base — y
            // ninguna de esas salidas se va de la ciudad.
            <SearchOutcome model={outcome} />
          ) : cards.length === 0 ? (
            // Contados pero no dibujados: un aviso sin portada no entra en la
            // cuadrícula (F9). El número de arriba sigue siendo el verdadero.
            <p className={styles.empty}>Los avisos de esta página todavía no tienen foto.</p>
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
                <AppLink
                  className={styles.pageLink}
                  href={pageHref(pagination.previous)}
                  rel="prev"
                >
                  ← Anterior
                </AppLink>
              )}
              <span className={styles.pageStatus}>
                Página {pagination.current} de {pagination.count}
              </span>
              {pagination.next === null ? null : (
                <AppLink className={styles.pageLink} href={pageHref(pagination.next)} rel="next">
                  Siguiente →
                </AppLink>
              )}
            </nav>
          ) : null}

          {/* **El cierre de la lista** (F10): «Son los 9 avisos que coinciden»
              más el único cambio que más suma, con su número. A mitad de una
              lista paginada el dominio devuelve `partial` y esto no dibuja nada,
              porque todavía faltan avisos. */}
          {total > 0 ? <SearchOutcome model={outcome} /> : null}
        </div>
      </Container>
    </>
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
