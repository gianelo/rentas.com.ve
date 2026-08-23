import { describe, expect, it } from "vitest";
import { resolveZoneTokens, toSearchZones, zoneMatchesToken } from "./zone-catalogue";

const MARACAIBO = "city-maracaibo";
const DISTRITO = "city-distrito";

/**
 * Ids con forma de hash, que es como los emite `territoryId` de verdad. Los
 * ids legibles de otros fixtures («chacao») escondían el defecto: con un id
 * que ya parece un slug, una dirección armada con ids se lee igual de bien
 * que una armada con slugs.
 *
 * **Y las dos ciudades tienen un «Centro»**, que es la trampa real: un slug
 * solo no las distingue.
 */
const CATALOGUE = [
  { id: "9f1c0d2e-0000-4000-8000-000000000001", cityId: MARACAIBO, name: "Centro" },
  { id: "9f1c0d2e-0000-4000-8000-000000000002", cityId: MARACAIBO, name: "Norte" },
  { id: "4da5ef52-0000-4000-8000-000000000003", cityId: DISTRITO, name: "Centro" },
  { id: "4da5ef52-0000-4000-8000-000000000004", cityId: DISTRITO, name: "La Castellana" },
] as const;

const ZONES = toSearchZones(CATALOGUE);

describe("el slug es un dato del dominio, no un formateo de la página", () => {
  it("sale del nombre y conserva el id, que es la clave real", () => {
    expect(ZONES[0]).toEqual({
      id: "9f1c0d2e-0000-4000-8000-000000000001",
      cityId: MARACAIBO,
      name: "Centro",
      slug: "centro",
    });
  });

  it("normaliza acentos y espacios igual que la ruta canónica", () => {
    expect(toSearchZones([{ id: "z", cityId: "c", name: "La Castellana" }])[0]?.slug).toBe(
      "la-castellana",
    );
    expect(toSearchZones([{ id: "z", cityId: "c", name: "Cañaveral" }])[0]?.slug).toBe("canaveral");
  });
});

describe("qué zona nombra un valor de `?zona=`", () => {
  it("reconoce el slug, que es la forma canónica (F12)", () => {
    expect(zoneMatchesToken({ id: "abc", slug: "chacao" }, "chacao")).toBe(true);
  });

  it("sigue reconociendo el id, porque hay direcciones compartidas que lo llevan", () => {
    expect(zoneMatchesToken({ id: "abc", slug: "chacao" }, "abc")).toBe(true);
  });

  it("no reconoce nada más", () => {
    expect(zoneMatchesToken({ id: "abc", slug: "chacao" }, "Chacao")).toBe(false);
    expect(zoneMatchesToken({ id: "abc", slug: "chacao" }, "")).toBe(false);
  });
});

describe("dos zonas homónimas — «Centro» en Maracaibo y en Distrito Capital", () => {
  it("el slug las distingue DENTRO de su ciudad, y la ciudad siempre está en la ruta", () => {
    expect(resolveZoneTokens(["centro"], ZONES, MARACAIBO).map((zone) => zone.id)).toEqual([
      "9f1c0d2e-0000-4000-8000-000000000001",
    ]);
    expect(resolveZoneTokens(["centro"], ZONES, DISTRITO).map((zone) => zone.id)).toEqual([
      "4da5ef52-0000-4000-8000-000000000003",
    ]);
  });

  it("nunca devuelve la homónima de la otra ciudad", () => {
    // Sería mandar a alguien a mirar apartamentos a mil kilómetros, y sin
    // ninguna señal en pantalla de por qué.
    const resolved = resolveZoneTokens(["centro"], ZONES, MARACAIBO);

    expect(resolved).toHaveLength(1);
    expect(resolved[0]?.cityId).toBe(MARACAIBO);
  });

  it("un id de la otra ciudad se cae, igual que su slug", () => {
    expect(resolveZoneTokens(["4da5ef52-0000-4000-8000-000000000003"], ZONES, MARACAIBO)).toEqual(
      [],
    );
  });
});

describe("resolver la lista entera de `?zona=`", () => {
  it("respeta el orden en que la dirección las nombra", () => {
    expect(resolveZoneTokens(["norte", "centro"], ZONES, MARACAIBO).map((z) => z.slug)).toEqual([
      "norte",
      "centro",
    ]);
  });

  it("mezcla las dos formas sin duplicar la misma zona", () => {
    // Una dirección vieja pegada en un chat, refinada después con un enlace
    // nuevo: el id y el slug de la misma zona conviven en el mismo parámetro.
    const resolved = resolveZoneTokens(
      ["9f1c0d2e-0000-4000-8000-000000000001", "centro"],
      ZONES,
      MARACAIBO,
    );

    expect(resolved.map((zone) => zone.id)).toEqual(["9f1c0d2e-0000-4000-8000-000000000001"]);
  });

  it("descarta lo que no nombra ninguna zona y deja viva el resto", () => {
    expect(resolveZoneTokens(["inventada", "norte"], ZONES, MARACAIBO).map((z) => z.slug)).toEqual([
      "norte",
    ]);
  });
});
