import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **La pantalla de reportar** (tasks.md 8.7, F31 — «formulario de reporte»).
 *
 * Lo que este archivo existe para probar es lo que ningún test de `reportListing`
 * puede: que **abrir la pantalla no reporta nada**. Un `GET` lo dispara el
 * antivirus del proveedor, el previsualizador de WhatsApp y el prefetch del
 * navegador; un reporte que se ejecutara al abrir gastaría uno de los tres
 * asientos que hacen falta para ocultar un aviso, y lo gastaría sin que nadie
 * hubiera tocado nada. Es la misma lección que `renewal-link.spec.ts` dejó
 * escrita para el enlace de renovar.
 *
 * Se renderiza de verdad en vez de leer el texto del archivo: una afirmación
 * sobre el contenido de un archivo sigue en verde mientras lo que se dibuja
 * está mal.
 */
const { notFound, reportarAviso, getSession } = vi.hoisted(() => {
  class NotFoundSignal extends Error {}
  return {
    NotFoundSignal,
    notFound: vi.fn((): never => {
      throw new NotFoundSignal("NEXT_NOT_FOUND");
    }),
    reportarAviso: vi.fn(async () => {}),
    getSession: vi.fn(async () => null),
  };
});

vi.mock("next/navigation", () => ({ notFound }));
// El cliente de Neon se construye al importar y esta prueba no habla con la base.
vi.mock("@/shared/db/client", () => ({ db: {} }));
vi.mock("./actions", () => ({ reportarAviso }));
// Arrastra Auth.js entero y no participa de lo que se prueba. La barra sí se
// dibuja, con la sesión que este doble entregue.
/**
 * tasks.md 14.56 — la barra pregunta si esta cuenta publicó algo. Doblado acá
 * porque esta prueba mide otra cosa; que la consulta sea correcta lo afirma
 * `tests/integration/publisher-has-listings.test.ts` contra Postgres real.
 */
vi.mock("@/modules/listing-publication/infrastructure/drizzle-publisher-has-listings", () => ({
  DrizzlePublisherHasListings: class {
    hasAnyListing = async () => false;
  },
}));
vi.mock("@/modules/identity/infrastructure/session-port", () => ({
  nextAuthSessionPort: { getSession },
}));

import { REPORT_SENT_PARAM } from "@/modules/listing-trust/domain/report-screen";
import ReportarPage from "./page";

const CIUDAD = "caracas";
const ZONA = "chacao";
const ID = "3f7b1c2a-1234-5678-9abc-def012345678";
const SLUG = `apartamento-2-habitaciones-en-chacao-${ID}`;
const FICHA = `/alquiler/${CIUDAD}/${ZONA}/${SLUG}`;

function open(
  query: Record<string, string | string[] | undefined> = {},
  slug: string = SLUG,
): Promise<ReactElement> {
  return ReportarPage({
    params: Promise.resolve({ ciudad: CIUDAD, zona: ZONA, slug }),
    searchParams: Promise.resolve(query),
  }) as Promise<ReactElement>;
}

/** El `<form>` que la página devuelve, si devuelve alguno. */
function findForm(node: ReactNode): ReactElement<Record<string, unknown>> | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findForm(child);
      if (found) return found;
    }
    return null;
  }
  if (!isValidElement(node)) return null;
  const element = node as ReactElement<{ children?: ReactNode }>;
  if (element.type === "form") return element as ReactElement<Record<string, unknown>>;
  if (typeof element.type === "function") {
    const rendered = (element.type as (props: unknown) => ReactNode)(element.props);
    return findForm(rendered);
  }
  return findForm(element.props.children ?? null);
}

beforeEach(() => {
  reportarAviso.mockClear();
  notFound.mockClear();
  getSession.mockResolvedValue(null);
});

