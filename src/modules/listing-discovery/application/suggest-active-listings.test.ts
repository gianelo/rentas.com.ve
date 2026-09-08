import { describe, expect, it, vi } from "vitest";
import type { CountedZoneName } from "../../listing-catalogue/domain/bounded-vocabulary";
import type { ListingSearchResult } from "../../listing-search/application/ports/listing-search.port";
import type { SearchCriteria } from "../../listing-search/domain/search-criteria";
import { suggestActiveListings } from "./suggest-active-listings";

const DISTRITO = { id: "ciudad-dc", name: "Distrito Capital" };
const MARACAIBO = { id: "ciudad-mcbo", name: "Maracaibo" };

const TIERRA_NEGRA = { id: "zona-tierra-negra", name: "Tierra Negra", cityId: MARACAIBO.id };
const BELLA_VISTA = { id: "zona-bella-vista", name: "Bella Vista", cityId: MARACAIBO.id };
const CHACAO = { id: "zona-chacao", name: "Chacao", cityId: DISTRITO.id };

/**
 * Las zonas activas de las DOS ciudades, como las devolvería
 * `ActiveCityZonesPort.listActiveZones` — ya contadas y ya acotadas por
 * ciudad. El doble de abajo filtra este arreglo por `cityId` antes de
 * devolverlo, igual que el `WHERE` real, para que la prueba de aislamiento
 * entre ciudades siga midiendo algo real (27.1 slice D).
 */
const ACTIVE_ZONES: readonly CountedZoneName[] = [TIERRA_NEGRA, BELLA_VISTA, CHACAO].map(
  (zone) => ({ ...zone, parentName: null, count: 1 }),
);

function row(id: string, zone: { id: string; cityId: string }): ListingSearchResult {
  return {
    id,
    cityId: zone.cityId,
    zoneId: zone.id,
    title: `Aviso ${id}`,
    priceUsd: 400,
    rooms: 2,
    areaM2: 70,
    publisherType: "owner",
    publishedAt: new Date("2026-08-01T12:00:00Z"),
  };
}

const VIEWED = "aviso-vencido";

/** El aviso vencido que se está mirando: Tierra Negra, Maracaibo. */
const REQUEST = {
  listingId: VIEWED,
  cityId: MARACAIBO.id,
  cityName: MARACAIBO.name,
  zoneId: TIERRA_NEGRA.id,
  zoneName: TIERRA_NEGRA.name,
};

function harness(responses: readonly (readonly ListingSearchResult[])[]) {
  const search = vi.fn<(criteria: SearchCriteria) => Promise<readonly ListingSearchResult[]>>();
  for (const response of responses) search.mockResolvedValueOnce(response);
  search.mockResolvedValue([]);

  // El doble de `ActiveCityZonesPort`: acota por `cityId` como lo hace el
  // `WHERE` real, así que nunca devuelve la zona de la ciudad vecina.
  const listActiveZones = vi.fn(async (cityId: string) =>
    ACTIVE_ZONES.filter((zone) => zone.cityId === cityId),
  );

  return {
    search,
    listActiveZones,
    dependencies: {
      search: { search },
      activeZones: { listActiveZones },
    },
  };
}

