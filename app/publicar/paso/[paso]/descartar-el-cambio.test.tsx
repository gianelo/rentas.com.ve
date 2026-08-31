import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { StoredDraft } from "../../draft";

/**
 * **«Descartar el cambio»** (tasks.md 18.18, lámina `Rentas - Publicar -
 * Desktop.dc.html`, marco *«volviendo al paso 4 desde revisar»*), en los bytes
 * que salen de la ruta.
 *
 * Hoy el paso abierto desde revisar sólo ofrece guardar: quien tocó un campo y
 * se arrepintió no tiene salida que no escriba. Con el borrador en cookie no es
 * un `undo` —los valores anteriores viven en la cookie hasta que se guarda—,
 * así que es **un enlace a `/publicar/revisar` sin postear**.
 *
 * Se renderiza la RUTA y no el componente porque este cambio ya pagó seis veces
 * el mismo defecto: una pieza probada que ninguna página conectaba nunca.
 * `renderToStaticMarkup` devuelve la respuesta servida sin ejecutar una línea
 * de cliente, que es además lo que recibe quien tiene el script apagado.
 *
 * **Ninguna afirmación de acá es una regla.** Si el paso ofrece la salida lo
 * decide `offersDiscardToReview`, en el dominio y bajo el piso del 90 %.
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
// La acción de guardar arrastra `next/headers`, R2 y la base entera, y el
// subidor de fotos es de cliente. Acá se miran los bytes que salen del
// servidor, no lo que pasa al recibirlos.
vi.mock("../../actions", () => ({ submitStep: vi.fn() }));
vi.mock("../../fotos/PhotoUploader", () => ({ PhotoUploader: () => null }));
vi.mock("../../publication-context", () => ({
  readPublicationContext: async () => ({
    draft: DRAFT,
    violations: [],
    currentStep: "quien",
    zoneName: "Altamira",
  }),
}));

import StepPage from "./page";

/** Los nueve pasos contestados: con un hueco, revisar redirige y el enlace mentiría. */
const DRAFT: StoredDraft = {
  listing: {
    propertyType: "apartamento",
    cityId: "dc",
    zoneId: "altamira",
    priceUsd: 450,
    rooms: 3,
    bathrooms: 2,
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

/** El paso 4, que es el que la lámina dibuja, con y sin la vuelta desde revisar. */
async function servido(searchParams: { volver?: string }): Promise<string> {
  return renderToStaticMarkup(
    await StepPage({
      params: Promise.resolve({ paso: "tamano" }),
      searchParams: Promise.resolve(searchParams),
    }),
  );
}

describe("«Descartar el cambio» sale servido al volver desde revisar (18.18)", () => {
  /**
   * El enlace con su dirección de verdad, no un botón: no postea nada, y por
   * eso descartar cuesta lo que cuesta irse.
   */
  it("dibuja la salida hacia revisar con su dirección, sin ningún formulario detrás", async () => {
    const html = await servido({ volver: "revisar" });

    expect(html).toContain("Descartar el cambio");
    expect(html).toMatch(/<a[^>]+href="\/publicar\/revisar"[^>]*>Descartar el cambio<\/a>/);
  });

  /**
   * **La otra mitad, y sola ninguna de las dos afirma la pregunta.** En el
   * recorrido hacia adelante no hay revisión a la que volver: el mismo paso,
   * el mismo borrador, y lo único que cambia es de dónde se entró.
   */
  it("no la dibuja en el recorrido hacia adelante, que no viene de ninguna revisión", async () => {
    const html = await servido({});

    expect(html).not.toContain("Descartar el cambio");
  });
});
