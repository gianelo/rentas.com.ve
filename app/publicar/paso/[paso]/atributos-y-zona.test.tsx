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
import { STEP_COPY } from "../../step-copy";

/**
 * **Los cinco atributos y el buscador de zona, en los bytes que salen de la
 * ruta** (tasks.md 18.24, quinto avance parcial).
 *
 * Son los dos últimos huecos que el tercer avance dejó nombrados: el riel y el
 * botón contextual los cerró la 18.24 el 2026-08-31, y estos dos seguían sin
 * una sola aserción sobre un archivo de 723 líneas.
 *
 * **Es caracterización, y decirlo importa.** Las dos piezas ya están servidas,
 * así que estas pruebas no pudieron verse rojas antes de existir: no hay RED
 * que fingir. Lo que les da filo son las mutaciones corridas contra cada
 * aserción —con este archivo y sin él—, anotadas en el cuerpo del PR.
 *
 * Se renderiza la RUTA y no el componente, igual que `riel-y-boton.test.tsx`:
 * la lista de zonas la arma `page.tsx` consultando el puerto, y probar el
 * componente con `zoneResults` escritas a mano mediría una pieza que nadie
 * conecta. `renderToStaticMarkup` devuelve la respuesta servida sin ejecutar
 * una línea de cliente, que es justo lo que la 18.12 exige del paso 2: **el
 * camino de servidor es el mecanismo, no un respaldo** — el vocabulario
 * completo son 89,8 KB gzip contra ~21 KB de presupuesto, así que filtrar en
 * el navegador nunca fue una opción.
 *
 * **Ninguna afirmación de acá es una regla.** Son las decisiones del dominio
 * leídas en el marcado.
 */

const { redirect, notFound, lookup } = vi.hoisted(() => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  }),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  /**
   * El puerto devuelve el vocabulario ANCHO —`ILIKE` a 60 filas— y quién de
   * esas filas se ofrece lo decide `searchPublicationZones`, que es puro y ya
   * está cubierto. Por eso el doble no filtra: devolver acá lo ya filtrado
   * escondería el reparto de trabajo que este paso realmente hace.
   */
  lookup: vi.fn(async () => ({
    cities: [{ id: "dc", name: "Distrito Capital" }],
    zones: [
      { id: "altamira", name: "Altamira", cityId: "dc", parentName: "Municipio Chacao" },
      { id: "chacao", name: "Chacao", cityId: "dc", parentName: "Municipio Chacao" },
    ],
    aliases: [],
  })),
}));

vi.mock("next/navigation", () => ({ redirect, notFound }));
vi.mock("@/shared/db/client", () => ({ db: {} }));
vi.mock("@/modules/listing-publication/infrastructure/drizzle-zone-vocabulary", () => ({
  DrizzleZoneVocabulary: class {
    lookup = lookup;
  },
}));
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

/** Los cuatro primeros pasos contestados; el 5 es el paso abierto. */
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

/** Las violaciones y el paso actual se calculan, nunca se escriben a mano. */
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
  lookup.mockClear();
});

async function servido(paso: string, q?: string): Promise<string> {
  return renderToStaticMarkup(
    await StepPage({
      params: Promise.resolve({ paso }),
      searchParams: Promise.resolve(q === undefined ? {} : { q }),
    }),
  );
}

/** Sólo el `<fieldset>` del paso 5: el paso 1 dibuja otro con la misma clase. */
function atributos(html: string): string {
  const legend = html.indexOf("Qué tiene la propiedad");
  expect(legend).toBeGreaterThan(-1);
  const desde = html.lastIndexOf("<fieldset", legend);
  return html.slice(desde, html.indexOf("</fieldset>", desde));
}

/** Sólo el riel. El mapa de móvil dibuja lo mismo desde el mismo arreglo. */
function riel(html: string): string {
  const desde = html.indexOf('<nav aria-label="Progreso">');
  expect(desde).toBeGreaterThan(-1);
  return html.slice(desde, html.indexOf("</nav>", desde));
}

/** Sólo el buscador. El formulario que guarda dibuja controles parecidos. */
function buscador(html: string): string {
  const desde = html.indexOf('method="get"');
  expect(desde).toBeGreaterThan(-1);
  return html.slice(html.lastIndexOf("<form", desde), html.indexOf("</form>", desde));
}

