import { notFound } from "next/navigation";
import { contactDoorFor, DOOR_QUERY_NAME } from "@/modules/contact-reveal/domain/sign-in-door";
import { boundedVocabulary } from "@/modules/listing-catalogue/domain/bounded-vocabulary";
import {
  draftListingOf,
  isStepComplete,
  isStepNavigable,
  jumpableStepsFrom,
  PUBLISH_STEP_ORDER,
  type PublicationDraft,
  type PublishStepId,
  primaryActionFor,
  progressPercent,
  stepViolations,
} from "@/modules/listing-publication/domain/publication-steps";
import {
  type CuratedZone,
  validatePublishableListing,
} from "@/modules/listing-publication/domain/publishable-listing";
import type { PublicationZoneOption } from "@/modules/listing-publication/domain/zone-search";
import { buildSearchPanel } from "@/modules/listing-search/domain/search-panel";
import { ActionButton, NeutralButton, SelectionButton } from "../../components/atoms/buttons";
import { ListingMeta } from "../../components/atoms/ListingMeta";
import { ListingTitle } from "../../components/atoms/ListingTitle";
import { Price } from "../../components/atoms/Price";
import { Container } from "../../components/layout/Container";
import { DetailSplit } from "../../components/layout/DetailSplit";
import { FormShell } from "../../components/layout/FormShell";
import { ReadingWidth } from "../../components/layout/ReadingWidth";
import { ContactBlock } from "../../components/molecules/ContactBlock";
import { ListingCard, ListingGrid } from "../../components/molecules/ListingCard";
import { ResultRow } from "../../components/molecules/ResultRow";
import { SearchFilters } from "../../components/molecules/SearchFilters";
import { Nav } from "../../components/organisms/Nav";
import { SearchPanel } from "../../components/organisms/SearchPanel";
import { SignInDoor } from "../../components/organisms/SignInDoor";
import fichaStyles from "../alquiler/[ciudad]/[zona]/[slug]/ficha.module.css";
import homeStyles from "../home.module.css";
import misAvisosStyles from "../mis-avisos/mis-avisos.module.css";
import { PhotoUploader } from "../publicar/fotos/PhotoUploader";
import { PublishStep, type RailEntry } from "../publicar/PublishStep";
import publishStyles from "../publicar/publish-page.module.css";
import { PRIMARY_ACTION_LABEL, STEP_COPY, stepSummary } from "../publicar/step-copy";

/**
 * Layout-measurement harness (tasks.md 1b.10–1b.12, 1b.14). Renders the
 * real production components — through the real Next.js build/CSS-Modules
 * pipeline, not a hand-copied static page — so `playwright.measure.config.ts`
 * can read genuine geometry (`getBoundingClientRect`, `scrollWidth` vs
 * `clientWidth`) instead of asserting the stylesheet contains a number.
 *
 * Kept out of the production surface: this route 404s unless
 * `MEASURE_HARNESS_ENABLED=true`, a variable only `playwright.measure.config.ts`'s
 * `webServer` sets. Vercel deploys never set it, so a real visitor gets the
 * same 404 as any nonexistent path — the route is compiled (App Router has
 * no build-time page exclusion), but unreachable at runtime in production.
 * It carries no data fetching and no "use client" directive, so it adds
 * nothing to the read-path JS/webfont budget (design.md D13) even while it
 * exists in the build output.
 *
 * Content register is SISTEMA.md's own — Venezuelan zones, prices, and
 * titles "as people write them" — never lorem ipsum.
 */
