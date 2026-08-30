import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PublisherListingBoard } from "../../src/modules/listing-publication/domain/publisher-listing-board";
import { buildPublisherListingBoard } from "../../src/modules/listing-publication/domain/publisher-listing-board";

/**
 * tasks.md 9.28 — «Mis avisos» de la inmobiliaria (lámina 14d), que hasta
 * ahora era una carcasa: su propio archivo decía «la lista real de avisos
 * necesita una consulta que todavía no existe».
 *
 * **Se renderiza el servidor, no se lee el fuente.** Son los bytes exactos
 * que salen de la ruta, que es lo único que prueba que un enlace o un
 * formulario existen de verdad y no dentro de una rama muerta — la misma
 * disciplina que `puerta-de-importar.test.tsx` ya documenta.
 *
 * **Ninguna de estas pruebas afirma una regla.** Qué estado tiene cada aviso,
 * cuáles van arriba y cuántos hay de cada clase lo prueba
 * `publisher-listing-board.test.ts`, en el dominio y bajo el piso de 90%. Acá
 * se prueba que la pantalla dibuja la respuesta que el dominio ya dio, y que
 * lo que el corredor puede tocar existe: subir una foto y activar.
 */

const { findAccount, requireSession, listPublisherListings } = vi.hoisted(() => ({
  findAccount: vi.fn(),
  requireSession: vi.fn(),
  listPublisherListings: vi.fn(),
}));

vi.mock("../../src/shared/db/client", () => ({ db: {} }));
// Arrastra Auth.js entero y no participa de lo que se prueba — el mismo doble
// que `app/api/bulk-import/route.test.ts` ya usa por la misma razón.
vi.mock("../../src/modules/identity/infrastructure/session-port", () => ({
  nextAuthSessionPort: { getSession: async () => null },
}));
vi.mock("../_lib/require-session", () => ({ requireSession }));
vi.mock("../../src/modules/broker-bulk-import/infrastructure/drizzle-bulk-import-account", () => ({
  DrizzleBulkImportAccounts: class {
    findAccount = findAccount;
  },
}));
vi.mock("../../src/modules/listing-publication/infrastructure/drizzle-publisher-listings", () => ({
  DrizzlePublisherListings: class {},
}));
vi.mock("../../src/modules/listing-publication/application/list-publisher-listings", () => ({
  listPublisherListings,
}));
// Las acciones de servidor arrastran `next/headers` y el adaptador de R2; lo
// que se prueba acá es que el formulario y el botón salen del servidor, no lo
// que hacen al recibirlos (eso vive en `actions.test.ts`).
vi.mock("./actions", () => ({
  activarBorrador: vi.fn(),
  pedirDestinoDeFoto: vi.fn(),
  adjuntarFotoAlBorrador: vi.fn(),
}));

import MisAvisosPage from "./page";

const NOW = new Date("2026-08-27T12:00:00Z");

function listing(overrides: Record<string, unknown> = {}) {
  return {
    id: "borrador-1",
    title: "Apartamento amoblado en La Castellana",
    priceUsd: 610,
    zoneName: "La Castellana",
    rooms: 3,
    areaM2: 128,
    publisherType: "broker" as const,
    externalReference: "LC-0912",
    status: "draft" as const,
    photoCount: 0,
    expiresAt: new Date("2026-09-18T12:00:00Z"),
    ...overrides,
  };
}

function boardOf(rows: ReturnType<typeof listing>[]): PublisherListingBoard {
  return buildPublisherListingBoard(rows, NOW);
}

beforeEach(() => {
  findAccount.mockReset();
  requireSession.mockReset();
  listPublisherListings.mockReset();
  requireSession.mockResolvedValue({
    userId: "broker-1",
    name: "Inmobiliaria Caracas",
    email: "contacto@inmocaracas.com",
  });
  findAccount.mockResolvedValue({ userId: "broker-1", bulkImportEnabled: true });
  listPublisherListings.mockResolvedValue(boardOf([listing()]));
});

async function draw(estado?: string): Promise<string> {
  return renderToStaticMarkup(
    await MisAvisosPage({ searchParams: Promise.resolve(estado ? { estado } : {}) }),
  );
}

