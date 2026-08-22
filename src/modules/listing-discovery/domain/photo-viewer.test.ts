import { describe, expect, it } from "vitest";
import {
  parsePhotoNumber,
  photoNeighbours,
  photoNumberOf,
  photoPositionOf,
  photoViewerPath,
  resolvePhotoViewer,
} from "./photo-viewer";

const LISTING = {
  id: "3f1c2b8a-4d5e-6f70-8192-a3b4c5d6e7f8",
  cityName: "Caracas",
  zoneName: "Chacao",
  title: "Apartamento 2 habitaciones",
};

const CANONICAL =
  "/alquiler/caracas/chacao/apartamento-2-habitaciones-3f1c2b8a-4d5e-6f70-8192-a3b4c5d6e7f8";

function resolve(overrides: Partial<Parameters<typeof resolvePhotoViewer>[0]> = {}) {
  return resolvePhotoViewer({
    listing: LISTING,
    segment: "2",
    requestedPath: `${CANONICAL}/foto/2`,
    total: 6,
    ...overrides,
  });
}

/** La vista, o el fallo del test si la resolución no fue una vista. */
function view(resolution: ReturnType<typeof resolvePhotoViewer>) {
  if (resolution.kind !== "view")
    throw new Error(`se esperaba una vista, llegó "${resolution.kind}"`);
  return resolution.view;
}

describe("el número de la URL es base uno y la columna base cero (16.8)", () => {
  /**
   * **La traducción, en un solo lugar.** F27 escribe `/foto/2` para la segunda
   * foto y `listing_photo.position` guarda 1 para esa misma foto. Las dos
   * numeraciones son correctas en su lado — nadie dice "foto cero" y ningún
   * arreglo empieza en uno — y el error no está en elegir una sino en
   * traducirlas en cada pantalla que las cruza.
   */
  it("la foto 2 de la URL es la posición 1 de la tabla", () => {
    expect(photoPositionOf(2)).toBe(1);
    expect(photoNumberOf(1)).toBe(2);
  });

  it("la primera foto es /foto/1 y la posición 0", () => {
    expect(photoNumberOf(0)).toBe(1);
    expect(photoPositionOf(1)).toBe(0);
  });

  it("ida y vuelta no mueve nada", () => {
    for (const position of [0, 1, 2, 3, 4, 5]) {
      expect(photoPositionOf(photoNumberOf(position))).toBe(position);
    }
  });
});

describe("qué segmento de URL es un número de foto", () => {
  it("acepta un entero escrito en dígitos", () => {
    expect(parsePhotoNumber("1")).toBe(1);
    expect(parsePhotoNumber("6")).toBe(6);
    expect(parsePhotoNumber("12")).toBe(12);
  });

  /**
   * **El `null` es la guarda.** Este valor termina indexando un arreglo de
   * fotos, así que lo que apenas parece un número se rechaza acá y no más
   * adelante, donde un `NaN` produce `undefined` en vez de un 404.
   */
  it("rechaza lo que no es un entero en dígitos", () => {
    expect(parsePhotoNumber("abc")).toBeNull();
    expect(parsePhotoNumber("")).toBeNull();
    expect(parsePhotoNumber("1.5")).toBeNull();
    expect(parsePhotoNumber("-1")).toBeNull();
    expect(parsePhotoNumber("+1")).toBeNull();
    expect(parsePhotoNumber(" 2")).toBeNull();
    expect(parsePhotoNumber("2e1")).toBeNull();
    expect(parsePhotoNumber("١")).toBeNull();
  });

  /** Un cero es un dígito válido y una foto inexistente: lo decide el rango. */
  it("lee el cero como número, y el rango es quien lo rechaza", () => {
    expect(parsePhotoNumber("0")).toBe(0);
  });
});

describe("el anterior y el siguiente se detienen, no dan la vuelta (16.7)", () => {
  it("en el medio hay anterior y siguiente", () => {
    expect(photoNeighbours(3, 6)).toEqual({ previous: 2, next: 4 });
  });

  /**
   * **El visor NO da la vuelta, y es una decisión.** Con enlaces reales el
   * historial del navegador es la secuencia: atrás retrocede una foto. Un ciclo
   * convierte esa secuencia en una rueda sin final — quien recorre las seis no
   * tiene cómo saber que ya las vio, y un rastreador que sigue "siguiente"
   * nunca llega al borde del conjunto. Detenerse es lo que hace que "última
   * foto" signifique algo.
   */
  it("la primera no tiene anterior", () => {
    expect(photoNeighbours(1, 6)).toEqual({ previous: null, next: 2 });
  });

  it("la última no tiene siguiente", () => {
    expect(photoNeighbours(6, 6)).toEqual({ previous: 5, next: null });
  });

  it("con una sola foto no hay ni anterior ni siguiente", () => {
    expect(photoNeighbours(1, 1)).toEqual({ previous: null, next: null });
  });
});