export default async function MeasureHarnessPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (process.env.MEASURE_HARNESS_ENABLED !== "true") {
    notFound();
  }

  // **Se abre por la dirección, igual que en la ficha**, y no montada siempre:
  // encima de todo, su velo se come los clics de las otras mediciones — que fue
  // exactamente lo que pasó al intentarlo.
  const puerta = contactDoorFor(
    { state: "locked", method: "whatsapp" },
    { type: "owner", name: "María F." },
    (await searchParams)[DOOR_QUERY_NAME],
  );

  return (
    <>
      {/* **El nav, en sus dos formas, para medirlo de verdad** (14.41 corrigió
          un defecto que ninguna prueba de hoja de estilos podía ver: los tres
          slots de escritorio se colocaban por `order`, y el declarado dejaba la
          pastilla en la columna derecha con las acciones en el centro). Lo que
          hay que verificar es geometría renderizada, y para eso existe este
          arnés. */}
      <div data-testid="nav-harness-busqueda">
        <Nav
          account={{ kind: "anonymous" }}
          publish={{ bar: { label: "Publicar gratis", emphasis: "accent" }, menu: null }}
          signInHref="/signin"
          pill={{
            action: "/",
            name: "q",
            value: "",
            placeholder: "¿En qué zona buscás?",
            submitLabel: "Buscar",
            state: { kind: "empty" },
            // **El vocabulario acotado de la 14.51, armado por la MISMA función
            // que usan las dos pantallas de resultados** — no una lista escrita
            // a mano que se parezca. `Chacao` va con conteo cero a propósito:
            // es la zona que el dominio tiene que dejar afuera, y sin ella esa
            // medición no tendría qué mirar (una mutación contra una entrada
            // que la fixture nunca produce no mide nada).
            suggestions: boundedVocabulary(
              SUGERENCIAS_CIUDADES,
              SUGERENCIAS_ZONAS,
              SUGERENCIAS_CONTEOS,
            ),
          }}
        />
      </div>

      {/* **La barra con sesión, para medir el menú de cuenta** (14.48). El
          arnés de arriba es anónimo, así que las iniciales del avatar no se
          dibujaban en ninguna parte medible — y ahí vivía un token que el
          conjunto declara para el teléfono y que la hoja nunca leía. */}
      <div data-testid="nav-harness-cuenta">
        <Nav
          account={{
            kind: "authenticated",
            displayName: "María Fernández",
            email: "maria@example.com",
            initials: "MF",
            imageUrl: null,
            canImportListings: false,
            hasListings: true,
          }}
          publish={{ bar: { label: "Publicar", emphasis: "accent" }, menu: null }}
          signInHref="/signin"
          pill={{
            action: "/",
            name: "q",
            value: "",
            placeholder: "¿En qué zona buscás?",
            submitLabel: "Buscar",
            state: { kind: "empty" },
          }}
        />
      </div>

      {/* **La barra sin pastilla, que es la de la ficha** (14.54). Ya no lleva
          vuelta ni placa: con las dos afuera, la única diferencia con la de
          búsqueda es que ésta no arma pastilla, y eso es lo que se mide. */}
      <div data-testid="nav-harness-ficha">
        <Nav
          account={{ kind: "anonymous" }}
          publish={{ bar: { label: "Publicar gratis", emphasis: "accent" }, menu: null }}
          signInHref="/signin"
        />
      </div>

      <Container>
        <div data-testid="row-slot-long">
          <ResultRow
            city="Distrito Capital"
            ageLabel="hace 2 días"
            priceUsd={380}
            title="Apartamento amplio en La Castellana, 3 habitaciones con puesto de estacionamiento y línea blanca incluida"
            zone="La Castellana"
            rooms={3}
            areaM2={95}
            publisherType="owner"
          />
        </div>
        <div data-testid="row-slot-normal">
          <ResultRow
            priceUsd={250}
            title="Estudio en Altamira, ideal para una persona"
            zone="Altamira"
            rooms={1}
            areaM2={38}
            publisherType="broker"
          />
        </div>

        <div data-testid="btn-action">
          <ActionButton>Publicar</ActionButton>
        </div>
        <div data-testid="btn-selection">
          <SelectionButton>Chacao</SelectionButton>
        </div>
        <div data-testid="btn-neutral">
          <NeutralButton>Cancelar</NeutralButton>
        </div>

        <ReadingWidth>
          <p data-testid="body-copy">
            Rentas es gratis y sin comisión para quien publica y para quien alquila. Mantenemos la
            plataforma con aportes voluntarios de personas que ya usaron el servicio y quieren
            ayudar a que siga siendo gratuito para el resto.
          </p>
        </ReadingWidth>

        {/* Artboard 2a's filters, so the two compositions are measurable: a
          scrolling row of chips at 360, a stacked 240px sidebar at 1280. */}
        <div data-testid="search-filters-harness" style={{ maxWidth: 240 }}>
          <SearchFilters
            cities={[
              { id: "dc", name: "Distrito Capital" },
              { id: "mcbo", name: "Maracaibo" },
            ]}
            zones={[{ id: "chacao", name: "Chacao", cityId: "dc" }]}
          />
        </div>

        {/* Artboard 2g's empty state, so its geometry is measurable and its
          screenshot reviewable. /publicar/fotos is session-gated and needs a
          draft cookie, so Playwright cannot reach the real screen. */}
        <div data-testid="photo-uploader" className={publishStyles.page}>
          <FormShell>
            <PhotoUploader />
          </FormShell>
        </div>
      </Container>

      {/* Fuera del `Container` a propósito: cada paso trae su propia
          composición de 1100px con riel de 240px, y meterlo dentro de otro
          contenedor mediría la caja equivocada — el mismo error de puntería
          que dejó el encabezado contra el borde mientras los campos flotaban
          centrados. */}
      <div data-testid="publish-step-tamano">{stepHarness("tamano", harnessDraft())}</div>
      {/* **El panel de filtros, medido y no leído** (14.32).
          `SearchPanel.module.css` afirmaba abrir los cuatro grupos en
          escritorio con `::details-content`, y eso era una declaración que
          ninguna prueba podía ver: en un navegador que no lo entiende, 1280
          dibujaba el acordeón del teléfono y la hoja seguía en verde. Lo que hay
          que verificar es geometría renderizada — cuántos cuerpos de grupo se
          dibujan a cada ancho — y para eso existe este arnés (1b.10).

          `transform` crea el bloque contenedor del `position: fixed` del panel:
          sin esto el modal taparía el resto del arnés y las demás medidas
          medirían una pantalla cubierta. */}
      <div
        data-testid="search-panel-harness"
        style={{ transform: "translateZ(0)", position: "relative", blockSize: 640 }}
      >
        <SearchPanel model={harnessPanel()} />
      </div>

      {/* La cuadrícula con ocho avisos: lo que la 14.33 compró al sacar la barra
          lateral es exactamente el ancho, y «cuatro columnas» es una medida. */}
      <Container>
        <div data-testid="listing-grid-harness">
          <ListingGrid>
            {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
              <li key={n}>
                <ListingCard
                  href={`/alquiler/distrito-capital/chacao/apto-${n}`}
                  priceUsd={380 + n * 20}
                  title={`Apartamento 2 hab con puesto ${n}`}
                  zone="Chacao"
                  rooms={2}
                  areaM2={78}
                  publisherType="owner"
                  photo={{
                    thumbUrl: "https://fotos.rentas.com.ve/photos/pub/tok/thumb.webp",
                    cardUrl: "https://fotos.rentas.com.ve/photos/pub/tok/card.webp",
                    alt: `Foto 1 de 1 — Apartamento ${n}, Chacao`,
                  }}
                />
              </li>
            ))}
          </ListingGrid>
        </div>

        {/* **La placa del publicador encima de una foto clara y una oscura**
            (14.53, 22.10). La 14.25 exige que dueño e inmobiliaria se
            distingan **en escala de grises**, y encima de una portada esa
            garantía no se hereda: la foto la sube quien publica y puede ser
            cualquier cosa. Se dibujan las cuatro combinaciones para poder
            medirlas —dueño e inmobiliaria, sobre claro y sobre oscuro— en
            `tests/measure/layout.spec.ts`.

            Las dos portadas son PNG de un píxel en línea, no descargas: el
            navegador tiene que poder leer sus píxeles desde un `<canvas>` para
            que «clara» y «oscura» sean una medida y no una palabra, y una
            imagen de otro origen contamina el lienzo y no se deja leer. */}
        <div data-testid="placa-sobre-foto">
          <ListingGrid>
            {PORTADAS.map(({ nombre, url }) =>
              (["owner", "broker"] as const).map((quien) => (
                <li key={`${nombre}-${quien}`} data-portada={nombre} data-publica={quien}>
                  <ListingCard
                    href={`/alquiler/distrito-capital/chacao/placa-${nombre}-${quien}`}
                    priceUsd={450}
                    title="Apartamento 2 hab con puesto"
                    zone="Chacao"
                    rooms={2}
                    areaM2={78}
                    publisherType={quien}
                    photo={{ thumbUrl: url, cardUrl: url, alt: `Portada ${nombre}` }}
                  />
                </li>
              )),
            )}
          </ListingGrid>
        </div>

        {/* **La fila de `/mis-avisos`, al lado de la tarjeta y a propósito.**
            Las dos dibujan el mismo aviso con la misma anatomía —precio,
            título de lista, metadatos— y hasta la 22.3/22.4 lo hacían con
            tres copias del mismo CSS que ya habían empezado a discrepar. Que
            digan lo mismo es una medida, no una lectura, así que las dos
            tienen que estar en la misma página para poder compararlas.

            Sólo la carcasa: nada del borrador, su formulario ni su Server
            Action — el arnés dibuja y no consulta. */}
        {/* **Las dos fichas de selección, juntas para poder compararlas**
            (22.5). Son el mismo componente dibujado dos veces —un enlace que
            elige una opción de un conjunto, con una marcada— y hasta acá el
            estado elegido se pintaba con dos idiomas distintos. Que digan lo
            mismo es una medida y no una lectura, así que las dos viven en la
            misma página. */}
        <div data-testid="chips-inicio">
          <ul className={homeStyles.chips}>
            <li>
              <span className={homeStyles.chipSelected}>Distrito Capital</span>
            </li>
            <li>
              <span className={homeStyles.chip}>Maracaibo</span>
            </li>
          </ul>
        </div>

        <div data-testid="chips-mis-avisos">
          <ul className={misAvisosStyles.fichas}>
            <li>
              <span className={misAvisosStyles.ficha} aria-current="page">
                Todos <span className={misAvisosStyles.fichaCuenta}>3</span>
              </span>
            </li>
            <li>
              <span className={misAvisosStyles.ficha}>
                Activas <span className={misAvisosStyles.fichaCuenta}>2</span>
              </span>
            </li>
          </ul>
        </div>

        <div data-testid="mis-avisos-harness">
          <ul className={misAvisosStyles.lista}>
            <li className={misAvisosStyles.aviso} data-estado="active">
              <div className={misAvisosStyles.miniatura} aria-hidden="true" />
              <div className={misAvisosStyles.cuerpo}>
                <Price usd={450} />
                <ListingTitle level={2}>
                  Apartamento 2 habitaciones con puesto de estacionamiento
                </ListingTitle>
                <ListingMeta>Chacao · 2 hab · 78 m²</ListingMeta>
                <p className={misAvisosStyles.estado}>Activa · vence en 22 días</p>
              </div>
            </li>
          </ul>
        </div>
      </Container>

      <div data-testid="publish-step-zona">
        {stepHarness("zona", harnessDraft(), [
          {
            zoneId: "altamira",
            cityId: "dc",
            label: "Altamira",
            scope: "Municipio Chacao · Distrito Capital",
          },
          {
            zoneId: "alta-florida",
            cityId: "dc",
            label: "Alta Florida",
            scope: "Municipio Libertador · Distrito Capital",
          },
        ])}
      </div>

      {/* **La ficha, para medirla de verdad** (16.23, 16.25, 16.29).

          Monta la hoja REAL de la ficha —`ficha.module.css`, la misma que sirve
          `/alquiler/<ciudad>/<zona>/<slug>`— dentro de las mismas primitivas:
          `Container` (1100) y `DetailSplit` (640 + 40 + 420). Lo único escrito
          acá son los tres elementos de texto, y `ficha-medida.test.ts` ata sus
          clases a las que la página usa: si alguien renombra `.price` allá,
          esa prueba se pone roja antes de que ésta mida una clase huérfana.

          Existe porque una aserción sobre el contenido de la hoja no puede
          distinguir `--ficha-price-fs` (30) de `--fpb` (26): las dos son
          propiedades personalizadas y `lint:tokens` acepta las dos. Lo único
          que las distingue es el número dibujado. */}
      <div className={fichaStyles.page}>
        <Container>
          <DetailSplit
            media={
              <>
                {/* La columna de 640. No es la tira de fotos real porque lo que
                    se mide es la CELDA de la grilla, no la galería: la tira
                    lleva su propio ancho por token (`--ficha-photo-w-desktop`)
                    y mediría ese token en vez de la columna. */}
                <div data-testid="ficha-media" style={{ blockSize: 200 }} />
                <div className={fichaStyles.body}>
                  <section className={fichaStyles.description}>
                    <h2 className={fichaStyles.heading}>Descripción</h2>
                    <ReadingWidth>
                      <p className={fichaStyles.text} data-testid="ficha-description">
                        Edificio de 2007, piso 6 con ascensor y vigilancia las 24 horas. Tiene
                        planta eléctrica y tanque propio, así que el agua llega todos los días.
                      </p>
                    </ReadingWidth>
                  </section>
                </div>
              </>
            }
            data={
              <>
                <div className={fichaStyles.summary}>
                  <p className={fichaStyles.price} data-testid="ficha-price">
                    $450
                    <span className={fichaStyles.perMonth}> / mes</span>
                  </p>
                  <h1 className={fichaStyles.title} data-testid="ficha-title">
                    Apartamento 2 habitaciones con puesto de estacionamiento
                  </h1>
                  <p className={fichaStyles.location}>Apartamento · Chacao · Distrito Capital</p>
                </div>
                <div className={fichaStyles.contact}>
                  <ContactBlock
                    contact={{ state: "locked", method: "whatsapp" }}
                    publisherType="owner"
                    publisherName="María F."
                    listingId="00000000-0000-4000-8000-000000000000"
                    listingTitle="Apartamento 2 habitaciones con puesto de estacionamiento"
                    revealAction={measureRevealAction}
                    verificationNotice={null}
                    expiresAt={new Date("2026-09-12T00:00:00.000Z")}
                    zoneName="Chacao"
                    zoneHref="/alquiler/distrito-capital/chacao"
                    doorHref="/alquiler/distrito-capital/chacao/apartamento-medida?entrar=si"
                  />
                </div>
              </>
            }
          />
        </Container>
      </div>

      {/* **La puerta, montada de verdad** (15.8): el mismo componente que sirve
          la ficha, para que la medición lea geometría dibujada. */}
      {puerta ? (
        <SignInDoor
          copy={puerta}
          stayHref="/alquiler/distrito-capital/chacao/apartamento-medida"
          callbackUrl="/alquiler/distrito-capital/chacao/apartamento-medida"
          signInAction={measureRevealAction}
        />
      ) : null}
    </>
  );
}

