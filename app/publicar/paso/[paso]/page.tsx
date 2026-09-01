import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import {
  isStepComplete,
  isStepNavigable,
  jumpableStepsFrom,
  offersDiscardToReview,
  PUBLISH_STEP_ORDER,
  type PublishStepId,
  parseStepId,
  primaryActionFor,
  progressPercent,
  stepViolations,
} from "@/modules/listing-publication/domain/publication-steps";
import { searchPublicationZones } from "@/modules/listing-publication/domain/zone-search";
import { DrizzleZoneVocabulary } from "@/modules/listing-publication/infrastructure/drizzle-zone-vocabulary";
import { buildPriceStepHistogramView } from "@/modules/listing-search/domain/price-histogram-step";
import { DrizzleZonePriceTally } from "@/modules/listing-search/infrastructure/drizzle-zone-price-tally";
import { db } from "@/shared/db/client";
import { requireSession } from "../../../_lib/require-session";
import { reviewPathFor } from "../../change-notice-url";
import { PublishStep, type RailEntry } from "../../PublishStep";
import { readPublicationContext } from "../../publication-context";
import { PRIMARY_ACTION_LABEL, STEP_COPY, stepSummary } from "../../step-copy";

export const metadata: Metadata = {
  title: "Publicar — Rentas",
};

interface StepPageProps {
  readonly params: Promise<{ paso: string }>;
  /** `volver=revisar` cambia el boton y el destino; `q` es la busqueda de zona. */
  readonly searchParams: Promise<{ volver?: string; q?: string }>;
}

export default async function StepPage({ params, searchParams }: StepPageProps) {
  const { paso } = await params;

  const stepId = parseStepId(paso);
  // El segmento lo escribe quien quiera. Un paso inventado es un 404, no una
  // pantalla a medio dibujar.
  if (!stepId) notFound();

  await requireSession(`/publicar/paso/${stepId}`);

  const { volver, q } = await searchParams;
  const returningToReview = volver === "revisar";

  const { draft, violations, currentStep, zoneName } = await readPublicationContext();

  // **Criterio de aceptacion 10, aplicado en el servidor.** Que el riel no
  // dibuje el enlace es una cortesia; esto es la garantia. Escribir
  // `/publicar/paso/quien` con el paso 2 sin contestar devuelve al paso que
  // falta, en vez de dejar publicar un aviso con huecos que nadie vio.
  if (!isStepNavigable(stepId, draft, violations)) {
    redirect(`/publicar/paso/${currentStep}`);
  }

  const rail: readonly RailEntry[] = PUBLISH_STEP_ORDER.map((id) => ({
    id,
    number: STEP_COPY[id].number,
    label: STEP_COPY[id].railLabel,
    // Un paso hecho muestra SU VALOR, no su numero.
    summary: stepSummary(id, draft, { zoneName }),
    done: isStepComplete(id, draft, violations),
    navigable: isStepNavigable(id, draft, violations),
    current: id === stepId,
  }));

  // El paso 2 es el unico que consulta algo para dibujarse, y solo cuando hay
  // algo escrito: sin busqueda no hay lista, y volcar el catalogo entero seria
  // exactamente lo que el puerto acotado existe para no hacer.
  const zoneResults =
    stepId === "zona" && q
      ? searchPublicationZones(q, await new DrizzleZoneVocabulary(db).lookup(q))
      : undefined;

  // **El paso 3 es el segundo que consulta, y por la misma razón que el 2: sólo
  // cuando hay de qué hablar.** El puerto es angosto —los ocho cubos de la zona
  // y nada más— aunque abajo lo resuelva el MISMO motor de facetas que F5
  // (18.9). La zona la garantiza `isStepNavigable`, que ya devolvió al paso 2
  // en la línea 54 si faltaba; la guarda de acá es la que impide consultar sin
  // «acá» aunque esa garantía se rompa mañana (AGENTS.md §7).
  const { cityId, zoneId } = draft.listing;
  const priceHistogram =
    stepId === "precio" && cityId && zoneId && zoneName
      ? buildPriceStepHistogramView(
          await new DrizzleZonePriceTally(db).tallyForZone(cityId, zoneId),
          {
            zoneName,
            priceUsd: draft.listing.priceUsd,
            // Lo que el CAMPO está mostrando. Con basura tecleada el precio
            // guardado es el anterior, y la frase no lo juzga.
            retypedPrice: draft.raw?.priceUsd,
          },
        )
      : undefined;

  return (
    <PublishStep
      stepId={stepId}
      draft={draft}
      // Solo las de este paso. Un error de fotos en el paso 3 apunta a un
      // campo que no existe en la pantalla: un callejon sin salida.
      violations={stepViolations(stepId, draft.violations)}
      raw={draft.raw}
      rail={rail}
      // El mapa de móvil (18.17). A qué pasos se puede saltar lo contesta el
      // dominio con la MISMA puerta que la línea 52 vuelve a aplicar al
      // aterrizar: un mapa con su propia regla ofrecería un salto que esta
      // página rechaza.
      jumpable={jumpableStepsFrom(stepId, draft, violations)}
      progress={progressPercent(draft, violations)}
      returningToReview={returningToReview}
      // Si se ofrece lo contesta el dominio; acá sólo se elige a dónde lleva.
      // `reviewPathFor([])` y no la ruta escrita a mano: descartar vuelve sin
      // cambios que anunciar, y ésa es la misma función que ya sabe que sin
      // cambios la dirección no lleva cola.
      discardHref={
        offersDiscardToReview(returningToReview, draft, violations) ? reviewPathFor([]) : null
      }
      primaryLabel={PRIMARY_ACTION_LABEL[primaryActionFor(stepId, returningToReview)]}
      previousStep={previousStepOf(stepId)}
      zoneQuery={q}
      zoneResults={zoneResults}
      zoneName={zoneName}
      priceHistogram={priceHistogram}
    />
  );
}

function previousStepOf(stepId: PublishStepId): PublishStepId | null {
  return PUBLISH_STEP_ORDER[PUBLISH_STEP_ORDER.indexOf(stepId) - 1] ?? null;
}
