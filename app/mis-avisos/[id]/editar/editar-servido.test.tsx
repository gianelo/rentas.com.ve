import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { photoAltText, photoUrl } from "@/modules/listing-discovery/domain/listing-photo-view";
import {
  coverChangedNotice,
  PHOTO_ACTION_COPY,
  PHOTO_REMOVAL_REFUSAL_COPY,
} from "../../../publicar/photo-action-copy";
import { FEATURES_DECLARED_FIELD } from "../../../publicar/step-values";
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

const { findAccount, requireSession, loadListingForEdit, loadListingPhotosForEdit, notFound } =
  vi.hoisted(() => ({
    findAccount: vi.fn(),
    requireSession: vi.fn(),
    loadListingForEdit: vi.fn(),
    loadListingPhotosForEdit: vi.fn(),
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
  DrizzleListingPhotoSet: class {},
}));
vi.mock("@/modules/listing-publication/application/edit-listing-photos", () => ({
  loadListingPhotosForEdit,
}));
vi.mock("@/modules/listing-publication/application/edit-listing", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  loadListingForEdit,
}));
// La acción arrastra `next/headers` y la base entera; acá se mira que el
// formulario salga del servidor, no lo que hace al recibirlo.
vi.mock("../../actions", () => ({
  guardarEdicion: vi.fn(),
  quitarFotoDelAviso: vi.fn(),
  pedirDestinoDeFotoDelAviso: vi.fn(),
  adjuntarFotoAlAviso: vi.fn(),
}));

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
  reference: "Frente a la panadería",
  hasPowerPlant: false,
  hasRegularWater: false,
  isFurnished: false,
  hasSecurity: false,
  hasAppliances: false,
  contactMethod: "whatsapp" as const,
  contactValue: "04121234567",
  photoCount: 3,
};

/**
 * La base pública del bucket, que es de dónde el navegador lee una foto ya
 * guardada. Se pone en el entorno y no se dobla `readPhotoPublicBaseUrl`: la
 * negativa cuando falta es parte de lo que esta pantalla promete.
 */
const BASE = "https://fotos.rentas.com.ve";

/** Tres fotos con su miniatura, como las devuelve la lectura de la 18.26. */
const FOTOS = [
  { photoId: "foto-a", thumbKey: "promoted/foto-a/thumb.webp" },
  { photoId: "foto-b", thumbKey: "promoted/foto-b/thumb.webp" },
  { photoId: "foto-c", thumbKey: "promoted/foto-c/thumb.webp" },
];

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
  loadListingPhotosForEdit.mockReset();
  loadListingPhotosForEdit.mockResolvedValue(FOTOS);
  process.env.R2_BUCKET_PUBLIC_URL = BASE;
});

afterEach(() => {
  process.env.R2_BUCKET_PUBLIC_URL = BASE;
});

async function dibujar(motivos?: string): Promise<string> {
  return conParametros(motivos === undefined ? {} : { motivos });
}

async function conParametros(query: Record<string, string | undefined>): Promise<string> {
  return renderToStaticMarkup(
    await EditarAvisoPage({
      params: Promise.resolve({ id: "aviso-1" }),
      searchParams: Promise.resolve(query),
    }),
  );
}

/**
 * tasks.md 18.25 — **el contador cuenta lo que se envió, o no cuenta.**
 *
 * «Vas N» salía 0 sobre una descripción de 24 caracteres, porque lo único que
 * volvía en la dirección eran los códigos. Y la corrección obvia era otro
 * número que nadie escribió: el largo de la descripción GUARDADA, que no es la
 * que se rechazó. Lo que vuelve ahora es la medida de lo enviado, que cabe.
 */
