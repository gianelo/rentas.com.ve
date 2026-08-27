import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MAX_IMPORT_ROW_COUNT } from "../../src/modules/broker-bulk-import/domain/csv-import-bounds";
import { REQUIRED_IMPORT_COLUMNS } from "../../src/modules/broker-bulk-import/domain/csv-import-columns";
import { ImportarCartera } from "./ImportarCartera";
import { VistaPrevia } from "./VistaPrevia";

/**
 * Las láminas 14e (antes de elegir archivo) y 14g (vista previa), medidas
 * sobre **los bytes que sale del servidor** — `renderToStaticMarkup`, sin
 * hidratar nunca. Es la misma disciplina que `Nav.test.tsx` y
 * `AccountMenu.test.tsx`: lo que un navegador sin JavaScript recibe, tal cual.
 *
 * ## Por qué esa medición importa justo acá
 *
 * AGENTS.md §2 exime a importar del piso de "funciona sin JavaScript" porque
 * la vista previa pasa en el dispositivo. La exención es **angosta**: exime a
 * la vista previa, no autoriza que la pantalla quede muda si el paquete no
 * llega. Fallar cerrado (§7) acá significa que la puerta queda CERRADA y
 * dice por qué — nunca un botón que se puede tocar y no hace nada.
 */
describe("Importar · antes de elegir archivo (14e)", () => {
  const html = renderToStaticMarkup(<ImportarCartera />);

  it("la plantilla se baja con un enlace real: es el paso 1 y funciona sin JavaScript", () => {
    expect(html).toMatch(/<a[^>]*href="\/importar\/plantilla"/);
  });

  /**
   * **El cierre.** Sin JavaScript, `onChange` nunca corre, el archivo nunca
   * entra al estado y este botón nunca se habilita — no por una comprobación
   * extra, sino porque su condición es "hay un archivo en memoria", que es
   * exactamente lo que sólo el script puede lograr. Es la forma en la que el
   * modo de fallo es la negativa.
   */
  it("el botón de revisar sale DESHABILITADO del servidor", () => {
    const boton = html.match(/<button[^>]*>Revisar el archivo<\/button>/)?.[0] ?? "";

    expect(boton).not.toBe("");
    expect(boton).toContain("disabled");
  });

  it("y dice por qué, en vez de quedarse mudo", () => {
    expect(html).toContain("<noscript>");
    expect(html).toMatch(/<noscript>[\s\S]*JavaScript[\s\S]*<\/noscript>/);
    // El enlace de la plantilla vive FUERA del noscript: sigue sirviendo.
    expect(html.indexOf('href="/importar/plantilla"')).toBeLessThan(html.indexOf("<noscript>"));
  });

  it("los dos límites se dicen ANTES de subir, no después de esperar la subida", () => {
    expect(html).toContain(`${MAX_IMPORT_ROW_COUNT} filas`);
    expect(html).toContain("2 MB");
    expect(html).toContain("UTF-8");
  });

  it("nombra las seis columnas obligatorias con el nombre exacto que el parser espera", () => {
    expect(REQUIRED_IMPORT_COLUMNS).toHaveLength(6);
    for (const columna of REQUIRED_IMPORT_COLUMNS) {
      expect(html).toContain(columna);
    }
  });

  it("avisa desde acá que los avisos entran como borradores sin foto", () => {
    expect(html).toContain("borradores");
    expect(html).toContain("foto");
  });
});