describe("abrir la pantalla no reporta nada", () => {
  /**
   * **Las dos mitades de la misma garantía, y hacen falta las dos.** «No se
   * llamó» sola pasaría igual si la página no dibujara ningún formulario —el
   * defecto que esta tarea vino a arreglar—; «está cableada» sola no diría
   * nada sobre el `GET`. Juntas dicen lo único que importa: la acción está
   * puesta y no se ejecutó.
   */
  it("entrega la acción al formulario sin ejecutarla", async () => {
    const form = findForm(await open());

    expect(form?.props.action).toBe(reportarAviso);
    expect(reportarAviso).not.toHaveBeenCalled();
  });

  it("sigue sin ejecutarla al dibujar el acuse", async () => {
    await open({ [REPORT_SENT_PARAM]: "" });

    expect(reportarAviso).not.toHaveBeenCalled();
  });
});

describe("el formulario", () => {
  it("lleva el aviso y la vuelta que la acción necesita", async () => {
    const markup = renderToStaticMarkup(await open());

    // El id sale del slug: la acción lo recibe ya extraído y no vuelve a
    // parsear la URL.
    expect(markup).toContain(`name="listingId" value="${ID}"`);
    expect(markup).toContain(`name="listingPath" value="${FICHA}"`);
    expect(markup).toContain("Enviar el reporte");
  });

  /**
   * **RESUELTO acá, y se explica el porqué.** La lámina dibuja «Reportar este
   * aviso» al pie de una ficha que es anónima, y la spec de listing-trust
   * describe al visitante sin sesión *intentando* reportar: «the system blocks
   * the action and requires sign-in first». No se puede intentar lo que no se
   * ve. Esconder el control haría que nadie descubriera que reportar existe —
   * y reportar es la única señal antifraude que un inquilino puede dar.
   */
  it("se le muestra igual a quien no tiene sesión: el muro está en la acción", async () => {
    getSession.mockResolvedValue(null);

    const markup = renderToStaticMarkup(await open());

    expect(markup).toContain("Enviar el reporte");
  });
});

/**
 * tasks.md 14.54 — **la vuelta se dibuja adentro, no en la barra.**
 *
 * Ésta y la ficha eran las dos únicas pantallas que le pasaban `back` al `Nav`,
 * y con las dos adentro el encabezado queda con una sola forma. La razón no es
 * de simetría: `/importar` y `/mis-avisos/[id]/editar` ya dibujan su «← Mis
 * avisos» arriba del contenido, así que ésta es la forma que el producto ya
 * tiene y la barra era la excepción.
 */
describe("la vuelta al aviso vive dentro del contenido (14.54)", () => {
  it("se dibuja después del encabezado y dentro del <main>", async () => {
    const markup = renderToStaticMarkup(await open());

    const header = markup.indexOf("</header>");
    const main = markup.indexOf("<main");
    const vuelta = markup.indexOf("← Volver al aviso");

    expect(header).toBeGreaterThanOrEqual(0);
    expect(vuelta).toBeGreaterThan(main);
    expect(main).toBeGreaterThan(header);
  });

  it("el encabezado no lleva ninguna vuelta", async () => {
    const markup = renderToStaticMarkup(await open());

    expect(markup.slice(0, markup.indexOf("</header>"))).not.toContain("Volver al aviso");
  });
});

describe("el acuse", () => {
  it("no vuelve a ofrecer el formulario", async () => {
    const acuse = await open({ [REPORT_SENT_PARAM]: "" });

    expect(findForm(acuse)).toBeNull();
    expect(renderToStaticMarkup(acuse)).toContain("Recibimos tu reporte");
  });

  /** La única salida del acuse: volver al aviso. */
  it("deja una vuelta al aviso", async () => {
    const markup = renderToStaticMarkup(await open({ [REPORT_SENT_PARAM]: "" }));

    expect(markup).toContain(`href="${FICHA}"`);
  });
});

describe("un slug que no nombra ningún aviso", () => {
  /**
   * La misma guarda que la ficha pone primero: el valor termina en un
   * `WHERE id = $1`, así que un segmento que apenas parece plausible se rechaza
   * antes de llegar a la base — y antes de dibujar un formulario que reportaría
   * un aviso que no existe.
   */
  it("no dibuja el formulario", async () => {
    await expect(open({}, "sin-id-adentro")).rejects.toThrow();

    expect(notFound).toHaveBeenCalled();
  });
});