describe("el contador de una negativa de editar (18.25)", () => {
  it("dice el largo de la descripción que se acaba de rechazar", async () => {
    const html = await conParametros({
      motivos: "description.tooShort",
      largoDescripcion: "24",
    });

    expect(html).toContain("✱ Mínimo 120 caracteres. Vas 24.");
  });

  it("no dice el largo de la que está guardada, que es otra", async () => {
    expect([...AVISO.description].length).toBe(67);

    const html = await conParametros({
      motivos: "description.tooShort",
      largoDescripcion: "24",
    });

    expect(html).not.toContain("Vas 67");
  });

  it("sin medida dice el mínimo y se calla el contador, en vez de dibujar un cero", async () => {
    const html = await dibujar("description.tooShort");

    expect(html).toContain("Mínimo 120 caracteres.");
    expect(html).not.toContain("Vas");
  });

  it("una medida inventada en la dirección no dibuja ningún número", async () => {
    for (const largoDescripcion of ["muchos", "-5", "12.5", "1e3", ""]) {
      const html = await conParametros({ motivos: "description.tooShort", largoDescripcion });

      expect(html, largoDescripcion).toContain("Mínimo 120 caracteres.");
      expect(html, largoDescripcion).not.toContain("Vas");
    }
  });

  it("y el título cuenta el suyo, con la misma regla", async () => {
    const html = await conParametros({ motivos: "title.tooLong", largoTitulo: "97" });

    expect(html).toContain("Máximo 90 caracteres. Vas 97.");
  });
});

/** Sólo el `<fieldset>` de los atributos, acotado por su leyenda y no por una
 *  clase: los nombres de clase son hashes del CSS, y la pantalla dibuja otros
 *  dos `<fieldset>` con la misma. */
function atributos(html: string): string {
  const legend = html.indexOf("Lo que tiene la propiedad");
  expect(legend).toBeGreaterThan(-1);
  return html.slice(html.lastIndexOf("<fieldset", legend), html.indexOf("</fieldset>", legend));
}

/** El formulario que guarda, acotado por su botón. **`lastIndexOf` y no
 *  `indexOf`**: la ayuda de las fotos cita «Guardar cambios» para decir que
 *  ellas NO esperan a ese botón, así que la primera aparición está afuera. */
function guardado(html: string): string {
  const boton = html.lastIndexOf("Guardar cambios");
  expect(boton).toBeGreaterThan(-1);
  return html.slice(html.lastIndexOf("<form", boton), boton);
}

