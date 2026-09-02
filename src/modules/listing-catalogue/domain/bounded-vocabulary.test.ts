import { describe, expect, it } from "vitest";
import { boundedVocabulary } from "./bounded-vocabulary";
import { searchChoices } from "./search-destination";

const CITIES = [
  { id: "area-ccs", name: "Distrito Capital" },
  { id: "area-mcbo", name: "Maracaibo" },
];

/**
 * El catálogo entero tal como llega a la pantalla de resultados: miles de
 * filas, con la parroquia de cada una ya unida por el adaptador.
 */
const ZONES = [
  { id: "z-altamira", name: "Altamira", cityId: "area-ccs", parentName: "Chacao" },
  { id: "z-chacao", name: "Chacao", cityId: "area-ccs", parentName: "Chacao" },
  { id: "z-centro-ccs", name: "Centro", cityId: "area-ccs", parentName: "Catedral" },
  { id: "z-centro-mcbo", name: "Centro", cityId: "area-mcbo", parentName: "Coquivacoa" },
];

describe("boundedVocabulary", () => {
  /**
   * **Sólo las zonas con avisos activos** (14.51). Es la forma de la 14.35 que
   * sí entra: la taxonomía entera son 4.710 topónimos / 89,8 KB gzip contra
   * unos 20 KB de margen, y sugerir una zona vacía manda a una pantalla sin
   * salida (regla transversal 4). Recortar por ahí no es una degradación.
   */
  it("ofrece las zonas que el conteo nombra y descarta las demás", () => {
    const vocabulary = boundedVocabulary(CITIES, ZONES, { "z-altamira": 9, "z-chacao": 0 });

    expect(vocabulary.zones.map((zone) => zone.name)).toEqual(["Altamira"]);
  });

  it("cada zona ofrecida lleva su conteo", () => {
    const vocabulary = boundedVocabulary(CITIES, ZONES, { "z-altamira": 9 });

    expect(vocabulary.zones[0]?.count).toBe(9);
  });

  /**
   * **La parroquia sigue viajando, y no es decoración**: es lo que desambigua
   * un nombre repetido, que es la regla de la 14.18 — `Centro` existe en
   * Maracaibo y en Distrito Capital.
   */
  it("conserva la parroquia, que es lo que desambigua un nombre repetido", () => {
    const vocabulary = boundedVocabulary(CITIES, ZONES, {
      "z-centro-ccs": 4,
      "z-centro-mcbo": 2,
    });

    expect(
      searchChoices("centro", vocabulary).map((choice) => `${choice.scope} ${choice.countLabel}`),
    ).toEqual(["Catedral · Distrito Capital 4", "Coquivacoa · Maracaibo 2"]);
  });

  /**
   * **Sin alias, y está dicho en vez de escondido.** Los 4.710 alias del
   * «Índice de topónimos» no están en la pantalla de resultados: traerlos
   * costaría una consulta más en la ruta más transitada del producto. La
   * consecuencia es exactamente la que la 14.51 acepta por escrito — con el
   * script cargado se sugiere MENOS que lo que el servidor encuentra al
   * enviar—, y el piso no cambia: `resolveSearchDestination` sigue resolviendo
   * en el servidor sobre el vocabulario completo.
   */
  it("no lleva alias: el servidor los sigue encontrando al enviar", () => {
    expect(boundedVocabulary(CITIES, ZONES, { "z-altamira": 9 }).aliases).toEqual([]);
  });

  /**
   * **El aislamiento de ciudad no se vuelve a decidir acá** (D5/F2). Entra lo
   * que el conteo nombra, y el conteo pertenece a la ciudad del criterio: una
   * segunda regla de ciudad escrita en esta función sería una segunda
   * oportunidad de escribirla mal.
   */
  it("una ciudad sin conteos no aporta una sola zona", () => {
    const vocabulary = boundedVocabulary(CITIES, ZONES, { "z-altamira": 9, "z-centro-ccs": 3 });

    expect(vocabulary.zones.every((zone) => zone.cityId === "area-ccs")).toBe(true);
  });

  /**
   * **Lo que se ofrece viaja al navegador, así que se escribe campo por campo y
   * nunca con un `...zone`.**
   *
   * No es higiene: el catálogo trae `kind` y `category` —«elemento»,
   * «urbanizacion»— que ninguna sugerencia usa, y un `spread` los copiaba a los
   * dos en cada zona del vocabulario serializado. **Se descubrió midiendo**, no
   * revisando: leyendo el marcado servido de `/alquiler/distrito-capital` con
   * la aplicación compilada, donde estaban escritos.
   */
  it("no le manda al navegador un solo campo que las sugerencias no usen", () => {
    const conBasura = ZONES.map((zone) => ({
      ...zone,
      kind: "elemento",
      category: "urbanizacion",
    }));

    expect(
      Object.keys(boundedVocabulary(CITIES, conBasura, { "z-altamira": 9 }).zones[0] ?? {}),
    ).toEqual(["id", "name", "cityId", "parentName", "count"]);
  });

  /**
   * Las ciudades van enteras aunque no tengan conteo: son dos filas, y son lo
   * que el dominio ofrece cuando alguien escribió filtros sin nombrar un lugar
   * («apartamento amoblado»). Es la misma decisión que `DrizzleSearchVocabulary`
   * ya tomó del lado del servidor.
   */
  it("las dos ciudades del producto van siempre", () => {
    expect(boundedVocabulary(CITIES, ZONES, {}).cities).toEqual(CITIES);
  });
});
