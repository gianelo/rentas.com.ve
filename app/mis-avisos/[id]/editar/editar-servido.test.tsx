import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PUBLISHER_TYPE_IMMUTABLE_NOTICE } from "../../../publicar/violation-copy";

/**
 * tasks.md 18.20 — **la pantalla que le faltaba a `editListing`**, en los
 * bytes que salen de la ruta.
 *
 * `renderToStaticMarkup(await Page(...))` devuelve la respuesta servida sin
 * ejecutar una línea de cliente, que es lo que prueba a la vez que el
 * formulario existe de verdad y que funciona con el script apagado. Leer el
 * fuente no probaría ninguna de las dos.
 *
 * **Ninguna afirmación de acá es una regla.** Qué campos puede tocar una
 * edición lo prueba `listing-edit.test.ts`; que la acción llegue al dominio lo
 * prueba `actions.test.ts`; que un aviso ajeno se conteste como inexistente lo
 * prueba `edit-listing.test.ts`. Acá se prueba lo que la pantalla ofrece y lo
 * que se niega a ofrecer.
 */

const { findAccount, requireSession, loadListingForEdit, notFound } = vi.hoisted(() => ({
  findAccount: vi.fn(),
  requireSession: vi.fn(),
  loadListingForEdit: vi.fn(),
  notFound: vi.fn(() => {
    // `notFound` de Next funciona tirando; imitarlo es lo que prueba que nada
    // después de él dibuja.
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("next/navigation", () => ({ notFound }));
vi.mock("@/shared/db/client", () => ({ db: {} }));
vi.mock("@/modules/identity/infrastructure/session-port", () => ({
  nextAuthSessionPort: { getSession: async () => null },
}));
vi.mock("../../../_lib/require-session", () => ({ requireSession }));
vi.mock("@/modules/broker-bulk-import/infrastructure/drizzle-bulk-import-account", () => ({
  DrizzleBulkImportAccounts: class {
    findAccount = findAccount;
  },
}));
vi.mock("@/modules/listing-publication/infrastructure/drizzle-listing-repository", () => ({
  DrizzleListingEdit: class {},
}));
vi.mock("@/modules/listing-publication/application/edit-listing", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  loadListingForEdit,
}));
// La acción arrastra `next/headers` y la base entera; acá se mira que el
// formulario salga del servidor, no lo que hace al recibirlo.
vi.mock("../../actions", () => ({ guardarEdicion: vi.fn() }));

import { EditListingNotFoundError } from "@/modules/listing-publication/application/edit-listing";
import EditarAvisoPage from "./page";

const AVISO = {
  id: "aviso-1",
  publisherId: "dueno-1",
  publisherType: "owner" as const,
  propertyType: "apartamento" as const,
  cityId: "dc",
  zoneId: "altamira",
  title: "Apartamento amoblado en La Castellana",
  description: "Piso alto con vista abierta, cocina equipada y vigilancia 24 horas.",
  priceUsd: 610,
  rooms: 3,
  areaM2: 128,
  bathrooms: 2,
  parkingSpots: 1,
  contactMethod: "whatsapp" as const,
  contactValue: "04121234567",
  photoCount: 3,
};

beforeEach(() => {
  findAccount.mockReset();
  requireSession.mockReset();
  loadListingForEdit.mockReset();
  notFound.mockClear();
  requireSession.mockResolvedValue({
    userId: "dueno-1",
    name: "María Fernández",
    email: "maria.f@gmail.com",
  });
  findAccount.mockResolvedValue(null);
  loadListingForEdit.mockResolvedValue(AVISO);
});

async function dibujar(motivos?: string): Promise<string> {
  return renderToStaticMarkup(
    await EditarAvisoPage({
      params: Promise.resolve({ id: "aviso-1" }),
      searchParams: Promise.resolve(motivos === undefined ? {} : { motivos }),
    }),
  );
}

describe("/mis-avisos/[id]/editar — la pantalla de corregir un aviso (18.20)", () => {
  /**
   * Un `<form>` de verdad con `method="post"`, como publicar y como las
   * puertas de entrar: sin esto la pantalla dependería de que el bundle
   * llegue, que es exactamente lo que la F14 no permite dar por hecho.
   */
  it("sirve un formulario nativo con los campos editables ya cargados", async () => {
    const html = await dibujar();

    // Un `<form>` con un `submit` adentro y controles HTML de verdad, no un
    // botón de JavaScript. Lo que NO se puede afirmar acá es el `method="post"`
    // que Next le pone a una acción de servidor: la acción está doblada, así
    // que React dibuja su marcador de «formulario sin acción real». A qué se
    // envía lo fija la aserción de fuente de más abajo — el mismo reparto que
    // `mis-avisos-contract.test.tsx` ya documenta para activar.
    expect(html).toMatch(
      /<form[^>]*>.*?<input type="hidden" name="listingId" value="aviso-1"\/>.*?<button type="submit"[^>]*>Guardar cambios<\/button>.*?<\/form>/s,
    );
    expect(html).toContain('value="Apartamento amoblado en La Castellana"');
    expect(html).toContain('name="priceUsd"');
    expect(html).toContain('value="610"');
    expect(html).toContain('name="rooms"');
    expect(html).toContain('name="bathrooms"');
    expect(html).toContain('name="areaM2"');
    expect(html).toContain('name="contactValue"');
    expect(html).toContain('value="04121234567"');
    expect(html).toContain("Piso alto con vista abierta");
    // El id viaja en el formulario, no en una variable de módulo.
    expect(html).toContain('value="aviso-1"');
  });

  /**
   * **La ausencia del control y la negativa del dominio son dos garantías, no
   * una.** El dominio ya refusa `publisherType.immutable`; esto prueba la otra
   * mitad, que la pantalla ni siquiera lo ofrece.
   */
  it("no dibuja ningún control de tipo de publicador", async () => {
    const html = await dibujar();

    expect(html).not.toContain('name="publisherType"');
  });

  /**
   * «Aparece siempre en tu aviso y no se puede cambiar después» es lo que el
   * paso 9 promete ANTES de publicar. La pantalla de editar lo dice donde
   * debería haber estado el campo: callarlo dejaría a un dueño buscando un
   * control que nunca va a encontrar.
   */
  it("dice quién publica y repite la promesa del paso 9 donde debería haber estado el campo", async () => {
    const html = await dibujar();

    expect(html).toContain("Quién publica");
    expect(html).toContain("Dueño");
    expect(html).toContain(PUBLISHER_TYPE_IMMUTABLE_NOTICE);
  });

  /**
   * Las fotos son la 18.21 y dependen del menú `⋯` de la 18.15, que hoy no
   * existe ni al publicar. Media puerta —un control que no puede agregar ni
   * quitar— sería peor que ninguna.
   */
  it("no ofrece editar las fotos, que son otra tarea", async () => {
    const html = await dibujar();

    expect(html).not.toContain('name="photoKey"');
  });

  it("traduce los códigos que vuelven en la URL al castellano de publicar", async () => {
    const html = await dibujar("publisherType.immutable,priceUsd.invalid");

    expect(html).toContain(PUBLISHER_TYPE_IMMUTABLE_NOTICE);
    expect(html).toContain("Solo el número, en dólares y sin centavos");
  });

  /**
   * tasks.md 18.22 — **la negativa al lado del campo que la produjo**, con la
   * misma anatomía que publicar: el mensaje ANTES del control, con su `id`, y
   * el control anunciado con `aria-invalid` y `aria-describedby`. La razón está
   * escrita en `violation-copy.ts`: «un borde rojo es invisible para quien no
   * distingue colores y para el modo de alto contraste».
   */
  it("pone la negativa antes del campo que la produjo y anuncia el control", async () => {
    const html = await dibujar("priceUsd.invalid");

    expect(html).toContain('id="priceUsd-error"');
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('aria-describedby="priceUsd-error"');
    // ANTES, no debajo: el orden en los bytes es el orden en que se lee.
    expect(html.indexOf("Solo el número, en dólares")).toBeLessThan(html.indexOf('id="priceUsd"'));
  });

  /**
   * **El par de la anterior, y hace falta**: una sola afirmación sobre
   * `aria-invalid="true"` aceptaría una pantalla que lo pone siempre, que es
   * exactamente lo que un lector de pantalla no puede distinguir de un campo
   * mal cargado.
   */
  it("sin negativas ningún control se anuncia inválido", async () => {
    const html = await dibujar();

    expect(html).not.toContain("aria-invalid");
    expect(html).not.toContain("-error");
  });

  /**
   * Cada campo, el suyo: una negativa de precio no puede marcar el título. Sin
   * este par, poner `aria-invalid` en todos los controles pasaría la anterior.
   */
  it("marca sólo el campo de la negativa, no todos", async () => {
    const html = await dibujar("contactValue.invalid");

    expect(html).toContain('aria-describedby="contactValue-error"');
    expect(html).not.toContain('aria-describedby="title-error"');
    expect(html).not.toContain('aria-describedby="priceUsd-error"');
  });

  /**
   * **El hueco que la 18.22 nombraba.** `publisherType.immutable` no estaba en
   * el `Record` de publicar, así que era el único código sin campo. Ahora se lee
   * donde debería haber estado el control — que es donde el paso 9 ya prometió
   * que no lo habría.
   */
  it("la negativa de quién publica se lee donde debería haber estado el campo", async () => {
    const html = await dibujar("publisherType.immutable");

    expect(html).toContain('id="publisherType-error"');
    expect(html.indexOf("Quién publica se declara una vez")).toBeLessThan(
      html.indexOf(PUBLISHER_TYPE_IMMUTABLE_NOTICE),
    );
  });

  /**
   * Una edición no manda fotos, ni zona, ni ciudad: si el validador se queja de
   * alguna, no hay campo al lado del cual ponerla. **Se dice igual**, en el
   * bloque, en vez de tragarse — un formulario que se niega a guardar sin decir
   * por qué es peor que un bloque arriba (AGENTS.md §7).
   */
  it("una negativa sobre algo que la edición no manda se sigue diciendo", async () => {
    const html = await dibujar("photos.required");

    expect(html).toContain("Subí al menos una foto");
    expect(html).toContain('role="alert"');
    // Y no inventa un control que esta pantalla no dibuja.
    expect(html).not.toContain('id="photos-error"');
  });

  /**
   * Ninguna se dice dos veces: la que encontró su campo sale ahí y no vuelve a
   * salir en el bloque, que si no serían dos problemas donde hay uno.
   */
  it("la negativa colocada no se repite en el bloque", async () => {
    const html = await dibujar("priceUsd.invalid,photos.required");

    expect(html.split("Solo el número, en dólares").length - 1).toBe(1);
    expect(html).toContain("Subí al menos una foto");
  });

  /**
   * Una dirección escrita a mano es dato de afuera (AGENTS.md §7). Antes de
   * esto, indexar la tabla de copia con lo que trajera la URL habría dado
   * `undefined.message`: un 500 donde correspondía una frase.
   */
  it("un código inventado en la URL no tumba la pantalla", async () => {
    const html = await dibujar("precio.regalado");

    expect(html).toContain("precio.regalado");
    // Y sigue dibujando el formulario: la negativa no reemplaza la pantalla.
    expect(html).toContain("Guardar cambios");
  });

  /**
   * La contraparte de la primera, y la única forma de fijar a QUÉ se envía el
   * formulario sin un empaquetador de por medio: es una relación entre dos
   * archivos, que es el caso en el que este repositorio ya lee el fuente.
   */
  it("el formulario envía a la acción de servidor, nunca a un manejador de cliente", () => {
    const fuente = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

    expect(fuente).toContain("<form action={guardarEdicion}");
    expect(fuente).not.toContain("onClick");
    expect(fuente).not.toContain('"use client"');
  });

  it("la salida vuelve a la lista, con un enlace de verdad", async () => {
    const html = await dibujar();

    expect(html).toContain('href="/mis-avisos"');
  });

  /**
   * **Los mismos bytes para las dos cosas.** El caso de uso ya contesta un
   * aviso ajeno igual que uno inexistente; esto prueba que la pantalla no
   * deshace esa garantía dibujando una disculpa distinta para cada uno.
   */
  it("un aviso ajeno y uno inexistente dan la misma respuesta: no existe", async () => {
    loadListingForEdit.mockRejectedValueOnce(new EditListingNotFoundError("aviso-1"));
    await expect(dibujar()).rejects.toThrow("NEXT_NOT_FOUND");

    loadListingForEdit.mockRejectedValueOnce(new EditListingNotFoundError("aviso-1"));
    await expect(dibujar()).rejects.toThrow("NEXT_NOT_FOUND");

    expect(notFound).toHaveBeenCalledTimes(2);
  });

  /** Cualquier otro fallo sube: una pantalla que dibuja igual miente. */
  it("un fallo que no es «no existe» sube en vez de dibujar un 404", async () => {
    loadListingForEdit.mockRejectedValueOnce(new Error("la base no contesta"));

    await expect(dibujar()).rejects.toThrow("la base no contesta");
    expect(notFound).not.toHaveBeenCalled();
  });
});
