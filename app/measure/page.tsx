import { notFound } from "next/navigation";
import {
  draftListingOf,
  isStepComplete,
  isStepNavigable,
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
import { ActionButton, NeutralButton, SelectionButton } from "../../components/atoms/buttons";
import { Container } from "../../components/layout/Container";
import { FormShell } from "../../components/layout/FormShell";
import { ReadingWidth } from "../../components/layout/ReadingWidth";
import { ResultRow } from "../../components/molecules/ResultRow";
import { SearchFilters } from "../../components/molecules/SearchFilters";
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
export default function MeasureHarnessPage() {
  if (process.env.MEASURE_HARNESS_ENABLED !== "true") {
    notFound();
  }

  return (
    <>
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
    </>
  );
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
      progress={progressPercent(draft, violations)}
      returningToReview={false}
      primaryLabel={PRIMARY_ACTION_LABEL[primaryActionFor(stepId, false)]}
      previousStep={PUBLISH_STEP_ORDER[PUBLISH_STEP_ORDER.indexOf(stepId) - 1] ?? null}
      zoneQuery={zoneResults ? "altamira" : undefined}
      zoneResults={zoneResults}
      zoneName={HARNESS_ZONE_NAME}
    />
  );
}

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