/**
 * La acción del bloque de contacto, que este arnés nunca dispara.
 *
 * `ContactBlock` la exige porque el revelado es un caso de uso y no un enlace,
 * pero acá se mide geometría: nada se envía. Se declara vacía en vez de
 * importar `revealListingContact` para que el arnés no arrastre la sesión de
 * Auth.js ni el cliente de la base sólo para dibujar un botón — y para que un
 * error de medición no pueda escribir jamás en `contact_reveal_event`, que es
 * un registro de sólo-agregar.
 */
async function measureRevealAction(_formData: FormData): Promise<void> {
  "use server";
}

/**
 * Los nueve pasos, montados de verdad.
 *
 * **`PublishStep` es el mismo componente que sirve `/publicar/paso/[paso]`.**
 * Recibe todo por props —el borrador, el riel, las violaciones, los resultados
 * de zona— así que se puede montar sin sesión, sin cookie y sin base, que es
 * exactamente lo que Playwright necesita: `/publicar` está detrás de la sesión
 * y el arnés no llega. Lo que se mide acá es entonces la geometría real de la
 * pantalla real, a través del mismo pipeline de CSS Modules.
 *
 * Antes de esto el arnés dibujaba un formulario de ejemplo escrito a mano
 * porque el formulario de una sola pantalla se había retirado. Medía una
 * pantalla que ya no existía y pasaba en verde, que es peor que no medir nada.
 *
 * Las dos que se montan son las dos que pueden romperse por geometría:
 *
 * - **el paso 4**, el único con cuatro controles, y por lo tanto el único que
 *   puede desbordar la columna de 520px o encoger un objetivo táctil;
 * - **el paso 2**, donde la fila de búsqueda y la lista de resultados son lo
 *   que reemplazó al par ciudad/zona — la ciudad ya no se pregunta, se deriva
 *   de la zona (criterio de aceptación 7).
 */