describe("suggestActiveListings", () => {
  /** 11.12 — la zona primero, y si alcanza no se pregunta nada más. */
  it("busca en la zona del aviso y no amplía cuando encuentra", async () => {
    const { search, listActiveZones, dependencies } = harness([
      [row("mcbo-1", TIERRA_NEGRA), row("mcbo-2", TIERRA_NEGRA)],
    ]);

    const outcome = await suggestActiveListings(REQUEST, dependencies);

    expect(outcome.scope).toBe("zone");
    expect(outcome.listings.map((listing) => listing.id)).toEqual(["mcbo-1", "mcbo-2"]);
    // Una sola consulta: ampliar sin necesidad es un segundo viaje HTTP a Neon
    // en una pantalla que ya paga cuatro.
    expect(search).toHaveBeenCalledTimes(1);
    expect(search.mock.calls[0]?.[0]).toEqual({
      cityId: MARACAIBO.id,
      zoneIds: [TIERRA_NEGRA.id],
    });
    // Y las zonas activas no se tocan: los avisos de la zona del aviso están en
    // la zona del aviso, cuyo nombre la ficha ya trajo.
    expect(listActiveZones).not.toHaveBeenCalled();
  });

  /**
   * **27.1 slice D — la causa que esta rebanada corrige.** Antes de esta
   * rebanada este archivo era el último camino de lectura que pedía
   * `CataloguePort.listZones()` — la taxonomía entera, 5.813 zonas del país
   * enteras sin `WHERE` — y descartaba en JavaScript las que no fueran de esta
   * ciudad. Esta prueba fallaría contra ese código: probaría que
   * `listActiveZones` recibió UNA ciudad y no la ciudad más una lista sin
   * filtrar, y una implementación que pidiera la taxonomía entera no tendría
   * este método que llamar en absoluto.
   */
  it("le pide al puerto sólo las zonas activas de ESTA ciudad, nunca la taxonomía entera", async () => {
    const { listActiveZones, dependencies } = harness([[], [row("mcbo-9", BELLA_VISTA)]]);

    await suggestActiveListings(REQUEST, dependencies);

    expect(listActiveZones).toHaveBeenCalledTimes(1);
    expect(listActiveZones).toHaveBeenCalledWith(MARACAIBO.id);
  });

  /** Los nombres que la tarjeta escribe, y el camino canónico que arma con ellos. */
  it("los avisos de la zona salen con el nombre de esa zona y esa ciudad", async () => {
    const { dependencies } = harness([[row("mcbo-1", TIERRA_NEGRA)]]);

    const outcome = await suggestActiveListings(REQUEST, dependencies);

    expect(outcome.listings[0]).toMatchObject({
      id: "mcbo-1",
      zoneName: TIERRA_NEGRA.name,
      cityName: MARACAIBO.name,
    });
  });

  /**
   * 11.10 — **la zona vacía se amplía a la ciudad, una sola vez.** La segunda
   * consulta va sin zona y con la MISMA ciudad: ése es el borde entero.
   */
  it("amplía a la ciudad cuando la zona no tiene avisos activos", async () => {
    const { search, dependencies } = harness([[], [row("mcbo-9", BELLA_VISTA)]]);

    const outcome = await suggestActiveListings(REQUEST, dependencies);

    expect(outcome.scope).toBe("city");
    expect(outcome.listings.map((listing) => listing.id)).toEqual(["mcbo-9"]);
    expect(search).toHaveBeenCalledTimes(2);
    expect(search.mock.calls[1]?.[0]).toEqual({ cityId: MARACAIBO.id });
  });

  /** Ampliado, el nombre de cada zona sale del catálogo y no del aviso vencido. */
  it("al ampliar, cada aviso lleva el nombre de SU zona", async () => {
    const { dependencies } = harness([[], [row("mcbo-9", BELLA_VISTA)]]);

    const outcome = await suggestActiveListings(REQUEST, dependencies);

    expect(outcome.listings[0]).toMatchObject({
      zoneName: BELLA_VISTA.name,
      cityName: MARACAIBO.name,
    });
    // Y no el de la zona del aviso vencido, que es la copia fácil y equivocada:
    // mandaría cada tarjeta a un camino que la ficha tendría que redirigir.
    expect(outcome.listings[0]?.zoneName).not.toBe(TIERRA_NEGRA.name);
  });

  /**
   * 11.10 — **una ciudad sin avisos activos no sugiere nada**, y no hay una
   * tercera consulta. `design.md`: "Widen zone → city, never city → country".
   */
  it("una ciudad sin activos no sugiere nada, y no consulta una tercera vez", async () => {
    const { search, dependencies } = harness([[], []]);

    const outcome = await suggestActiveListings(REQUEST, dependencies);

    expect(outcome).toEqual({ scope: "none", listings: [] });
    expect(search).toHaveBeenCalledTimes(2);
  });

  /**
   * **El aislamiento, afirmado contra el puerto y no contra el falso.** Que el
   * `WHERE` filtre lo prueba `tests/integration/listing-search.test.ts` contra
   * Postgres real; lo que este caso de uso puede romper por su cuenta es
   * preguntar por OTRA ciudad, y eso es lo que se mide acá.
   *
   * Se afirma sobre TODAS las llamadas, incluida la ampliada: la ampliación es
   * exactamente el momento en que una fuga entre ciudades sería más fácil de
   * escribir sin que nada se queje.
   */
  it("nunca le pregunta al puerto por otra ciudad", async () => {
    const { search, dependencies } = harness([[], [row("dc-1", CHACAO)]]);

    await suggestActiveListings(REQUEST, dependencies);

    expect(search).toHaveBeenCalled();
    for (const [criteria] of search.mock.calls) {
      expect(criteria.cityId).toBe(MARACAIBO.id);
      expect(criteria.cityId).not.toBe(DISTRITO.id);
    }
  });

  /**
   * **Un aviso de otra ciudad que el puerto devolviera igual no se dibuja.** El
   * puerto garantiza el aislamiento y la integración lo prueba, pero este caso
   * de uso escribe el nombre de la ciudad del aviso VENCIDO sobre cada
   * sugerencia: sin descartar al intruso, una tarjeta de Chacao saldría rotulada
   * "Maracaibo" y con un camino de Maracaibo. La falla sería invisible.
   */
  it("descarta un aviso cuya zona no es de esta ciudad", async () => {
    const { dependencies } = harness([[], [row("dc-1", CHACAO), row("mcbo-9", BELLA_VISTA)]]);

    const outcome = await suggestActiveListings(REQUEST, dependencies);

    expect(outcome.listings.map((listing) => listing.id)).toEqual(["mcbo-9"]);
  });

  /**
   * 11.11 — **no hay contacto que filtrar, y ésa es la garantía.** Lo que sale
   * de acá son filas de `ListingSearchPort`, cuyo tipo no tiene un campo de
   * contacto; el valor sólo existe detrás del caso de uso que registra la
   * revelación. La prueba pone un contacto encima de la fila para que la
   * garantía se mida en vez de suponerse.
   */
  it("no deja pasar un valor de contacto que venga pegado a la fila", async () => {
    const contaminada = {
      ...row("mcbo-1", TIERRA_NEGRA),
      contactValue: "+58 412 1234567",
    } as ListingSearchResult;
    const { dependencies } = harness([[contaminada]]);

    const outcome = await suggestActiveListings(REQUEST, dependencies);

    for (const listing of outcome.listings) {
      expect(JSON.stringify(listing)).not.toContain("+58 412 1234567");
    }
  });
});
