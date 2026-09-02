import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  currentStepId,
  draftListingOf,
} from "@/modules/listing-publication/domain/publication-steps";
import {
  type CuratedZone,
  validatePublishableListing,
} from "@/modules/listing-publication/domain/publishable-listing";
import type { StoredDraft } from "../../draft";
import { PRIMARY_ACTION_LABEL, STEP_COPY } from "../../step-copy";

/**
 * **El riel de escritorio y el botón principal, en los bytes que salen de la
 * ruta** (tasks.md 18.24, cuarto avance parcial).
 *
 * De dónde sale esta prueba: al mudar `field` al dominio se corrió la mutación
 * obligatoria —apuntar TODAS las violaciones de publicar al campo `title`— y no
 * puso roja ninguna prueba de `app/publicar`. `PublishStep.tsx` dibuja 638
 * líneas sin un archivo de pruebas. La 18.25, la 18.17 y la 18.7 cerraron tres
 * de los nueve pasos y el contador de la barra; el riel y el botón contextual
 * eran dos de los cuatro huecos que quedaban.
 *
 * **Es caracterización, y decirlo importa.** Las dos piezas ya están servidas,
 * así que estas pruebas no pudieron verse rojas antes de existir: no hay RED
 * que fingir. Lo que les da filo son las mutaciones que se corrieron contra
 * cada aserción, anotadas en el cuerpo del PR.
 *
 * Se renderiza la RUTA y no el componente, igual que `mapa-de-pasos.test.tsx`:
 * quién es enlace y qué dice el botón NO lo decide esta pantalla —lo deciden
 * `isStepNavigable` y `primaryActionFor`, en el dominio y bajo el piso del
 * 90 %—, así que probar el componente con props escritas a mano mediría una
 * pieza que nadie conecta. `renderToStaticMarkup` devuelve la respuesta servida
 * sin ejecutar una línea de cliente.
 *
 * **Ninguna afirmación de acá es una regla.** Son las decisiones del dominio
 * leídas en el marcado.
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

/** Los ocho primeros contestados y el noveno no: el paso abierto es el 9. */
function borradorHastaElOcho(): StoredDraft {
  return {
    ...borradorHastaElCuatro(),
    listing: {
      ...borradorHastaElCuatro().listing,
      title: "Apartamento en Altamira con vista abierta",
      description: "Piso alto, luminoso, con vista abierta al Ávila. ".repeat(4),
    },
    photos: [{ key: "publicador-1/sala.jpg", name: "sala.jpg", bytes: 180_000 }],
    featuresDeclared: true,
  };
}

/**
 * **Las violaciones y el paso actual se calculan, no se escriben a mano.** Una
 * lista inventada acá diría que un paso está hecho cuando el validador dice que
 * no, y entonces esta prueba mediría un producto que nadie sirve. `currentStep`
 * sale de `currentStepId` porque es lo que `readPublicationContext` hace.
 */
function contextoDe(draft: StoredDraft) {
  const violations = validatePublishableListing(draftListingOf(draft), ZONES);
  return {
    draft,
    violations,
    currentStep: currentStepId(draft, violations),
    zoneName: "Altamira",
  };
}

let borrador: StoredDraft = borradorHastaElCuatro();

beforeEach(() => {
  borrador = borradorHastaElCuatro();
});

async function servido(paso: string, volver?: string): Promise<string> {
  return renderToStaticMarkup(
    await StepPage({
      params: Promise.resolve({ paso }),
      searchParams: Promise.resolve(volver ? { volver } : {}),
    }),
  );
}

/**
 * Sólo el riel. El mapa de móvil dibuja las MISMAS direcciones desde el mismo
 * arreglo de entradas, así que buscar un `href` en el documento entero daría
 * verde con el riel roto.
 */
function riel(html: string): string {
  const desde = html.indexOf('<nav aria-label="Progreso">');
  expect(desde).toBeGreaterThan(-1);
  return html.slice(desde, html.indexOf("</nav>", desde));
}

function enlaceA(paso: string): RegExp {
  return new RegExp(`<a[^>]+href="/publicar/paso/${paso}"`);
}

