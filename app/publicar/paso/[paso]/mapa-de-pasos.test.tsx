import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { draftListingOf } from "@/modules/listing-publication/domain/publication-steps";
import {
  type CuratedZone,
  validatePublishableListing,
} from "@/modules/listing-publication/domain/publishable-listing";
import type { StoredDraft } from "../../draft";
import { STEP_MAP_TRIGGER_LABEL } from "../../step-copy";

/**
 * **El mapa de pasos de móvil** (tasks.md 18.17, §12 de `Rentas - Publicar -
 * Especificacion.md`), en los bytes que salen de la ruta.
 *
 * Ninguna lámina lo dibuja: §12 lo lista entre lo que falta diseñar, y era el
 * último de esa lista. Se deriva, no se inventa (AGENTS.md §2). Lo que se sirve
 * es un `<details>` con enlaces adentro, o sea **marcado, no un script**: el
 * flujo de publicar está detrás de una sesión, pero la exención de §2 cubre la
 * compresión de fotos del paso 8 y nada más.
 *
 * Se renderiza la RUTA y no el componente porque este cambio ya pagó seis veces
 * el mismo defecto: una pieza probada que ninguna página conectaba nunca.
 * `renderToStaticMarkup` devuelve la respuesta servida sin ejecutar una línea
 * de cliente, que es además lo que recibe quien tiene el script apagado.
 *
 * **Ninguna afirmación de acá es una regla.** A qué pasos se puede saltar lo
 * decide `jumpableStepsFrom`, en el dominio y bajo el piso del 90 %.
 */

const { redirect, notFound } = vi.hoisted(() => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  }),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("next/navigation", () => ({ redirect, notFound }));
vi.mock("@/shared/db/client", () => ({ db: {} }));
vi.mock("../../../_lib/require-session", () => ({
  requireSession: async () => ({ userId: "publicador-1", email: "dueno@ejemplo.com" }),
}));
vi.mock("../../actions", () => ({ submitStep: vi.fn() }));
vi.mock("../../fotos/PhotoUploader", () => ({ PhotoUploader: () => null }));
vi.mock("../../publication-context", () => ({
  readPublicationContext: async () => contextoDe(borrador),
}));

import StepPage from "./page";

const ZONES: readonly CuratedZone[] = [{ id: "altamira", cityId: "dc" }];

/** Los cuatro primeros pasos contestados; los cinco últimos, no. */
function borradorHastaElCuatro(): StoredDraft {
  return {
    listing: {
      propertyType: "apartamento",
      cityId: "dc",
      zoneId: "altamira",
      priceUsd: 450,
      rooms: 3,
      bathrooms: 2,
      parkingSpots: 1,
      areaM2: 90,
    },
    photos: [],
    violations: [],
  };
}

/**
 * **Las violaciones se calculan, no se escriben a mano.** Una lista inventada
 * acá diría que un paso está hecho cuando el validador dice que no, y entonces
 * esta prueba mediría un producto que nadie sirve.
 */
function contextoDe(draft: StoredDraft) {
  const violations = validatePublishableListing(draftListingOf(draft), ZONES);
  return { draft, violations, currentStep: "atributos" as const, zoneName: "Altamira" };
}

let borrador: StoredDraft = borradorHastaElCuatro();

beforeEach(() => {
  borrador = borradorHastaElCuatro();
});

async function servido(paso: string): Promise<string> {
  return renderToStaticMarkup(
    await StepPage({
      params: Promise.resolve({ paso }),
      searchParams: Promise.resolve({}),
    }),
  );
}

describe("el mapa que en un teléfono reemplaza al riel (18.17)", () => {
  /**
   * El salto que en móvil no existía: desde el paso 4, volver al 2 sin
   * recorrer el 3 hacia atrás con la flecha. Es un enlace de verdad, con su
   * dirección en el marcado, así que funciona con el script apagado.
   */
  it("dibuja un enlace a cada paso ya contestado, sin ningún formulario ni script detrás", async () => {
    const html = await servido("tamano");

    expect(html).toContain(STEP_MAP_TRIGGER_LABEL);
    expect(html).toContain("<details");
    expect(html).toMatch(/<a[^>]+href="\/publicar\/paso\/zona"/);
    expect(html).toMatch(/<a[^>]+href="\/publicar\/paso\/tipo"/);
  });

  /**
   * **La otra mitad, y sola ninguna de las dos afirma la pregunta.** El paso 9
   * está sin contestar: la página redirige por `isStepNavigable`, así que un
   * enlace hacia él aterrizaría donde no dijo. Un mapa que lista todo y falla
   * al tocar es peor que uno que lista lo que funciona (criterio 10).
   */
  it("no dibuja el paso sin contestar, que es adonde el enlace no aterrizaría", async () => {
    const html = await servido("tamano");

    expect(html).not.toMatch(/<a[^>]+href="\/publicar\/paso\/quien"/);
  });

  /**
   * **Fallar cerrado** (AGENTS.md §7). En el paso 1 recién abierto no hay
   * ningún salto posible: el contador vuelve a ser texto y no hay desplegable
   * que abrir. Ofrecer un control vacío es peor que no ofrecerlo.
   */
  it("en el paso 1 de un borrador vacío no dibuja mapa, sólo el contador", async () => {
    borrador = { listing: {}, photos: [], violations: [] };

    const html = await servido("tipo");

    expect(html).not.toContain(STEP_MAP_TRIGGER_LABEL);
    expect(html).not.toContain("<details");
    expect(html).toContain("1 / 9");
  });
});
