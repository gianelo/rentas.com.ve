import { notFound } from "next/navigation";
import { ActionButton, NeutralButton, SelectionButton } from "../../components/atoms/buttons";
import { Container } from "../../components/layout/Container";
import { FormShell } from "../../components/layout/FormShell";
import { ReadingWidth } from "../../components/layout/ReadingWidth";
import { ResultRow } from "../../components/molecules/ResultRow";
import { SearchFilters } from "../../components/molecules/SearchFilters";
import { PhotoUploader } from "../publicar/fotos/PhotoUploader";
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
      <div data-testid="publish-column" className={publishStyles.page}>
        <FormShell>
          <h1 data-testid="publish-title" className={publishStyles.title}>
            Publicar una propiedad
          </h1>
          {/* El formulario largo de un paso se retiró: ahora son nueve
              pantallas, una pregunta por vez. Lo que esta banca mide de ellas
              es una sola — el paso 4, que es la que tiene cuatro controles y
              por lo tanto la que puede desbordar la columna de 520px. El
              formulario real vive detrás de la sesión y Playwright no llega. */}
          <form data-testid="publish-step-form">
            {[
              ["Habitaciones", "2"],
              ["Baños", "2"],
              ["Puestos de auto", "1"],
              ["Metros cuadrados", "78"],
            ].map(([label, value]) => (
              <p key={label}>
                <label htmlFor={`measure-${label}`}>{label}</label>
                <input id={`measure-${label}`} name={label} type="text" defaultValue={value} />
              </p>
            ))}
            <ActionButton type="submit">Seguir</ActionButton>
          </form>
        </FormShell>
      </div>

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
  );
}