function stepHarness(
  stepId: PublishStepId,
  draft: PublicationDraft,
  zoneResults?: readonly PublicationZoneOption[],
) {
  // El mismo cálculo que hace la página real, con las mismas funciones del
  // dominio: un riel armado a mano acá volvería a medir algo que no se sirve.
  const violations = validatePublishableListing(draftListingOf(draft), HARNESS_ZONES);

  const rail: readonly RailEntry[] = PUBLISH_STEP_ORDER.map((id) => ({
    id,
    number: STEP_COPY[id].number,
    label: STEP_COPY[id].railLabel,
    summary: stepSummary(id, draft, { zoneName: HARNESS_ZONE_NAME }),
    done: isStepComplete(id, draft, violations),
    navigable: isStepNavigable(id, draft, violations),
    current: id === stepId,
  }));

  return (
    <PublishStep
      stepId={stepId}
      draft={draft}
      violations={stepViolations(stepId, violations)}
      rail={rail}
      // El mapa de móvil (18.17), con la misma función del dominio que usa la
      // página: uno armado a mano acá volvería a medir algo que no se sirve.
      jumpable={jumpableStepsFrom(stepId, draft, violations)}
      progress={progressPercent(draft, violations)}
      // El arnés arma el borrador, así que nunca hay uno vencido que explicar.
      draftExpired={false}
      returningToReview={false}
      // El arnés mide el recorrido hacia adelante, que no viene de revisar.
      discardHref={null}
      primaryLabel={PRIMARY_ACTION_LABEL[primaryActionFor(stepId, false)]}
      previousStep={PUBLISH_STEP_ORDER[PUBLISH_STEP_ORDER.indexOf(stepId) - 1] ?? null}
      zoneQuery={zoneResults ? "altamira" : undefined}
      zoneResults={zoneResults}
      zoneName={HARNESS_ZONE_NAME}
    />
  );
}

