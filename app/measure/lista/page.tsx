import { notFound } from "next/navigation";
import { resolveNavAccount, resolveNavPublish } from "@/modules/identity/domain/nav-account";
import { homeSearchForm } from "@/modules/listing-catalogue/domain/search-destination";
import { resolveSearchPill } from "@/modules/listing-catalogue/domain/search-pill";
import { buildSearchPanel } from "@/modules/listing-search/domain/search-panel";
import { AppLink } from "../../../components/atoms/AppLink";
import { Container } from "../../../components/layout/Container";
import { FilterChips } from "../../../components/molecules/FilterChips";
import { ListingCard, ListingGrid } from "../../../components/molecules/ListingCard";
import { Nav } from "../../../components/organisms/Nav";
import { SearchPanel } from "../../../components/organisms/SearchPanel";
import styles from "../../alquiler/[ciudad]/[zona]/zona.module.css";

/**
 * **La pantalla de resultados, para contar lo que entra sobre el pliegue**
 * (tasks.md 14.29; `tests/measure/lista.spec.ts`).
 *
 * **Por qué no vive en `/measure`.** Aquel arnés apila veinte composiciones en
 * una página para medirlas de a una, y funciona porque cada medida es local:
 * el alto de una fila, el ancho de una columna, cuántas tarjetas comparten el
 * borde superior. *Sobre el pliegue* no es local — depende de todo lo que hay
 * ENCIMA de la cuadrícula, y encima de aquella hay diecinueve cosas que esta
 * pantalla no dibuja. Medirlo ahí daría cero y sonaría a pantalla rota.
 *
 * **Qué se monta.** La misma composición que sirve
 * `app/alquiler/[ciudad]/[zona]/page.tsx`, en el mismo orden y con las mismas
 * piezas: `Nav` con su pastilla, el panel cerrado, y dentro del `Container` la
 * miga de pan, el título, el conteo, las fichas quitables y la cuadrícula. La
 * hoja es la REAL —`zona.module.css`, importada y no copiada— y los modelos
 * salen de las mismas funciones del dominio que usa la página. Lo que se
 * escribe acá es el contenido, nunca una regla.
 *
 * **La atadura contra la deriva.** `app/measure/lista-medida.test.ts` verifica
 * que las clases que este arnés dibuja sean las que la pantalla usa, y que la
 * hoja sea la de la pantalla y no una copia. Sin eso, un renombre dejaría esta
 * medición verde sobre una pantalla que ya no existe — el defecto que dejó a
 * este repositorio midiendo un formulario de publicar retirado.
 *
 * Fuera de la superficie de producción por la misma puerta que `/measure`:
 * `MEASURE_HARNESS_ENABLED`, que sólo pone el `webServer` de
 * `playwright.measure.config.ts`. Sin datos, sin sesión y sin base — dibuja y
 * no consulta.
 */
export default function MeasureListaPage() {
  if (process.env.MEASURE_HARNESS_ENABLED !== "true") {
    notFound();
  }

  const account = resolveNavAccount(null);
  const publish = resolveNavPublish(account);
  const panel = harnessPanel();
  const searchForm = homeSearchForm(panel.headline);

  return (
    <>
      <Nav
        account={account}
        publish={publish}
        signInHref="/signin"
        pill={{
          action: searchForm.action,
          name: searchForm.name,
          value: searchForm.value,
          placeholder: searchForm.label,
          submitLabel: searchForm.submitLabel,
          state: resolveSearchPill({
            zoneLabel: panel.headline,
            resultCount: TOTAL,
            filterCount: panel.pillFilters,
          }),
          filtersHref: `${BASE_PATH}#filtros`,
        }}
      />

      {/* Cerrado, que es como llega la pantalla: `SearchPanel` devuelve `null`
          cuando el dominio dice que no está abierto. Va igual y en su lugar del
          documento, porque un `null` que se dibuja en otro sitio no mide lo
          mismo. */}
      <SearchPanel model={panel} />

      <Container>
        <nav className={styles.breadcrumb} aria-label="Miga de pan">
          <ol className={styles.crumbs}>
            <li className={styles.crumb}>
              <AppLink className={styles.crumbLink} href="/">
                Inicio
              </AppLink>
            </li>
            <li className={styles.crumb}>
              <AppLink className={styles.crumbLink} href="/alquiler/distrito-capital">
                Distrito Capital
              </AppLink>
            </li>
            <li className={styles.crumb} aria-current="page">
              Chacao
            </li>
          </ol>
        </nav>

        <h1 className={styles.title}>Alquiler en Chacao</h1>

        <p className={styles.count} data-testid="result-count">
          {TOTAL} propiedades activas
        </p>

        <FilterChips chips={panel.chips} clearAllHref={panel.clearAllHref} />

        <div className={styles.results} data-testid="lista-grid">
          <ListingGrid>
            {AVISOS.map((aviso, indice) => (
              <li key={aviso.title}>
                <ListingCard
                  href={`/alquiler/distrito-capital/chacao/aviso-${indice}`}
                  priceUsd={aviso.priceUsd}
                  title={aviso.title}
                  zone="Chacao"
                  rooms={aviso.rooms}
                  areaM2={aviso.areaM2}
                  publisherType={indice % 3 === 0 ? "broker" : "owner"}
                  photo={{
                    thumbUrl: "https://fotos.rentas.com.ve/photos/pub/tok/thumb.webp",
                    cardUrl: "https://fotos.rentas.com.ve/photos/pub/tok/card.webp",
                    alt: `Foto 1 de 1 — ${aviso.title}, Chacao`,
                  }}
                />
              </li>
            ))}
          </ListingGrid>
        </div>
      </Container>
    </>
  );
}