describe("las rutas del visor", () => {
  it("cuelga del aviso, con el número base uno", () => {
    expect(photoViewerPath("/alquiler/caracas/chacao/apto-abc", 2)).toBe(
      "/alquiler/caracas/chacao/apto-abc/foto/2",
    );
  });
});

describe("resolvePhotoViewer decide qué se sirve", () => {
  it("devuelve la vista de la foto pedida, traducida a posición", () => {
    const resolved = view(resolve());

    expect(resolved.number).toBe(2);
    expect(resolved.position).toBe(1);
    expect(resolved.total).toBe(6);
  });

  /** Anterior y siguiente son enlaces reales, no estado de cliente. */
  it("arma los enlaces de anterior y siguiente sobre la ruta canónica", () => {
    const resolved = view(resolve());

    expect(resolved.previousHref).toBe(`${CANONICAL}/foto/1`);
    expect(resolved.nextHref).toBe(`${CANONICAL}/foto/3`);
  });

  it("no hay enlace anterior en la primera ni siguiente en la última", () => {
    expect(
      view(resolve({ segment: "1", requestedPath: `${CANONICAL}/foto/1` })).previousHref,
    ).toBeNull();
    expect(
      view(resolve({ segment: "6", requestedPath: `${CANONICAL}/foto/6` })).nextHref,
    ).toBeNull();
  });

  /** La salida clara de vuelta a la ficha. */
  it("la salida es la ficha del aviso", () => {
    expect(view(resolve()).exitHref).toBe(CANONICAL);
  });

  it("enumera las fotos como enlaces, uno por foto", () => {
    const resolved = view(
      resolve({ total: 3, segment: "3", requestedPath: `${CANONICAL}/foto/3` }),
    );

    expect(resolved.photos).toEqual([
      { number: 1, position: 0, href: `${CANONICAL}/foto/1`, current: false },
      { number: 2, position: 1, href: `${CANONICAL}/foto/2`, current: false },
      { number: 3, position: 2, href: `${CANONICAL}/foto/3`, current: true },
    ]);
  });

  describe("fuera de rango es notFound, no un borde", () => {
    it("no existe la foto cero", () => {
      expect(resolve({ segment: "0", requestedPath: `${CANONICAL}/foto/0` }).kind).toBe("notFound");
    });

    it("no existe una foto más allá del total", () => {
      expect(resolve({ segment: "7", requestedPath: `${CANONICAL}/foto/7` }).kind).toBe("notFound");
      expect(resolve({ segment: "99", requestedPath: `${CANONICAL}/foto/99` }).kind).toBe(
        "notFound",
      );
    });

    it("un segmento que no es número tampoco existe", () => {
      expect(resolve({ segment: "abc", requestedPath: `${CANONICAL}/foto/abc` }).kind).toBe(
        "notFound",
      );
    });

    /** Un aviso sin fotos no tiene visor: ninguna `n` cae dentro de cero. */
    it("un aviso sin fotos no tiene ninguna foto que mostrar", () => {
      expect(resolve({ total: 0, segment: "1", requestedPath: `${CANONICAL}/foto/1` }).kind).toBe(
        "notFound",
      );
    });

    /**
     * **El rango se decide ANTES que la ruta canónica, y el orden importa.**
     * Redirigir `/foto/99` a su forma canónica sólo para responder 404 ahí son
     * dos viajes para la misma respuesta: la foto no existe con ninguna
     * ortografía.
     */
    it("una foto inexistente sobre una ruta torcida es notFound, no una redirección", () => {
      expect(resolve({ segment: "99", requestedPath: "/alquiler/x/y/z-abc/foto/99" }).kind).toBe(
        "notFound",
      );
    });
  });

  describe("la deuda de la 11.1, también acá", () => {
    /**
     * Toda ruta que termine en el mismo id resuelve al mismo aviso. Servirlas
     * todas publicaría URLs duplicadas sin límite — y el visor multiplica el
     * problema por la cantidad de fotos, no lo hereda tal cual.
     */
    it("redirige una ciudad, una zona o un slug que no son los canónicos", () => {
      const resolution = resolve({
        requestedPath: `/alquiler/valencia/otra-zona/titulo-viejo-${LISTING.id}/foto/2`,
      });

      expect(resolution).toEqual({ kind: "redirect", to: `${CANONICAL}/foto/2` });
    });

    it("redirige un número escrito con cero adelante a su forma canónica", () => {
      const resolution = resolve({ segment: "02", requestedPath: `${CANONICAL}/foto/02` });

      expect(resolution).toEqual({ kind: "redirect", to: `${CANONICAL}/foto/2` });
    });

    /** La barra final no es otra ruta: es la misma escrita distinto. */
    it("no redirige por una barra final", () => {
      expect(resolve({ requestedPath: `${CANONICAL}/foto/2/` }).kind).toBe("view");
    });

    it("sirve la ruta canónica sin redirigir", () => {
      expect(resolve().kind).toBe("view");
    });
  });
});
