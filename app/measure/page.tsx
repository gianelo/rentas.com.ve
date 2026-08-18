import { notFound } from "next/navigation";
import { ActionButton, NeutralButton, SelectionButton } from "../../components/atoms/buttons";
import { Container } from "../../components/layout/Container";
import { ReadingWidth } from "../../components/layout/ReadingWidth";
import { ResultRow } from "../../components/molecules/ResultRow";
import { PublishForm } from "../publicar/PublishForm";
import publishStyles from "../publicar/publish-page.module.css";

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
    <Container>
      <div data-testid="row-slot-long">
        <ResultRow
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
          plataforma con aportes voluntarios de personas que ya usaron el servicio y quieren ayudar
          a que siga siendo gratuito para el resto.
        </p>
      </ReadingWidth>

      {/* Screen 3, mounted here because /publicar is session-gated and
          Playwright cannot reach it. This is the harness earning its keep:
          the publish form shipped with eleven green tests and nine layout
          differences, because every one of those tests read markup and none
          could see geometry. */}
      {/* Wrapped in the page's own column so its width is measurable, not just
          the form's. Measuring only the form is what let the heading sit
          against the left edge of a 1280 screen while the fields floated
          centred — the bound was on the wrong element. */}
      <div data-testid="publish-column" className={publishStyles.column}>
        <h1 data-testid="publish-title" className={publishStyles.title}>
          Publicar una propiedad
        </h1>
        <PublishForm
          cities={[
            { id: "dc", name: "Distrito Capital" },
            { id: "mcbo", name: "Maracaibo" },
          ]}
          zones={[
            { id: "chacao", name: "Chacao", cityId: "dc" },
            { id: "altamira", name: "Altamira", cityId: "dc" },
            { id: "la-lago", name: "La Lago", cityId: "mcbo" },
          ]}
          values={{ title: "Apartamento 2 habitaciones en Chacao", priceUsd: "450" }}
        />
      </div>
    </Container>
  );
}