/** Devuelve la etiqueta del control, y falla si no está dibujado. */
function control(alcance: string, name: string): string {
  const match = new RegExp(`<input[^>]*name="${name}"[^>]*/>`).exec(alcance);
  if (!match) throw new Error(`no se dibuja el control name="${name}"`);
  return match[0];
}

describe("los cinco atributos del paso 5 (18.24)", () => {
  /**
   * Los cinco nombres y las cinco etiquetas se fijan **a mano y apareados**:
   * derivarlos de `FEATURE_LABELS` sería preguntarle a la misma constante que
   * el sujeto usa. Y se cuenta que son cinco, porque un sexto atributo —o uno
   * perdido— es un dato que el aviso deja de declarar sin que nada avise.
   */
  it("dibuja cinco casillas, cada nombre con su etiqueta", async () => {
    const campos = atributos(await servido("atributos"));

    expect(campos).toMatch(/name="hasPowerPlant"[^>]*\/><span>Planta eléctrica<\/span>/);
    expect(campos).toMatch(/name="hasRegularWater"[^>]*\/><span>Agua regular<\/span>/);
    expect(campos).toMatch(/name="isFurnished"[^>]*\/><span>Amoblado<\/span>/);
    expect(campos).toMatch(/name="hasSecurity"[^>]*\/><span>Vigilancia 24 h<\/span>/);
    expect(campos).toMatch(/name="hasAppliances"[^>]*\/><span>Línea blanca<\/span>/);

    expect(campos.match(/type="checkbox"/g)).toHaveLength(5);
  });

  /**
   * Volver al paso 5 tiene que devolver lo declarado ya marcado. Las tres sin
   * marcar se piden por `control`, que falla si la casilla no está dibujada:
   * un `not.toContain("checked")` sobre un paso que dejó de dibujar el control
   * pasaría sin que exista nada que marcar.
   */
  it("lo ya declarado vuelve marcado, y lo demás vuelve dibujado y sin marcar", async () => {
    borrador = {
      ...borradorHastaElCuatro(),
      listing: {
        ...borradorHastaElCuatro().listing,
        hasPowerPlant: true,
        hasSecurity: true,
        hasRegularWater: false,
      },
      featuresDeclared: true,
    };
    const campos = atributos(await servido("atributos"));

    expect(control(campos, "hasPowerPlant")).toContain('checked=""');
    expect(control(campos, "hasSecurity")).toContain('checked=""');

    expect(control(campos, "hasRegularWater")).not.toContain("checked");
    expect(control(campos, "isFurnished")).not.toContain("checked");
    expect(control(campos, "hasAppliances")).not.toContain("checked");
  });

  /**
   * **`false` es «no lo declaró», nunca «no lo tiene»** (14.9), y las casillas
   * no pueden decir la diferencia: un atributo guardado en `false` y uno que
   * nadie tocó dibujan el MISMO byte. Eso no es un defecto — es por qué el
   * borrador lleva `featuresDeclared` aparte. Lo que separa los dos borradores
   * se lee en el riel: «Ninguno» es una respuesta y el nombre corto es la
   * ausencia de una. Los literales se fijan por valor y el nombre corto se
   * afirma aparte, para que el negativo signifique algo.
   */
  it("una casilla no distingue «no lo declaró» de «no lo tiene»; el riel sí", async () => {
    borrador = {
      ...borradorHastaElCuatro(),
      listing: {
        ...borradorHastaElCuatro().listing,
        hasPowerPlant: false,
        hasRegularWater: false,
        isFurnished: false,
        hasSecurity: false,
        hasAppliances: false,
      },
      featuresDeclared: true,
    };
    const declarado = await servido("atributos");

    borrador = borradorHastaElCuatro();
    const sinDeclarar = await servido("atributos");

    expect(atributos(declarado)).toBe(atributos(sinDeclarar));

    expect(riel(declarado)).toContain("Ninguno");
    expect(riel(declarado)).not.toContain("Qué tiene");
    expect(riel(sinDeclarar)).toContain("Qué tiene");
    expect(riel(sinDeclarar)).not.toContain("Ninguno");

    expect(STEP_COPY.atributos.railLabel).toBe("Qué tiene");
  });

  /**
   * **La otra mitad del paso 5, y sin ella «Ninguno» es inalcanzable sin
   * JavaScript**: nada destilda cinco casillas al enviar, así que declarar que
   * no hay ninguna necesita su propio POST. Va FUERA del formulario de las
   * casillas porque un formulario dentro de otro no es HTML válido, y con el
   * script apagado un navegador lo desanida donde quiere.
   */
  it("«No tiene ninguna» es un POST propio y sólo existe en el paso 5", async () => {
    const html = await servido("atributos");
    const cierreDelFormulario = html.indexOf("</form>");
    const segundoBoton = html.indexOf("No tiene ninguna");

    expect(segundoBoton).toBeGreaterThan(cierreDelFormulario);
    expect(html.slice(cierreDelFormulario, segundoBoton)).toContain(
      '<input type="hidden" name="step" value="atributos"/>',
    );

    await expect(servido("tamano")).resolves.not.toContain("No tiene ninguna");
  });
});

