import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { Container } from "@/../components/layout/Container";
import type { SearchPillProps } from "@/../components/molecules/SearchPill";
import { Nav } from "@/../components/organisms/Nav";
import { SearchPanel } from "@/../components/organisms/SearchPanel";
import { SearchResultsHeader } from "@/../components/organisms/SearchResultsHeader";
import { SearchResultsList } from "@/../components/organisms/SearchResultsList";
import { resolveNavAccount, resolveNavPublish } from "@/modules/identity/domain/nav-account";
import { boundedVocabulary } from "@/modules/listing-catalogue/domain/bounded-vocabulary";
import { homeSearchForm } from "@/modules/listing-catalogue/domain/search-destination";
import { resolveSearchPill } from "@/modules/listing-catalogue/domain/search-pill";
import { DrizzleCatalogue } from "@/modules/listing-catalogue/infrastructure/drizzle-catalogue";
import { buildListingGrid } from "@/modules/listing-discovery/domain/listing-grid";
import {
  isFilteredZoneRoute,
  resolveZoneRoute,
  zoneRoutePath,
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

interface ZonaProps {
  params: Promise<{ ciudad: string; zona: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}

/**
 * Las ciudades del producto — cheap y compartida por el componente y el panel.
 * `generateMetadata` no la necesita: resuelve sólo con `loadZoneRoute`.
 */
const loadCities = cache(async () => new DrizzleCatalogue(db).listCities());

/**
 * Las zonas de ESTA ciudad con avisos activos, ya contadas — no la taxonomía
 * entera (tasks.md 27.1, slice C). Hasta acá el panel de filtros y
 * `boundedVocabulary` seguían pagando `loadCatalogue()` completo —5.801 filas
 * y ~1.207 KB, medido en la rebanada B— DESPUÉS de que la rebanada B ya había
 * sacado ese costo de resolver la ruta. `ActiveCityZonesPort.listActiveZones`
 * NO contesta la misma pregunta que `counts.byZone` más abajo, y la
 * diferencia decide para qué sirve cada una: esto cuenta por zona la ciudad
 * ENTERA, filtrando sólo por `status` activo y vigencia, mientras que
 * `counts.byZone` sale de la búsqueda facetada y responde al `criteria` de
 * ESTE pedido. Por eso **acá sólo salen los NOMBRES**: cuáles zonas se
 * ofrecen lo sigue decidiendo `counts.byZone` (corrección 27.1-C,
 * `R3-suggestion-count-scope-unproved`), o una sugerencia podría llevar a una
 * página vacía en cuanto haya un filtro puesto. Es una consulta agrupada por
 * zona, no un filtro sobre el catálogo.
 *
 * **No puede correr en paralelo con `loadZoneRoute`**: necesita `place.city.id`,
 * que `loadZoneRoute` es quien resuelve. Un viaje más en serie, pagado a
 * propósito por la misma razón que el panel ya paga tres y no dos más abajo —
 * la alternativa era seguir trayendo la ciudad entera para evitarlo.
 */
const loadActiveZones = cache(async (cityId: string) =>
  new DrizzleCatalogue(db).listActiveZones(cityId),
);

/**
 * Qué lugar nombran los dos segmentos de la URL — resuelto por el índice de
 * `slug`, no escaneando la taxonomía entera (tasks.md 27.1, slice B).
 *
 * **Antes de esta rebanada, resolver la ruta pagaba `loadCatalogue()`
 * completo** para hacerle a `resolveZoneRoute` una pregunta de una fila:
 * medido contra el contenedor real, 5.801 filas y ~1.207 KB para devolver una
 * ciudad y, cuando el nombre no se comparte entre parroquias, una única
 * zona — 286 bytes (`tests/integration/catalogue.test.ts`). `findZoneBySlug`
 * hace la misma pregunta con un `Index Scan` sobre `zone_slug_idx`.
 *
 * **`resolveZoneRoute` no cambia.** Sigue siendo la misma función pura, con
 * la misma firma — lo único que cambia es de dónde salen los arreglos que
 * recibe: antes las 5.813 zonas, ahora sólo la ciudad y las zonas que ya
 * comparten `(city_id, slug)` con la petición. El dominio sigue decidiendo
 * qué hace válida la ruta; la infraestructura sólo dejó de traer de más.
 *
 * `cache()` por la misma razón que `loadCities`/`loadActiveZones`:
 * `generateMetadata` y el componente preguntan lo mismo en la misma petición.
 */
const loadZoneRoute = cache(async (citySlug: string, zoneSlug: string) => {
  const candidates = await new DrizzleCatalogue(db).findZoneBySlug(citySlug, zoneSlug);
  if (!candidates) return null;

  return resolveZoneRoute([candidates.city], candidates.zones, citySlug, zoneSlug);
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

  // Qué lugar nombran los dos segmentos lo decide el dominio, sobre las
  // filas que el índice ya recortó — no sobre la taxonomía entera. Se
  // resuelven juntos porque la zona sola es ambigua: `Centro` existe en
  // Maracaibo y en Distrito Capital. Las ciudades del producto viajan en
  // paralelo: no dependen de `place` y `boundedVocabulary` las necesita
  // enteras (14.18).
  const [place, cities] = await Promise.all([loadZoneRoute(ciudad, zona), loadCities()]);
  // 404 y nunca una ciudad por defecto: responder 200 con los avisos de otra
  // parte publica contenido duplicado bajo una dirección inventada.
  if (!place) notFound();

  // La ruta de la ciudad sola es adónde vuelve «Limpiar todo» (F8) y adónde
  // caen las búsquedas de dos zonas o más, que no tienen ruta propia.
  const cityPath = `/alquiler/${ciudad}`;
  const basePath = `${cityPath}/${zona}`;

  // **Sólo las zonas de esta ciudad con avisos activos** (27.1, slice C), no
  // la taxonomía entera. Depende de `place.city.id`, así que corre después —
  // el viaje en serie que el comentario de `loadActiveZones` ya explica.
  const activeZones = await loadActiveZones(place.city.id);

  // El catálogo con el slug de cada zona ya calculado por el dominio. La
  // página no formatea nada: el slug es un dato de la zona, no un formateo de
  // la pantalla.
  const searchZones = toSearchZones(activeZones);

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
      minBathrooms: query[SEARCH_QUERY_NAMES.minBathrooms],
      minAreaM2: query[SEARCH_QUERY_NAMES.minAreaM2],
      propertyType: query[SEARCH_QUERY_NAMES.propertyType],
      publisherType: query[SEARCH_QUERY_NAMES.publisherType],
      hasPowerPlant: query[SEARCH_QUERY_NAMES.hasPowerPlant],
      hasRegularWater: query[SEARCH_QUERY_NAMES.hasRegularWater],
      isFurnished: query[SEARCH_QUERY_NAMES.isFurnished],
      hasParking: query[SEARCH_QUERY_NAMES.hasParking],
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
      // **Sólo entre las zonas con avisos** (27.1, slice C): toda zona que un
      // aviso mostrado pueda nombrar tiene avisos, así que está en `activeZones`.
      zoneName:
        activeZones.find((candidate) => candidate.id === row.zoneId)?.name ?? place.zone.name,
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
    // **El vocabulario acotado de las sugerencias** (14.51), con
    // `boundedVocabulary` (corrección 27.1-C,
    // `R3-suggestion-count-scope-unproved`): `activeZones` sólo aporta el
    // NOMBRE de las zonas, y `counts.byZone` — el `criteria` de ESTE pedido —
    // decide CUÁLES entran.
    suggestions: boundedVocabulary(cities, activeZones, counts.byZone),
  };

  const pagination = resolvePagination(criteria.page, total);
  const pageHref = (page: number) =>
    buildSearchHref(basePath, query, { page: page > 1 ? String(page) : null });

  // La miga de pan de esta ruta: Inicio, la ciudad (ya con enlace propio
  // desde que la ruta de ciudad existe) y la zona, sin enlace porque es la
  // página en la que se está parado.
  const crumbs = [
    { label: "Inicio", href: "/" },
    { label: place.city.name, href: cityPath },
    { label: place.zone.name },
  ];

  // **Lo que se ignoró, dicho.** Llegar con `?zona=` a una dirección que ya
  // nombra una zona era antes "sumarlas con O"; desde la resolución de
  // ubicación esta ruta busca sólo la suya. Callarlo dejaría a alguien
  // mirando una lista más corta que la que su enlace prometía. El texto lo
  // escribe el dominio, y lleva `role="status"` porque es una reacción a lo
  // que la dirección pedía y no algo que la ruta ya sabía de entrada.
  const notice = location.notice === null ? null : { text: location.notice, live: true };

  // El conteo es el de la búsqueda entera, no el de esta página. **Cambió con
  // la 14.10 y por su culpa**: antes decía cuántas tarjetas había en
  // pantalla, que era lo honesto cuando la consulta traía todo. Con
  // paginación, "9 propiedades" sobre la primera de trece páginas es el
  // número equivocado con ventaja.
  //
  // Queda pendiente la misma parte que en la ciudad: los avisos sin portada
  // no se dibujan (F9) pero sí se cuentan, así que este número puede ser
  // mayor que la cantidad de tarjetas.
  const countText = `${total === 1 ? "1 propiedad activa" : `${total} propiedades activas`}${
    pagination.count > 1 ? ` — página ${pagination.current} de ${pagination.count}` : ""
  }`;

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
        {/* **El encabezado de resultados, compartido con la ruta de ciudad**
            (tasks.md 22.6): miga de pan, título, avisos, conteo con el orden
            y las fichas de filtro puesto. `SearchResultsHeader` es el único
            sitio donde se dibuja — dos hojas y dos bloques de JSX idénticos
            dejaron de ser dos cosas que mantener sincronizadas. */}
        <SearchResultsHeader
          crumbs={crumbs}
          title={`Alquiler en ${place.zone.name}`}
          notice={notice}
          priceNotices={priceNotices}
          countText={countText}
          orderMenu={buildOrderMenu(basePath, query)}
          chips={panel.chips}
          clearAllHref={panel.clearAllHref}
        />

        {/* **La carcasa de resultados, misma razón** (tasks.md 22.6): la
            página que ya no existe, el vacío, la cuadrícula y la paginación
            también se dibujaban dos veces. */}
        <SearchResultsList
          pagination={pagination}
          pageHref={pageHref}
          total={total}
          cards={cards}
          outcome={outcome}
        />
      </Container>
    </>
  );
}

export async function generateMetadata({ params, searchParams }: ZonaProps): Promise<Metadata> {
  const [{ ciudad, zona }, query] = await Promise.all([params, searchParams]);

  // Los metadatos sólo necesitan el lugar, nunca el catálogo entero — a
  // diferencia del componente, que además arma el panel de filtros.
  const place = await loadZoneRoute(ciudad, zona);
  if (!place) return {};

  // La regla mecánica de la 14.24: la zona se indexa, la zona refinada no.
  // Las refinadas son combinatorias, y publicarlas todas es contenido
  // duplicado sobre el dominio entero.
  const filtered = isFilteredZoneRoute(query);

  return {
    title: `Alquiler en ${place.zone.name}, ${place.city.name} — Rentoru`,
    description: `Avisos de alquiler de larga estancia en ${place.zone.name}, ${place.city.name}. Publicar y buscar es gratis, sin comisión.`,
    robots: filtered ? { index: false, follow: true } : undefined,
    // **Sólo se canoniza lo que pide ser indexado** (26.12). La refinada ya
    // sale del índice con la línea de arriba, y sumarle una canónica hacia la
    // zona sin filtros serían dos señales contradictorias. Relativa: la base
    // la pone `metadataBase` en el layout, una sola vez.
    //
    // Sale de `zoneRoutePath` —el catálogo— y no de los segmentos que
    // llegaron: devolver la petición como canónica es la forma clásica del
    // defecto.
    alternates: filtered ? undefined : { canonical: zoneRoutePath(place) },
  };
}