/** Devuelve la etiqueta del control, y falla si no está dibujado. */
function control(alcance: string, name: string): string {
  const match = new RegExp(`<input[^>]*name="${name}"[^>]*/>`).exec(alcance);
  if (!match) throw new Error(`no se dibuja el control name="${name}"`);
  return match[0];
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
   * tasks.md 18.27 — **los tres campos que la regla general del fundador abre**
   * («se puede corregir cualquier dato menos el de la zona», 2026-09-01).
   * Ninguna regla se afirma acá: que el dominio los escriba lo prueba
   * `listing-edit.test.ts`; acá se prueba que la pantalla los ofrece cargados.
   */
  it("ofrece corregir la referencia, el tipo de inmueble y los puestos, con lo que el aviso tiene", async () => {
    const html = await dibujar();

    expect(html).toContain('name="reference"');
    expect(html).toContain('value="Frente a la panadería"');
    expect(html).toContain('name="parkingSpots"');
    expect(html).toContain('name="propertyType"');
    // Cargado con el valor del aviso, no en blanco: un radio sin marcar haría
    // que guardar cualquier otro campo cambiara el tipo sin que nadie lo pidiera.
    expect(html).toMatch(/name="propertyType" checked="" value="apartamento"/);
    expect(html).not.toMatch(/name="propertyType" checked="" value="casa"/);
  });

  /**
   * tasks.md 18.37 — los cinco nombres y las cinco etiquetas **a mano y
   * apareados**, igual que en el paso 5: derivarlos de `FEATURE_LABELS` sería
   * preguntarle a la misma constante que el sujeto usa. Y se cuenta que son
   * cinco, porque uno perdido es un dato que deja de poder corregirse sin que
   * nada avise.
   */
  it("ofrece las cinco casillas de la F6, cada nombre con su etiqueta", async () => {
    const campos = atributos(await dibujar());

    expect(campos).toMatch(/name="hasPowerPlant"[^>]*\/><span>Planta eléctrica<\/span>/);
    expect(campos).toMatch(/name="hasRegularWater"[^>]*\/><span>Agua regular<\/span>/);
    expect(campos).toMatch(/name="isFurnished"[^>]*\/><span>Amoblado<\/span>/);
    expect(campos).toMatch(/name="hasSecurity"[^>]*\/><span>Vigilancia 24 h<\/span>/);
    expect(campos).toMatch(/name="hasAppliances"[^>]*\/><span>Línea blanca<\/span>/);

    expect(campos.match(/type="checkbox"/g)).toHaveLength(5);
  });

  /** **Lo declarado vuelve marcado, y lo demás vuelve DIBUJADO y sin marcar.**
   *  Las tres sin marcar se piden por `control`, que falla si la casilla no
   *  está: un `not.toContain("checked")` sobre un control borrado pasa solo. */
  it("las casillas vuelven con lo que el aviso declaró, no en blanco", async () => {
    loadListingForEdit.mockResolvedValue({
      ...AVISO,
      hasPowerPlant: true,
      hasSecurity: true,
      hasRegularWater: false,
      isFurnished: false,
      hasAppliances: false,
    });

    const campos = atributos(await dibujar());

    expect(control(campos, "hasPowerPlant")).toContain('checked=""');
    expect(control(campos, "hasSecurity")).toContain('checked=""');
    expect(control(campos, "hasRegularWater")).not.toContain("checked");
    expect(control(campos, "isFurnished")).not.toContain("checked");
    expect(control(campos, "hasAppliances")).not.toContain("checked");
  });

  /**
   * **La marca, que es la tarea entera.** Sin un campo que SIEMPRE viaje, el
   * servidor no puede distinguir «las destildé todas» de «este pedido no traía
   * atributos», y guardar el precio borraría cinco declaraciones. Va DENTRO del
   * formulario de guardar, así que destildar las cinco y apretar «Guardar
   * cambios» ya es «no tiene ninguna» con el script apagado — sin el POST
   * aparte que el paso 5 sí necesita.
   */
  it("manda la marca de que el pedido declara los cinco, dentro del formulario que guarda", async () => {
    const html = await dibujar();

    expect(guardado(html)).toContain(
      `<input type="hidden" name="${FEATURES_DECLARED_FIELD}" value="1"/>`,
    );
    // El par: la marca sin las casillas declararía cinco `false` en cada
    // guardado, que es el borrado que esto existe para impedir.
    expect(atributos(html).match(/type="checkbox"/g)).toHaveLength(5);
  });

  /**
   * **La zona y la ciudad siguen sin control, y esa ausencia es la mitad de la
   * garantía.** La otra la tiene el dominio, que no las lleva en `ListingEdit`.
   * El par positivo va pegado a propósito: un `not.toContain` sobre una pantalla
   * que dejó de dibujar el formulario pasa solo.
   */
  it("no ofrece cambiar la zona ni la ciudad, que van en la URL del aviso", async () => {
    const html = await dibujar();

    expect(html).not.toContain('name="zoneId"');
    expect(html).not.toContain('name="cityId"');
    expect(html).toContain('name="propertyType"');
    expect(html).toContain("Guardar cambios");
  });

  /** La negativa de la referencia dejó de caer en el bloque de arriba el día que
   *  tuvo control: se lee al lado del campo, como todas las que sí lo tienen. */
  it("la negativa de la referencia se lee al lado de su campo y no en el bloque", async () => {
    const html = await dibujar("reference.tooLong");

    expect(html).toContain('id="reference-error"');
    expect(html).toContain('aria-describedby="reference-error"');
    expect(html).not.toContain('role="alert"');
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

/**
 * tasks.md 18.21 — las fotos de un aviso publicado, en los bytes servidos.
 *
 * **Ninguna regla se afirma acá.** Que quitar la última se rechace lo prueba
 * `draft-photo-actions.test.ts`; que la puerta refuse un aviso ajeno lo prueba
 * `edit-listing-photos.test.ts`; que renumerar no choque contra el índice
 * único lo prueba `tests/integration/listing-photo-editing.test.ts`.
 */
describe("/mis-avisos/[id]/editar — las fotos (18.21)", () => {
  it("cada foto trae un formulario real para quitarla, con su id y el del aviso adentro", async () => {
    const html = await dibujar();

    expect(html).toContain('name="photoId" value="foto-a"');
    expect(html).toContain('name="photoId" value="foto-b"');
    expect(html).toContain('name="photoId" value="foto-c"');
    expect(html).toContain(PHOTO_ACTION_COPY.remove.label);

    // **Ninguna anidada.** Un `<form>` adentro de otro es marcado inválido, y
    // el navegador lo resuelve mandando la edición entera al tocar «Quitar».
    // Cada foto cierra su formulario antes de que se abra cualquier otro...
    for (const foto of ["foto-a", "foto-b", "foto-c"]) {
      const desde = html.indexOf(`value="${foto}"`);
      const cierra = html.indexOf("</form>", desde);
      const abre = html.indexOf("<form", desde);
      expect(cierra).toBeGreaterThan(-1);
      expect(cierra).toBeLessThan(abre === -1 ? Number.MAX_SAFE_INTEGER : abre);
    }
    // ...y el formulario de guardar empieza después de que todas cerraron.
    expect(html.indexOf('name="title"')).toBeGreaterThan(
      html.indexOf("</form>", html.lastIndexOf('value="foto-c"')),
    );
  });

  it("nombra la portada, y sólo a la portada", async () => {
    const html = await dibujar();

    expect(html).toContain("Foto 1 (portada)");
    expect(html).not.toContain("Foto 2 (portada)");
    expect(html).toContain("Foto 3");
  });

  it("dice que quitar no borra la foto del teléfono, que la especificación marca como no decorativa", async () => {
    expect(await dibujar()).toContain(PHOTO_ACTION_COPY.remove.hint as string);
  });

  it("cuando quitar se negó, dice por qué y ofrece la salida", async () => {
    const html = await conParametros({ foto: "lastPhoto" });

    expect(html).toContain(PHOTO_REMOVAL_REFUSAL_COPY.lastPhoto);
  });

  it("sin negativa de foto no dibuja ninguna, que es el par de la anterior", async () => {
    const html = await dibujar();

    expect(html).not.toContain(PHOTO_REMOVAL_REFUSAL_COPY.lastPhoto);
    expect(html).not.toContain(PHOTO_REMOVAL_REFUSAL_COPY.notFound);
  });

  it("un código de foto inventado no dibuja «undefined» ni rompe la pantalla", async () => {
    const html = await conParametros({ foto: "inventado" });

    expect(html).toContain("inventado");
    expect(html).not.toContain("undefined");
  });

  it("cuando la portada cambió al quitar, lo anuncia con nombre", async () => {
    const html = await conParametros({ portada: "1" });

    expect(html).toContain(coverChangedNotice("Foto 1"));
  });

  it("sin cambio de portada no lo anuncia, que es el par de la anterior", async () => {
    expect(await dibujar()).not.toContain(coverChangedNotice("Foto 1"));
  });

  it("dice que las fotos no esperan a «Guardar cambios», porque no lo hacen", async () => {
    expect(await dibujar()).toContain("Guardar cambios»");
  });
});

/**
 * tasks.md 18.26 — **la foto dibujada, no nombrada por su ordinal.**
 *
 * El costo que la 18.21 dejó dicho: quien tiene seis fotos parecidas elegía
 * por «Foto 4» y podía quitar la que no era, irreversiblemente y sobre su
 * propio aviso. Lo que faltaba no era una decisión sino un cable —`photoUrl` y
 * `photoAltText` ya viven puros y probados en `listing-discovery`, y
 * `listing_photo_derivative` ya guarda la clave de la `thumb`—, así que acá se
 * afirma que el cable está: los bytes servidos traen la imagen y su frase.
 *
 * **Ninguna regla se afirma acá.** Cómo se compone el texto alternativo lo
 * prueba `listing-photo-view.test.ts`; que la lectura no filtre una foto sin
 * miniatura lo prueba `edit-listing-photos.test.ts`; que la clave leída sea la
 * de la `thumb` y no la de otro tamaño lo prueba
 * `tests/integration/listing-photo-editing.test.ts`.
 */
describe("/mis-avisos/[id]/editar — la foto dibujada (18.26)", () => {
  it("cada foto sale como una imagen que apunta a su miniatura", async () => {
    const html = await dibujar();

    for (const foto of FOTOS) {
      expect(html).toContain(`src="${photoUrl(BASE, foto.thumbKey)}"`);
    }
  });

  /**
   * **Miniatura, no la foto entera.** Las cuatro derivadas existen justamente
   * para que un teléfono con datos caros no descargue una imagen de pantalla
   * completa por cada renglón de una lista de seis.
   */
  it("apunta a la miniatura y a ningún otro tamaño", async () => {
    const html = await dibujar();

    expect(html).toContain("promoted/foto-a/thumb.webp");
    for (const tamano of ["card", "strip", "detail", "full"]) {
      expect(html).not.toContain(`promoted/foto-a/${tamano}.webp`);
    }
  });

  /**
   * **El texto alternativo es producto, no decoración.** Un `alt="foto"`
   * escrito a mano sería peor que ninguno para quien usa lector de pantalla:
   * la posición va primero (regla R7 del fundador) porque necesita saber dónde
   * está antes que qué mira.
   */
  it("el alt de cada foto es la frase compuesta del dominio, con su posición y el total", async () => {
    const html = await dibujar();

    expect(html).toContain(
      `alt="${photoAltText({ position: 0, total: 3, title: AVISO.title, zone: "" })}"`,
    );
    expect(html).toContain(
      `alt="${photoAltText({ position: 2, total: 3, title: AVISO.title, zone: "" })}"`,
    );
    // Y son frases DISTINTAS: un alt igual para las seis es exactamente el
    // ordinal a ciegas que esta tarea vino a cerrar, sólo que hablado.
    expect(html).toContain("Foto 1 de 3 — Apartamento amoblado en La Castellana");
    expect(html).toContain("Foto 3 de 3 — Apartamento amoblado en La Castellana");
  });

  /**
   * **El par de la anterior.** Sin esto, un `alt` que dijera siempre «Foto 1
   * de 3» pasaría la de arriba, y es justo lo que un lector de pantalla no
   * puede distinguir de seis fotos bien nombradas.
   */
  it("no le pone a la segunda foto el nombre de la primera", async () => {
    const html = await dibujar();

    expect(html).toContain("Foto 2 de 3 —");
    expect(html.split("Foto 1 de 3 —").length - 1).toBe(1);
  });

  /**
   * **Una foto sin derivada no desaparece ni dibuja un ícono roto.** Su
   * renglón es el único camino para quitarla, así que se queda con su nombre y
   * su botón; lo que no se emite es una `<img>` cuyo `src` no existe.
   */
  it("una foto sin miniatura conserva su renglón y su botón, sin imagen rota", async () => {
    loadListingPhotosForEdit.mockResolvedValueOnce([
      { photoId: "foto-a", thumbKey: null },
      { photoId: "foto-b", thumbKey: "promoted/foto-b/thumb.webp" },
    ]);

    const html = await dibujar();

    expect(html).toContain('name="photoId" value="foto-a"');
    expect(html).toContain("Foto 1 (portada)");
    expect(html).toContain(`src="${photoUrl(BASE, "promoted/foto-b/thumb.webp")}"`);
    // Ni una `<img>` sin fuente, ni un `src` vacío, ni la palabra que delata
    // un valor que nadie escribió.
    expect(html).not.toContain('src=""');
    expect(html).not.toContain("undefined");
    expect(html.split("<img").length - 1).toBe(1);
  });

  /**
   * **Sin `R2_BUCKET_PUBLIC_URL` la pantalla se niega, no dibuja de menos**
   * (AGENTS.md §7). Volver en silencio al ordinal sería regresar exactamente
   * al daño que esta tarea cierra, ahora invisible: un despliegue mal
   * configurado se vería igual que uno correcto. `listing-discovery` ya refusa
   * construir una URL sin base, y esta pantalla no debilita esa negativa.
   */
  it("sin la base pública del bucket se niega en vez de dibujar imágenes rotas", async () => {
    process.env.R2_BUCKET_PUBLIC_URL = "";

    await expect(dibujar()).rejects.toThrow("R2_BUCKET_PUBLIC_URL");
  });
});
