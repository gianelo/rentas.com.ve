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
  resolveCityRoute,
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
import { readNavAccountFlags } from "../../_lib/nav-account";
import { readSession } from "../../_lib/session";
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
  const [{ ciudad }, rawQuery] = await Promise.all([params, searchParams]);

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

  // El catálogo con el slug de cada zona ya calculado por el dominio. La
  // página no formatea nada: el slug es un dato de la zona, no un formateo de
  // la pantalla.
  const searchZones = toSearchZones(zones);

  // **La única diferencia real con la página de zona**: no hay zona afirmada
  // por la ruta, así que las elegidas salen enteras de `?zona=`. Cuáles
  // sobreviven lo decide el dominio, que deja caer la que no pertenece a esta
  // ciudad sin llevarse la búsqueda entera — y que acepta tanto el slug (F12)
  // como el id de las direcciones ya compartidas.
  const chosenZones = resolveZoneTokens(
    readZoneList(rawQuery[SEARCH_QUERY_NAMES.zone]),
    searchZones,
    city.id,
  );

  // **Ésta es la ruta que SÍ admite `?zona=`, y la única** (resolución del
  // fundador, 2026-08-26: "un dato, un lugar"). Que lo sea es una regla y no
  // una propiedad de este archivo: la ruta de zona pregunta lo mismo y recibe
  // la respuesta contraria, y las dos preguntan al mismo sitio.
  const location = resolveSearchLocation({
    route: "city",
    query: rawQuery,
    queryZoneIds: chosenZones.map((zone) => zone.id),
  });
  const chosenZoneIds = location.zoneIds;
  // La query saneada es la que compone TODOS los enlaces de la pantalla.
  const query = location.query;

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
      minBathrooms: query[SEARCH_QUERY_NAMES.minBathrooms],
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
    // El mismo origen que compone la página de zona, por la misma función
    // (16.9): la ruta de la ciudad ES una búsqueda (14.24), así que volver
    // desde una ficha abierta acá tiene que traer los filtros y la página en
    // la que la persona estaba parada. Una segunda copia de esta expresión
    // escrita a mano deja de coincidir con la de la zona en el próximo
    // parámetro que alguien agregue, y la discrepancia no rompe nada visible.
    resultsOriginHref(cityPath, query),
  );

  // El panel va después de las filas por la misma razón que en la página de
  // zona: el atajo de F7 —con un solo resultado el botón lleva a la ficha—
  // necesita la dirección de esa ficha, y la arma `buildListingGrid`.
  const facets = new DrizzleFacetedSearch(db);
  const { panel, counts, outcome, priceNotices } = await buildFilterPanel(facets, {
    basePath: cityPath,
    cityPath,
    query,
    cityName: city.name,
    // El recorte por ciudad y la ruta canónica de cada zona los arma el
    // dominio sobre el mismo slug que viaja en `?zona=`: dos derivaciones
    // distintas del nombre es cómo la query deja de nombrar lo que nombra la
    // ruta.
    zones: toPanelZones(cityPath, searchZones, city.id),
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
    filtersHref: `${buildSearchHref(cityPath, query, { step: PANEL_OPEN_TOKEN })}#filtros`,
    // **El vocabulario acotado de las sugerencias, sin un byte de datos
    // nuevos** (14.51). `counts.byZone` ya vino en la MISMA consulta que las
    // filas y las facetas (14.11), y el nombre y la parroquia de cada zona ya
    // están en el catálogo que esta página leyó para resolver la ruta. Cuáles
    // entran —sólo las que tienen avisos— lo decide el dominio: acá no hay un
    // `.filter()`, que es la regla permanente del fundador.
    suggestions: boundedVocabulary(cities, zones, counts.byZone),
  };

  const pagination = resolvePagination(criteria.page, total);
  const pageHref = (page: number) =>
    buildSearchHref(cityPath, query, { page: page > 1 ? String(page) : null });

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
        signInHref={`/signin?callbackUrl=${encodeURIComponent(buildSearchHref(cityPath, query, {}))}`}
      />

      {/* **El panel de filtros, como modal y en los dos anchos** (14.33, lámina
          7c: "Sin barra lateral: los filtros viven solo en el modal"). Va
          primero en el documento porque es lo que hay que alcanzar primero
          cuando está abierto — sin JavaScript no hay forma de atrapar el foco,
          así que el orden del marcado es lo único honesto que queda.

          Que esté abierto o no lo decide la dirección, no esta página:
          `SearchPanel` devuelve `null` cuando el dominio dice que está cerrado. */}
      <SearchPanel model={panel} />

      <Container>
        <nav className={styles.breadcrumb} aria-label="Miga de pan">
          <ol className={styles.crumbs}>
            <li className={styles.crumb}>
              <AppLink className={styles.crumbLink} href="/">
                Inicio
              </AppLink>
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
          <p className={styles.alsoIn}>
            Sólo en {chosenZones.map((zone) => zone.name).join(", ")}.
          </p>
        ) : null}

        {/* El conteo es el de la búsqueda entera y no el de esta página.
            **Cambió al llegar la paginación, y por su culpa**: antes decía
            cuántas tarjetas había en pantalla, que era lo honesto cuando la
            consulta traía todo. Con 24 por página, "24 propiedades" sobre la
            primera de trece es el número equivocado con ventaja.

            Sigue sin cerrar la misma parte que en la página de zona: los avisos
            sin portada no se dibujan (F9) pero sí se cuentan, así que este número
            puede ser mayor que la cantidad de tarjetas. */}
        {/* **El conteo y el orden, en la misma fila** (14.47, lámina 7c:
            «70 avisos ······ Recientes ▾»). Cuáles son los tres órdenes y cuál
            está puesto lo decide `buildOrderMenu`, no esta página. */}
        <div className={styles.countRow}>
          <p className={styles.count} data-testid="result-count">
            {total === 1 ? "1 propiedad activa" : `${total} propiedades activas`}
            {pagination.count > 1 ? ` — página ${pagination.current} de ${pagination.count}` : ""}
          </p>

          <OrderMenu model={buildOrderMenu(cityPath, query)} />
        </div>

        {/* **Lo que se le corrigió al precio, dicho** (14.13, F5). El criterio
            ya intercambiaba un rango invertido, y callarlo dejaba a alguien
            mirando los resultados de un rango que no escribió. La frase la
            escribe el dominio. */}
        {priceNotices.map((notice) => (
          <p key={notice} className={styles.alsoIn} role="status">
            {notice}
          </p>
        ))}

        {/* **Los filtros puestos, quitables de a uno** (lámina 7c). Reemplazan a
            lo que la barra lateral mostraba de un vistazo: cuáles están puestos
            y cómo sacar uno. Cuáles son y adónde lleva cada «×» lo arma el
            dominio — quitar una zona devuelve a su ruta canónica y quitar un
            filtro no toca la ubicación, y son dos reglas distintas. */}
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
            // **El vacío explicado, con sus salidas** (F11). Reemplaza al aviso
            // genérico que decía «probá ampliando el precio» sin saber si ampliar
            // el precio devolvía algo: qué filtro lo causó y cuántos avisos hay
            // del otro lado de cada salida lo cuenta el dominio contra la base.
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

          {/* **La paginación que esta pantalla no tenía.** La consulta ya
              recortaba a 24 y la página no ofrecía ni un enlace: el aviso 25 en
              adelante existía y no había forma de llegar. Truncar en silencio es
              peor que no traer nada, porque nadie puede verlo.

              Enlaces y ningún botón: son direcciones, y tienen que poder abrirse
              en otra pestaña, guardarse y pegarse (D13). */}
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