/**
 * **El vocabulario acotado de la 14.51, con las dos trampas del dominio
 * adentro**: un nombre repetido entre ciudades (`Centro`, la regla de la 14.18)
 * y una zona **sin avisos activos** (`Chacao`, en cero), que es justo la que el
 * dominio tiene que dejar afuera. Una fixture que no produjera esa entrada
 * dejaría a la medición del recorte sin nada que mirar.
 */
const SUGERENCIAS_CIUDADES = [
  { id: "dc", name: "Distrito Capital" },
  { id: "mcbo", name: "Maracaibo" },
];

const SUGERENCIAS_ZONAS = [
  { id: "z-altamira", name: "Altamira", cityId: "dc", parentName: "Chacao" },
  { id: "z-chacao", name: "Chacao", cityId: "dc", parentName: "Chacao" },
  { id: "z-centro-dc", name: "Centro", cityId: "dc", parentName: "Catedral" },
  { id: "z-centro-mcbo", name: "Centro", cityId: "mcbo", parentName: "Coquivacoa" },
];

const SUGERENCIAS_CONTEOS = {
  "z-altamira": 9,
  "z-chacao": 0,
  "z-centro-dc": 4,
  "z-centro-mcbo": 2,
};

/** Zonas curadas de mentira, para que el validador tenga contra qué contestar. */
const HARNESS_ZONES: readonly CuratedZone[] = [{ id: "altamira", cityId: "dc" }];
const HARNESS_ZONE_NAME = "Altamira";