describe("el riel de nueve pasos (18.24)", () => {
  it("hace enlace de cada paso ya contestado", async () => {
    const filas = riel(await servido("tamano"));

    expect(filas).toMatch(enlaceA("tipo"));
    expect(filas).toMatch(enlaceA("zona"));
    expect(filas).toMatch(enlaceA("precio"));
  });

  /**
   * **La otra mitad, y sola ninguna de las dos afirma la pregunta.** Sin esto,
   * un riel que enlaza los nueve pasa la de arriba. Y no alcanza con que el
   * `href` falte: se afirma también que la fila SIGUE DIBUJADA, porque un riel
   * que directamente esconde lo que falta pasaría un `not.toMatch` sin ser un
   * mapa de nueve pasos.
   */
  it("no hace enlace de un paso de adelante, y su fila se dibuja igual", async () => {
    const filas = riel(await servido("tamano"));

    expect(filas).not.toMatch(enlaceA("titulo"));
    expect(filas).not.toMatch(enlaceA("quien"));
    expect(filas).toContain("Título");
    expect(filas).toContain("Quién publica");
  });

  /**
   * **El riel pregunta la MISMA puerta que aplica el destino.**
   *
   * `isStepNavigable` y `isStepComplete` sólo discrepan en un paso: el actual,
   * que está sin contestar y aun así se puede abrir. Por eso el paso 5 es el
   * caso que distingue reusar la puerta de escribir una copia razonable —una
   * copia que preguntara «¿está hecho?» dejaría sin enlace el único paso al que
   * la persona acaba de llegar. Un enlace que el destino rechaza aterriza donde
   * no dijo (criterio de aceptación 10), y un enlace que falta cuando el
   * destino abre es un camino que la pantalla se inventó cerrado.
   */
  it("cada fila enlazada abre y cada fila sin enlace redirige", async () => {
    const filas = riel(await servido("tamano"));

    expect(filas).toMatch(enlaceA("atributos"));
    await expect(servido("atributos")).resolves.toContain("¿Qué tiene?");

    expect(filas).not.toMatch(enlaceA("quien"));
    await expect(servido("quien")).rejects.toThrow("NEXT_REDIRECT:/publicar/paso/atributos");
  });

  /**
   * **Una fila dibuja el VALOR del paso, no su nombre.** «Altamira» dice a
   * dónde se vuelve; «Zona» ya está dicho por el número. Los literales se
   * fijan a mano y el nombre corto se afirma aparte: derivar lo esperado de
   * `STEP_COPY` sería preguntarle a la misma constante que el sujeto usa.
   */
  it("una fila contestada dibuja su valor y no su nombre corto", async () => {
    const filas = riel(await servido("tamano"));

    expect(filas).toContain("Altamira");
    expect(filas).toContain("$450 al mes");
    expect(filas).not.toContain("Zona");
    expect(filas).not.toContain("Precio");

    expect(STEP_COPY.zona.railLabel).toBe("Zona");
    expect(STEP_COPY.precio.railLabel).toBe("Precio");
  });
});

describe("el botón principal cambia de contexto (18.24)", () => {
  const boton = (texto: string) => new RegExp(`<button type="submit"[^>]*>${texto}</button>`);

  it("en el recorrido hacia adelante dice «Seguir»", async () => {
    const html = await servido("tamano");

    expect(html).toMatch(boton("Seguir"));
    expect(html).not.toContain("Guardar y volver a revisar");
  });

  /**
   * El par: el mismo paso y el mismo borrador, y lo único que cambia es venir
   * de revisar. Sin esta mitad, «Seguir» solo lo cumple un botón que nunca
   * cambia (criterio de aceptación 11, regla 3 de la sección 4).
   */
  it("el mismo paso, viniendo de revisar, dice «Guardar y volver a revisar»", async () => {
    const html = await servido("tamano", "revisar");

    expect(html).toMatch(boton("Guardar y volver a revisar"));
    expect(html).not.toMatch(boton("Seguir"));
  });

  /**
   * **Lo que decide entre las dos frases.** El paso 9 no es «Seguir»: no hay
   * paso siguiente que prometer. Y venir de revisar gana sobre ser el último,
   * que es la mitad que separa «el botón mira el paso» de «el botón mira de
   * dónde vino».
   */
  it("el último paso ofrece revisar, salvo que se venga de revisar", async () => {
    borrador = borradorHastaElOcho();

    const recorrido = await servido("quien");
    expect(recorrido).toMatch(boton("Revisar el aviso"));
    expect(recorrido).not.toMatch(boton("Seguir"));

    const desdeRevisar = await servido("quien", "revisar");
    expect(desdeRevisar).toMatch(boton("Guardar y volver a revisar"));
    expect(desdeRevisar).not.toMatch(boton("Revisar el aviso"));

    expect(PRIMARY_ACTION_LABEL.review).toBe("Revisar el aviso");
  });
});