describe("/mis-avisos — la lista de avisos (14d)", () => {
  it("dibuja la ficha del borrador con su precio, su título, su zona y su referencia", async () => {
    const html = await draw();

    expect(html).toContain("Apartamento amoblado en La Castellana");
    expect(html).toContain("La Castellana");
    expect(html).toContain("LC-0912");
    expect(html).toContain("610");
  });

  /**
   * «88 en total · 38 no se ven todavía» — el encabezado de 14d. Los números
   * salen del dominio; lo que esta prueba fija es que la pantalla los dice en
   * vez de callarlos, que es lo que hacía la carcasa anterior.
   */
  it("dice cuántos avisos hay y cuántos no se ven todavía", async () => {
    listPublisherListings.mockResolvedValue(
      boardOf([
        listing({ id: "b1" }),
        listing({ id: "b2" }),
        listing({ id: "a1", status: "active", photoCount: 3 }),
      ]),
    );

    const html = await draw();

    expect(html).toContain("3 en total");
    expect(html).toContain("2 no se ven todavía");
  });

  it("un borrador sin fotos lo dice, y ofrece subirlas", async () => {
    const html = await draw();

    expect(html).toContain("Borrador · faltan fotos");
    expect(html).toContain("Subir fotos");
  });

  /**
   * **El disparador que no existía.** `activateListing` llevaba una porción
   * entera construido y probado sin que ninguna ruta lo llamara. Es un
   * `<form>` de verdad y no un botón de JavaScript: `/mis-avisos` está exento
   * del piso de la ruta de lectura por la COMPRESIÓN de fotos (AGENTS.md §2),
   * no por activar un aviso.
   */
  it("cada borrador trae un formulario real para activarlo, con su id adentro", async () => {
    const html = await draw();

    // Un `<form>` con un `submit` adentro, no un `<button onClick>`: es lo que
    // hace que activar funcione con el script apagado. Lo que NO se puede
    // afirmar acá es el `method="post"` que Next le pone a una acción de
    // servidor — la acción está doblada, así que React dibuja su marcador de
    // «formulario sin acción real». Que el `action` sea la acción de servidor
    // y no un manejador de cliente lo prueba la aserción de fuente de abajo.
    expect(html).toMatch(
      /<form[^>]*>.*?<input type="hidden" name="listingId" value="borrador-1"\/>.*?<button type="submit"[^>]*>Activar<\/button>.*?<\/form>/s,
    );
  });

  /**
   * tasks.md 18.20 — **el enlace que no existía.** `editListing` shipeó sin un
   * solo llamador porque, entre otras cosas, ninguna fila ofrecía editar.
   *
   * **Qué fila lo ofrece lo decide el dominio** (`card.editable`), no un `if`
   * de esta pantalla: el puerto lee y escribe con `status = 'active'` en el
   * `WHERE`, así que ofrecerlo sobre un borrador o un vencido sería dibujar
   * una puerta que la escritura cierra.
   */
  it("un aviso activo trae el enlace a editar; un borrador no", async () => {
    listPublisherListings.mockResolvedValue(
      boardOf([
        listing({ id: "activa", status: "active", photoCount: 3 }),
        listing({ id: "borrador", status: "draft", photoCount: 0 }),
      ]),
    );

    const html = await draw();

    expect(html).toContain('href="/mis-avisos/activa/editar"');
    expect(html).not.toContain('href="/mis-avisos/borrador/editar"');
  });

  /**
   * La segunda mitad, y hace falta por separado: una afirmación que aceptara
   * las dos respuestas no estaría preguntando nada. Un vencido vuelve por
   * renovar y un oculto no vuelve por editar — es el mismo agujero que el
   * `WHERE status = 'active'` de `markExpired` cierra.
   */
  it("un aviso vencido y uno oculto no traen enlace a editar", async () => {
    listPublisherListings.mockResolvedValue(
      boardOf([
        listing({ id: "vencida", status: "expired", photoCount: 1 }),
        listing({ id: "oculta", status: "hidden", photoCount: 4 }),
      ]),
    );

    const html = await draw();

    expect(html).not.toContain("/editar");
  });

  /**
   * La contraparte de la de arriba, y la única forma de fijar a QUÉ se envía
   * ese formulario sin un empaquetador de por medio: la relación entre dos
   * archivos, que es exactamente el caso en el que `nav-contract.test.ts` ya
   * lee el fuente en vez de renderizar.
   */
  it("el formulario de activar envía a la acción de servidor, nunca a un manejador de cliente", () => {
    const fuente = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

    expect(fuente).toContain("<form action={activarBorrador}");
    expect(fuente).not.toContain("onClick");
  });

  /**
   * `activateListing` re-valida en etapa `"activation"` y puede negarse. La
   * pantalla no vuelve a decidir: dibuja la respuesta que ese caso de uso
   * dio, traída en la dirección porque sin JavaScript no hay otro lugar
   * donde una acción de servidor pueda dejarla.
   */
  it("cuando la activación se negó, dice por qué junto al aviso que la pidió", async () => {
    const html = renderToStaticMarkup(
      await MisAvisosPage({
        searchParams: Promise.resolve({ fallo: "borrador-1", motivos: "photos.required" }),
      }),
    );

    expect(html).toContain("Falta al menos una foto");
  });

  it("no dibuja la negativa de un aviso que no la pidió", async () => {
    const html = renderToStaticMarkup(
      await MisAvisosPage({
        searchParams: Promise.resolve({ fallo: "otro-aviso", motivos: "photos.required" }),
      }),
    );

    expect(html).not.toContain("Falta al menos una foto");
  });

  it("las fichas son enlaces reales con su cuenta, y funcionan sin JavaScript", async () => {
    listPublisherListings.mockResolvedValue(
      boardOf([listing({ id: "b1" }), listing({ id: "a1", status: "active", photoCount: 3 })]),
    );

    const html = await draw();

    expect(html).toMatch(/<a[^>]*href="\/mis-avisos\?estado=borradores"[^>]*>/);
    expect(html).toContain("Borradores");
    expect(html).toMatch(/<a[^>]*href="\/mis-avisos"[^>]*>/);
  });

  it("le pasa al dominio el estado que trae la dirección", async () => {
    await draw("borradores");

    expect(listPublisherListings).toHaveBeenCalledWith({ filter: "borradores" }, expect.anything());
  });

  /**
   * Una cuenta recién creada no tiene un solo aviso. La pantalla no puede
   * quedarse muda ni inventar un número: dice que no hay nada todavía.
   */
  it("una cuenta sin avisos lo dice, en vez de dibujar una lista vacía sin explicación", async () => {
    listPublisherListings.mockResolvedValue(boardOf([]));

    const html = await draw();

    expect(html).toContain("Todavía no publicaste ningún aviso");
    expect(html).not.toContain("Subir fotos");
  });

  /** La puerta de la 9.26 sigue en pie: lo que esta porción agrega no la mueve. */
  it("sigue mostrando «Importar cartera» para una cuenta habilitada", async () => {
    const html = await draw();

    expect(html).toMatch(/<a[^>]*href="\/importar"[^>]*>Importar cartera<\/a>/);
  });
});