/**
 * Un borrador que llegó hasta el paso que se mide. El registro es el de
 * SISTEMA.md: zonas, precios y títulos venezolanos, nunca lorem ipsum.
 */
function harnessDraft(): PublicationDraft {
  return {
    listing: {
      propertyType: "apartamento",
      cityId: "dc",
      zoneId: "altamira",
      priceUsd: 380,
      rooms: 3,
      bathrooms: 2,
      parkingSpots: 1,
      areaM2: 95,
    },
    photos: [],
  };
}

/**
 * El panel real, abierto, con los conteos que la lámina 7b dibuja. Se arma con
 * `buildSearchPanel` y no a mano: lo que hay que medir es el panel que se
 * sirve, no una maqueta que se le parece — es el mismo error que dejó a este
 * arnés dibujando un formulario de publicar que ya no existía.
 */
function harnessPanel() {
  return buildSearchPanel({
    basePath: "/alquiler/distrito-capital",
    cityPath: "/alquiler/distrito-capital",
    // `filtros=todos`: el panel es un estado de la dirección (14.33).
    query: { filtros: "todos" },
    cityName: "Distrito Capital",
    zones: [
      { id: "chacao", name: "Chacao", slug: "chacao", path: "/alquiler/distrito-capital/chacao" },
    ],
    chosenZoneIds: [],
    counts: {
      total: 16,
      byZone: { chacao: 12 },
      byMinRooms: { 1: 16, 2: 9, 3: 4, 4: 0 },
      byMinBathrooms: { 1: 16, 2: 7, 3: 0 },
      byAttribute: {
        hasPowerPlant: 9,
        hasRegularWater: 12,
        isFurnished: 4,
        hasSecurity: 8,
        hasAppliances: 6,
      },
      byPublisherType: { owner: 11, broker: 5 },
      // Las nueve relajaciones y el total pelado de la ciudad. Son la otra
      // mitad del conteo en vivo (14.34): cuántos quedarían al SOLTAR cada
      // filtro, que es lo que dice el botón al volver a tocar el elegido.
      withoutFilter: {
        zone: 40,
        price: 22,
        rooms: 31,
        bathrooms: 31,
        publisherType: 25,
        hasPowerPlant: 18,
        hasRegularWater: 19,
        isFurnished: 20,
        hasSecurity: 21,
        hasAppliances: 23,
      },
      byPriceBucket: [
        { count: 1, lowestUsd: 200, highestUsd: 240 },
        { count: 2, lowestUsd: 300, highestUsd: 380 },
        { count: 4, lowestUsd: 400, highestUsd: 495 },
        { count: 3, lowestUsd: 505, highestUsd: 590 },
        { count: 3, lowestUsd: 610, highestUsd: 690 },
        { count: 1, lowestUsd: 720, highestUsd: 780 },
        { count: 1, lowestUsd: 880, highestUsd: 880 },
        { count: 1, lowestUsd: 1000, highestUsd: 1000 },
      ],
      cityTotal: 70,
    },
    criteria: {},
  });
}

/**
 * Las dos portadas del arnés de la placa: un PNG de un píxel casi blanco y
 * otro casi negro, en línea. El `object-fit: cover` de la tarjeta los estira
 * a la portada entera, así que cada foto es un plano de un solo tono — que es
 * lo que hace falta para que «clara» y «oscura» se puedan medir con un número.
 */
const PORTADAS = [
  {
    nombre: "clara",
    url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR42mP49OUrAAW3Atyfuv3kAAAAAElFTkSuQmCC",
  },
  {
    nombre: "oscura",
    url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR42mMQEBYBAABuADjKuEn2AAAAAElFTkSuQmCC",
  },
] as const;