describe("el buscador de zona del paso 2 (18.24)", () => {
  /**
   * **Buscar es un GET hermano, no un formulario anidado.** Se comprueba que
   * CIERRA antes de que empiece el que guarda —comparando posiciones y no la
   * clase, que es un hash del CSS—, y que no lleva `step`: buscar una zona no
   * puede guardar un paso.
   */
  it("es un GET propio que cierra antes del formulario que guarda", async () => {
    const html = await servido("zona", "alta");
    const busqueda = buscador(html);

    expect(busqueda).toContain('name="q"');
    expect(busqueda).toContain("Buscar</button>");
    expect(busqueda).not.toContain('name="step"');

    const finDelGet = html.indexOf("</form>", html.indexOf('method="get"'));
    expect(finDelGet).toBeLessThan(html.indexOf('name="step" value="zona"'));
  });

  /**
   * Lo escrito vuelve en el campo. Sin esto, corregir una búsqueda es
   * teclearla de nuevo — y el atributo tiene que estar AUSENTE cuando no se
   * buscó nada, no traer un valor que nadie escribió.
   */
  it("devuelve lo escrito en el campo, y nada cuando no se buscó", async () => {
    expect(control(buscador(await servido("zona", "alta")), "q")).toContain('value="alta"');
    expect(control(buscador(await servido("zona")), "q")).toContain('value=""');
  });

  /**
   * **La 18.12 medida, no supuesta.** Con el script apagado la lista ya viene
   * en la respuesta, con el alcance que desambigua dos nombres iguales, y
   * dentro del formulario que guarda: elegir y guardar son un solo envío. Su
   * par es la otra mitad —sin nada escrito no se consulta el vocabulario ni
   * se dibuja lista—, porque volcar el catálogo entero es exactamente lo que
   * el puerto acotado existe para no hacer. Lo que sí queda sin buscar es la
   * zona ya elegida, que es la aserción de abajo.
   */
  it("sirve la lista sin una línea de cliente, y sin búsqueda no consulta nada", async () => {
    const html = await servido("zona", "alta");
    const formulario = html.slice(html.indexOf('name="step" value="zona"'));

    expect(formulario).toMatch(/<input[^>]*type="radio"[^>]*name="zoneId"[^>]*value="altamira"/);
    expect(formulario).toContain("Municipio Chacao · Distrito Capital");
    expect(lookup).toHaveBeenCalledWith("alta");

    const vacio = await servido("zona");
    expect(vacio).not.toContain("Municipio Chacao · Distrito Capital");
    expect(vacio).toContain("¿No está la tuya?");
    expect(lookup).toHaveBeenCalledTimes(1);
  });

  /**
   * **Volver al paso 2 y buscar otra cosa no puede borrar la zona guardada.**
   * Es la única razón por la que existe el control extra, y sólo se ve cuando
   * la búsqueda NO la devuelve. Su par es que no se duplique: con la zona
   * guardada dentro de los resultados hay un solo control para ella, y dos
   * radios con el mismo `value` dibujan dos veces la misma zona.
   */
  it("la zona ya elegida se sigue enviando aunque la búsqueda no la muestre", async () => {
    const otra = await servido("zona", "chacao");
    const controles = otra.match(/name="zoneId"/g);

    expect(controles).toHaveLength(2);
    expect(otra).toMatch(/name="zoneId" checked="" value="altamira"/);
    expect(otra).toMatch(/name="zoneId" value="chacao"/);
    expect(otra).toContain("<span>Altamira</span>");

    const misma = await servido("zona", "alta");
    expect(misma.match(/name="zoneId"/g)).toHaveLength(1);
    expect(misma).toMatch(/name="zoneId" checked="" value="altamira"/);
  });
});
