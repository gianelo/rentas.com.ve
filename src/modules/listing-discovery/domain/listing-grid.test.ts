import { describe, expect, it } from "vitest";
import { buildListingGrid, type GridCover, type GridListing } from "./listing-grid";

const BASE = "https://fotos.rentas.com.ve";

function listing(overrides: Partial<GridListing> = {}): GridListing {
  return {
    id: "11111111-2222-3333-4444-555555555555",
    title: "Apartamento 2 habitaciones",
    priceUsd: 450,
    rooms: 2,
    areaM2: 65,
    publisherType: "owner",
    cityName: "Distrito Capital",
    zoneName: "Chacao",
    ...overrides,
  };
}

function cover(keys: Record<string, string>): GridCover {
  return { keys };
}

const fullCover = cover({
  thumb: "photos/pub/tok/thumb.webp",
  card: "photos/pub/tok/card.webp",
  strip: "photos/pub/tok/strip.webp",
});

describe("buildListingGrid", () => {
  it("arma la ruta canónica del aviso con buildListingPath", () => {
    const [card] = buildListingGrid([listing()], new Map([[listing().id, fullCover]]), BASE);

    expect(card?.href).toBe(
      "/alquiler/distrito-capital/chacao/apartamento-2-habitaciones-11111111-2222-3333-4444-555555555555",
    );
  });

  it("pide thumb para el teléfono y card para el escritorio", () => {
    const [card] = buildListingGrid([listing()], new Map([[listing().id, fullCover]]), BASE);

    expect(card?.photo.thumbUrl).toBe(`${BASE}/photos/pub/tok/thumb.webp`);
    expect(card?.photo.cardUrl).toBe(`${BASE}/photos/pub/tok/card.webp`);
  });

  it("compone el texto alternativo con photoAltText, no con una plantilla propia", () => {
    const [card] = buildListingGrid([listing()], new Map([[listing().id, fullCover]]), BASE);

    expect(card?.photo.alt).toBe("Foto 1 de 1 — Apartamento 2 habitaciones, Chacao");
  });

  /**
   * **Regla F9, y es de negocio: un aviso sin foto no entra en la
   * cuadrícula.** Una tarjeta sin imagen se lee como rota, no como pobre —
   * ésa es la diferencia con la fila que la cuadrícula reemplaza. El
   * formulario de publicación ya exige una foto, pero la importación de
   * cartera de la Fase 9 no, así que el caso llega de verdad.
   */
  it("deja fuera al aviso que no tiene portada", () => {
    const conFoto = listing({ id: "aaaaaaaa-2222-3333-4444-555555555555" });
    const sinFoto = listing({ id: "bbbbbbbb-2222-3333-4444-555555555555" });

    const grid = buildListingGrid([conFoto, sinFoto], new Map([[conFoto.id, fullCover]]), BASE);

    expect(grid.map((card) => card.id)).toEqual([conFoto.id]);
  });

  /**
   * Una portada a la que le falta una de las dos derivadas que la tarjeta
   * dibuja es el mismo caso que no tener portada: el rellenado de la 19a
   * puede dejar un aviso a medio derivar, y media tarjeta con un ícono roto
   * es peor que una tarjeta menos.
   */
  it("deja fuera al aviso cuya portada no tiene los dos tamaños que la tarjeta usa", () => {
    const soloCard = listing();

    expect(
      buildListingGrid(
        [soloCard],
        new Map([[soloCard.id, cover({ card: "photos/pub/tok/card.webp" })]]),
        BASE,
      ),
    ).toHaveLength(0);
  });

  it("conserva el orden que trajo la búsqueda", () => {
    const primero = listing({ id: "aaaaaaaa-2222-3333-4444-555555555555" });
    const segundo = listing({ id: "bbbbbbbb-2222-3333-4444-555555555555" });
    const covers = new Map([
      [segundo.id, fullCover],
      [primero.id, fullCover],
    ]);

    // El adaptador ya ordena por `published_at` descendente; reordenar acá
    // sería una segunda regla de orden compitiendo con la del `ORDER BY`.
    expect(buildListingGrid([primero, segundo], covers, BASE).map((card) => card.id)).toEqual([
      primero.id,
      segundo.id,
    ]);
  });

  it("copia los datos que la tarjeta muestra sin reinterpretarlos", () => {
    const [card] = buildListingGrid(
      [listing({ publisherType: "broker", rooms: 3, areaM2: 120, priceUsd: 900 })],
      new Map([[listing().id, fullCover]]),
      BASE,
    );

    expect(card).toMatchObject({
      priceUsd: 900,
      rooms: 3,
      areaM2: 120,
      publisherType: "broker",
      zoneName: "Chacao",
      title: "Apartamento 2 habitaciones",
    });
  });

  it("no consulta nada con una lista vacía", () => {
    expect(buildListingGrid([], new Map(), BASE)).toEqual([]);
  });
});