describe("Importar · vista previa (14g)", () => {
  // Las dos primeras filas con problema de la lámina 14g, con sus celdas
  // (tasks.md 9.29) tal como el archivo las traía.
  const preview = {
    estado: "vista-previa" as const,
    totalFilas: 42,
    listas: 38,
    errores: [
      {
        fila: 7,
        razones: ["«El Rosal» no existe en Maracaibo"],
        celdas: {
          referencia: "MB-0114",
          precio: "520",
          zona: "El Rosal",
          habitaciones: "2",
          titulo: "Apto 2 hab cerca del lago",
        },
        resaltadas: ["zona" as const],
      },
      {
        fila: 12,
        razones: ["Falta el precio."],
        celdas: {
          referencia: "CH-0207",
          precio: "",
          zona: "Chacao",
          habitaciones: "3",
          titulo: "Apartamento 3 hab con puesto techado",
        },
        resaltadas: ["precio" as const],
      },
    ],
  };

  it("cuenta las dos mitades y nombra cada fila con problema y su razón", () => {
    const html = renderToStaticMarkup(<VistaPrevia preview={preview} archivo="cartera.csv" />);

    expect(html).toContain("38");
    expect(html).toContain("2");
    expect(html).toContain("Fila 7");
    expect(html).toContain("«El Rosal» no existe en Maracaibo");
    expect(html).toContain("Fila 12");
    expect(html).toContain("Falta el precio.");
    expect(html).toContain("cartera.csv");
  });

  /**
   * tasks.md 9.29 — el desvío 2 de la 9.26, cerrado. La lámina 14g dibuja la
   * referencia, el precio, la zona, las habitaciones y el título de cada
   * fila con problema; hasta ahora la pantalla sólo podía decir la fila y el
   * problema porque `ImportRowError` no llevaba nada más.
   */
  it("cada fila con problema muestra sus celdas: referencia, título, precio, zona y habitaciones", () => {
    const html = renderToStaticMarkup(<VistaPrevia preview={preview} archivo="cartera.csv" />);

    expect(html).toContain("Fila 7 · MB-0114");
    expect(html).toContain("Apto 2 hab cerca del lago");
    expect(html).toContain("El Rosal");
    expect(html).toContain("2 hab");
    expect(html).toContain("$520");
  });

  /**
   * «El valor ofensor va resaltado en su propia celda, además del texto del
   * problema» — la anotación al pie de 14g. `<mark>` y no una clase suelta:
   * el resaltado es semántico, así que existe también para quien no lo ve.
   */
  it("resalta la celda ofensora, y sólo ésa", () => {
    const html = renderToStaticMarkup(<VistaPrevia preview={preview} archivo="cartera.csv" />);

    expect(html).toMatch(/<mark[^>]*>El Rosal<\/mark>/);
    // La misma fila muestra «2 hab» sin resaltar: su problema es la zona.
    expect(html).not.toMatch(/<mark[^>]*>2 hab<\/mark>/);
  });

  /**
   * La fila 12 de la lámina no trae precio: la tabla de escritorio escribe
   * «—» y la tarjeta de móvil simplemente no lo pone. Una celda vacía
   * resaltada sería un rectángulo de color sobre nada.
   */
  it("una celda vacía no se dibuja, ni siquiera resaltada", () => {
    const html = renderToStaticMarkup(<VistaPrevia preview={preview} archivo="cartera.csv" />);

    expect(html).toContain("Fila 12 · CH-0207");
    expect(html).toContain("Chacao · 3 hab");
    expect(html).not.toContain("$ ·");
    expect(html).not.toMatch(/<mark[^>]*><\/mark>/);
  });

  it("el botón de crear dice cuántas va a crear — no «Confirmar»", () => {
    const html = renderToStaticMarkup(<VistaPrevia preview={preview} archivo="cartera.csv" />);

    expect(html).toContain("Crear las 38 propiedades");
  });

  /**
   * **Sin filas válidas no hay nada que crear.** Un botón que crea cero es un
   * botón que miente sobre lo que va a pasar; lo que hace falta es corregir el
   * archivo, y ése es el único camino que queda dibujado.
   */
  it("con cero filas listas NO hay botón de crear", () => {
    const html = renderToStaticMarkup(
      <VistaPrevia preview={{ ...preview, listas: 0, totalFilas: 2 }} archivo="cartera.csv" />,
    );

    expect(html).not.toContain("Crear las");
    expect(html).toContain("Corregir el archivo");
  });
});
