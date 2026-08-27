import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **«Importar vive acá, no en la navegación global»** — la anotación de la
 * lámina 14d, al pie del artboard de la inmobiliaria.
 *
 * Esa frase es la que hace que ésta, y no el menú de cuenta, sea la puerta de
 * verdad: el menú de 14b es un panel que sólo existe con JavaScript, y su
 * propia lámina aclara que "nada vive solo en el menú: todo está también en
 * /mis-avisos". Un enlace que sólo existiera en el menú dejaría afuera a
 * quien no recibió el paquete.
 *
 * **Se renderiza, no se lee el archivo.** Las pruebas de contrato vecinas
 * (`nav-contract.test.ts`) miran el texto fuente porque lo que puede fallar
 * ahí es una relación entre dos archivos. Acá lo que puede fallar es que el
 * enlace no salga, y un `toContain("canImportListings")` sobre el fuente
 * quedaría verde con el enlace dentro de una rama muerta.
 */

const { findAccount, requireSession, listPublisherListings } = vi.hoisted(() => ({
  findAccount: vi.fn(),
  requireSession: vi.fn(),
  listPublisherListings: vi.fn(),
}));

vi.mock("../../src/shared/db/client", () => ({ db: {} }));
vi.mock("../_lib/require-session", () => ({ requireSession }));
vi.mock("../../src/modules/identity/infrastructure/session-port", () => ({
  nextAuthSessionPort: { getSession: async () => null },
}));
vi.mock("../../src/modules/broker-bulk-import/infrastructure/drizzle-bulk-import-account", () => ({
  DrizzleBulkImportAccounts: class {
    findAccount = findAccount;
  },
}));
// La lista de avisos (tasks.md 9.28) llegó después de esta prueba y no
// participa de lo que afirma: acá se prueba la puerta de importar.
vi.mock("../../src/modules/listing-publication/infrastructure/drizzle-publisher-listings", () => ({
  DrizzlePublisherListings: class {},
}));
vi.mock("../../src/modules/listing-publication/application/list-publisher-listings", () => ({
  listPublisherListings,
}));
vi.mock("./actions", () => ({
  activarBorrador: vi.fn(),
  pedirDestinoDeFoto: vi.fn(),
  adjuntarFotoAlBorrador: vi.fn(),
}));

import { buildPublisherListingBoard } from "../../src/modules/listing-publication/domain/publisher-listing-board";
import MisAvisosPage from "./page";

beforeEach(() => {
  findAccount.mockReset();
  requireSession.mockReset();
  listPublisherListings.mockReset();
  listPublisherListings.mockResolvedValue(buildPublisherListingBoard([], new Date()));
  requireSession.mockResolvedValue({
    userId: "broker-1",
    name: "Inmobiliaria Caracas",
    email: "contacto@inmocaracas.com",
  });
});

async function draw(): Promise<string> {
  return renderToStaticMarkup(await MisAvisosPage({ searchParams: Promise.resolve({}) }));
}

describe("/mis-avisos — la puerta de importar (14d)", () => {
  it("una cuenta habilitada ve «Importar cartera» como enlace real a /importar", async () => {
    findAccount.mockResolvedValueOnce({ userId: "broker-1", bulkImportEnabled: true });

    const html = await draw();

    expect(html).toMatch(/<a[^>]*href="\/importar"[^>]*>Importar cartera<\/a>/);
  });

  /**
   * 14c, al pie: **«sin importar: esta cuenta no está habilitada»**. El
   * artboard del propietario particular no dibuja el botón, y no lo dibuja
   * porque no lo tiene — no porque esté escondido con CSS.
   */
  it("una cuenta sin la bandera NO ve el enlace por ninguna parte", async () => {
    findAccount.mockResolvedValueOnce({ userId: "duena-1", bulkImportEnabled: false });

    const html = await draw();

    expect(html).not.toContain('href="/importar"');
    expect(html).not.toContain("Importar cartera");
  });

  it("una cuenta que el adaptador no encuentra tampoco lo ve — falla cerrado", async () => {
    findAccount.mockResolvedValueOnce(null);

    const html = await draw();

    expect(html).not.toContain('href="/importar"');
  });
});
