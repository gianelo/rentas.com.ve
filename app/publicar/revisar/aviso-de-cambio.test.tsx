import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { StoredDraft } from "../draft";

/**
 * **«Al volver desde revisar, decir qué cambió»** (tasks.md 18.16, regla 4 de
 * la §4 de `Rentas - Publicar - Especificacion.md`), en los bytes que salen de
 * la ruta.
 *
 * La 18.8 ya garantiza que corregir el paso 4 no borra los pasos 5 a 9 —
 * `applyStepAnswers` lo prueba en el dominio. **Esto es la otra mitad: que la
 * persona lo sepa.** El estado sobrevive, pero el silencio se lee igual que la
 * pérdida, y nueve pasos son nueve oportunidades de abandonar.
 *
 * Se renderiza la RUTA y no la función de copia, porque este repositorio ya
 * pagó tres veces el mismo defecto en una semana —`resultsOrigin`,
 * `ContactBlock`, `canImportListings`— una pieza probada al 100 % que ninguna
 * página conectaba nunca. `renderToStaticMarkup` devuelve la respuesta servida
 * sin ejecutar una línea de cliente, que además es lo que exige el piso sin
 * JavaScript de la F14.
 *
 * Ninguna afirmación de acá es una regla: qué cambió lo decide
 * `describeDraftChanges` y qué se le cree a la URL lo decide
 * `parseDraftChanges`, los dos en el dominio y bajo el piso del 90 %.
 */

const { redirect } = vi.hoisted(() => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  }),
}));

vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/shared/db/client", () => ({ db: {} }));
vi.mock("../../_lib/require-session", () => ({
  requireSession: async () => ({ userId: "publicador-1", email: "dueno@ejemplo.com" }),
}));
// La acción de publicar arrastra `next/headers`, R2 y la base entera, y no
// participa de lo que se prueba: acá se mira el aviso de cambio, no el botón.
vi.mock("../actions", () => ({ publishFromReview: vi.fn() }));
vi.mock("../publication-context", () => ({
  readPublicationContext: async () => ({
    draft: DRAFT,
    violations: [],
    currentStep: "quien",
    zoneName: "Altamira",
  }),
}));

import ReviewPage from "./page";

/** Los nueve pasos contestados: sin eso la pantalla redirige y no dibuja nada. */
const DRAFT: StoredDraft = {
  listing: {
    propertyType: "apartamento",
    cityId: "dc",
    zoneId: "altamira",
    priceUsd: 450,
    rooms: 3,
    bathrooms: 3,
    parkingSpots: 1,
    areaM2: 90,
    hasPowerPlant: true,
    hasRegularWater: true,
    isFurnished: false,
    hasSecurity: true,
    hasAppliances: false,
    title: "Apartamento 3 habitaciones con puesto",
    description: "x".repeat(140),
    publisherType: "owner",
    contactMethod: "whatsapp",
    contactValue: "04125550134",
  },
  photos: [{ key: "u/1.webp", name: "Sala", bytes: 168_000 }],
  featuresDeclared: true,
  violations: [],
};

type Params = Record<string, string | string[]>;

async function served(searchParams: Params): Promise<string> {
  return renderToStaticMarkup(await ReviewPage({ searchParams: Promise.resolve(searchParams) }));
}

describe("la pantalla de revisar dice qué cambió", () => {
  it("nombra el campo con su valor anterior y el nuevo", async () => {
    const html = await served({ campo: "rooms", antes: "2", ahora: "3" });

    expect(html).toContain(
      "Cambiaste habitaciones de 2 a 3. El resto del aviso quedó como estaba.",
    );
  });

  it("nombra los dos campos cuando el paso escribió dos", async () => {
    // El paso 4 escribe cuatro campos de una vez. Con uno solo nombrado, «el
    // resto del aviso quedó como estaba» sería falso sobre los otros.
    const html = await served({
      campo: ["rooms", "areaM2"],
      antes: ["2", "78"],
      ahora: ["3", "90"],
    });

    expect(html).toContain(
      "Cambiaste habitaciones de 2 a 3 y metros cuadrados de 78 a 90. " +
        "El resto del aviso quedó como estaba.",
    );
  });

  it("no dice nada cuando no se volvió desde ningún paso", async () => {
    const html = await served({});

    expect(html).toContain("Revisá tu aviso");
    expect(html).not.toContain("Cambiaste");
    expect(html).not.toContain("El resto del aviso");
  });

  it("calla cuando la URL anuncia un cambio entre dos valores iguales", async () => {
    // Escribir `?campo=rooms&antes=2&ahora=2` a mano no puede producir un
    // «cambiaste» que nunca ocurrió: un mensaje falso enseña a desconfiar del
    // mensaje, que es lo único que distingue «se guardó» de «se perdió».
    const html = await served({ campo: "rooms", antes: "2", ahora: "2" });

    expect(html).not.toContain("Cambiaste");
  });

  it("calla ante un campo que no es del borrador, en vez de decir «undefined»", async () => {
    const html = await served({ campo: "saldoBancario", antes: "0", ahora: "9000" });

    expect(html).not.toContain("Cambiaste");
    expect(html).not.toContain("undefined");
  });
});