const BASE_PATH = "/alquiler/distrito-capital/chacao";
const CITY_PATH = "/alquiler/distrito-capital";
const TOTAL = 24;

/**
 * **Doce avisos y no cuatro, ni ocho.** El número que se mide es cuántos
 * entran, y un fixture que dibuje justo los que entran devuelve el tope del
 * fixture disfrazado de medida. Doce pasa de largo los dos pliegues.
 *
 * **Todos los títulos ocupan las dos líneas del recorte**, que es el caso peor
 * y el único determinista: `ListingTitle` recorta a dos líneas pero no las
 * reserva, así que una tarjeta de título corto es más baja y la altura de la
 * fila dependería de cuál aviso cayó en ella. La lámina 6c dibuja la suya con
 * las dos líneas puestas (`height:34px`).
 *
 * El registro es el de SISTEMA.md — zonas, precios y títulos venezolanos.
 */
const AVISOS = [
  {
    title: "Apartamento 2 hab con puesto de estacionamiento techado",
    priceUsd: 450,
    rooms: 2,
    bathrooms: 2,
    areaM2: 78,
  },
  {
    title: "Con planta eléctrica y vigilancia las 24 horas del día",
    priceUsd: 520,
    rooms: 2,
    bathrooms: 2,
    areaM2: 84,
  },
  {
    title: "Apartamento piso alto, vista abierta y tanque propio",
    priceUsd: 390,
    rooms: 2,
    bathrooms: 2,
    areaM2: 70,
  },
  {
    title: "Estudio amoblado a dos cuadras del Centro San Ignacio",
    priceUsd: 300,
    rooms: 1,
    bathrooms: 1,
    areaM2: 42,
  },
  {
    title: "Tres habitaciones con línea blanca y closets empotrados",
    priceUsd: 680,
    rooms: 3,
    bathrooms: 3,
    areaM2: 110,
  },
  {
    title: "Apartamento remodelado, cocina nueva y piso de porcelanato",
    priceUsd: 610,
    rooms: 2,
    bathrooms: 2,
    areaM2: 92,
  },
  {
    title: "Con dos puestos de estacionamiento y maletero en el sótano",
    priceUsd: 740,
    rooms: 3,
    bathrooms: 3,
    areaM2: 125,
  },
  {
    title: "Edificio con ascensor, planta y agua todos los días del mes",
    priceUsd: 480,
    rooms: 2,
    bathrooms: 2,
    areaM2: 80,
  },
  {
    title: "Apartamento luminoso con balcón hacia el cerro El Ávila",
    priceUsd: 560,
    rooms: 2,
    bathrooms: 2,
    areaM2: 88,
  },
  {
    title: "Una habitación con área de servicio y puesto de visitante",
    priceUsd: 340,
    rooms: 1,
    bathrooms: 1,
    areaM2: 55,
  },
  {
    title: "Cuatro habitaciones para familia grande, dos baños completos",
    priceUsd: 900,
    rooms: 4,
    bathrooms: 4,
    areaM2: 150,
  },
  {
    title: "Apartamento en obra limpia, listo para mudarse este mes",
    priceUsd: 420,
    rooms: 2,
    bathrooms: 2,
    areaM2: 76,
  },
] as const;

/**
 * El panel de la lámina 7c: **cerrado**, con las cinco fichas puestas.
 *
 * Se arma con `buildSearchPanel` y no a mano por la misma razón que el otro
 * arnés lo hace: lo que hay que medir es lo que se sirve. Las fichas empujan
 * la cuadrícula hacia abajo, así que inventarlas mediría otra pantalla.
 */
function harnessPanel() {
  return buildSearchPanel({
    basePath: BASE_PATH,
    cityPath: CITY_PATH,
    // Sin `filtros`: la dirección no pidió abrirlo, que es como llega.
    query: {},
    cityName: "Distrito Capital",
    zones: [
      { id: "chacao", name: "Chacao", slug: "chacao", path: `${CITY_PATH}/chacao` },
      { id: "altamira", name: "Altamira", slug: "altamira", path: `${CITY_PATH}/altamira` },
    ],
    chosenZoneIds: ["chacao", "altamira"],
    counts: {
      total: TOTAL,
      byZone: { chacao: 16, altamira: 8 },
      byMinRooms: { 1: 24, 2: 17, 3: 6, 4: 1 },
      byMinBathrooms: { 1: 16, 2: 7, 3: 0 },
      byAttribute: {
        hasPowerPlant: 12,
        hasRegularWater: 18,
        isFurnished: 5,
        hasSecurity: 11,
        hasAppliances: 9,
      },
      byPublisherType: { owner: 17, broker: 7 },
      withoutFilter: {
        zone: 70,
        price: 31,
        rooms: 38,
        bathrooms: 38,
        publisherType: 33,
        hasPowerPlant: 26,
        hasRegularWater: 27,
        isFurnished: 28,
        hasSecurity: 29,
        hasAppliances: 30,
      },
      byPriceBucket: [
        { count: 3, lowestUsd: 300, highestUsd: 390 },
        { count: 8, lowestUsd: 400, highestUsd: 495 },
        { count: 7, lowestUsd: 500, highestUsd: 590 },
        { count: 4, lowestUsd: 600, highestUsd: 690 },
        { count: 2, lowestUsd: 700, highestUsd: 780 },
      ],
      cityTotal: 70,
    },
    // Las cinco fichas que la lámina 7c dibuja: dos zonas, el precio, las
    // habitaciones y quién publica.
    criteria: {
      minPriceUsd: 250,
      maxPriceUsd: 700,
      minRooms: 2,
      publisherType: "owner",
    },
  });
}
