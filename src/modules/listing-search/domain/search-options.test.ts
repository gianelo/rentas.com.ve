import { describe, expect, it } from "vitest";
import {
  resolveAttributeOptions,
  resolveBathroomOptions,
  resolveRoomOptions,
  resolveZoneOptions,
} from "./search-options";

const ZONES = [
  { id: "chacao", name: "Chacao" },
  { id: "altamira", name: "Altamira" },
  { id: "castellana", name: "La Castellana" },
  { id: "rosal", name: "El Rosal" },
];

const BY_ZONE = { chacao: 12, altamira: 9, castellana: 7, rosal: 0 };

describe("las zonas ofrecidas (F4)", () => {
  it("cada una lleva su conteo real", () => {
    const options = resolveZoneOptions(ZONES, BY_ZONE, []);

    expect(options.find((option) => option.id === "chacao")?.count).toBe(12);
    expect(options.find((option) => option.id === "castellana")?.count).toBe(7);
  });

  it("las elegidas van primero, en el orden en que se eligieron", () => {
    const options = resolveZoneOptions(ZONES, BY_ZONE, ["altamira", "chacao"]);

    expect(options.map((option) => option.id)).toEqual([
      "altamira",
      "chacao",
      "castellana",
      "rosal",
    ]);
  });

  it("las que no se eligieron mantienen el orden del catálogo", () => {
    expect(resolveZoneOptions(ZONES, BY_ZONE, []).map((option) => option.id)).toEqual([
      "chacao",
      "altamira",
      "castellana",
      "rosal",
    ]);
  });

  it("una zona sin avisos se ofrece igual, y no lleva número", () => {
    // Regla transversal 4 del otro lado: la opción existe para que se vea que
    // ahí no hay nada, y un «0» al lado se lee como un conteo roto.
    const rosal = resolveZoneOptions(ZONES, BY_ZONE, []).find((option) => option.id === "rosal");

    expect(rosal?.count).toBe(0);
    expect(rosal?.countLabel).toBeNull();
    expect(rosal?.disabled).toBe(true);
  });

  it("una zona elegida se puede soltar aunque su conteo sea cero", () => {
    const rosal = resolveZoneOptions(ZONES, BY_ZONE, ["rosal"]).find(
      (option) => option.id === "rosal",
    );

    expect(rosal?.chosen).toBe(true);
    expect(rosal?.disabled).toBe(false);
  });

  it("una zona que el conteo no menciona vale cero, no `undefined`", () => {
    const options = resolveZoneOptions([{ id: "nueva", name: "Nueva" }], {}, []);

    expect(options[0]?.count).toBe(0);
  });
});

describe("los escalones de habitaciones (F6)", () => {
  const BY_ROOMS = { 1: 16, 2: 9, 3: 4, 4: 0 } as const;

  it("son los cuatro del dominio, con el «+» del último", () => {
    const options = resolveRoomOptions(BY_ROOMS, undefined);

    expect(options.map((option) => option.label)).toEqual(["1", "2", "3", "4+"]);
  });

  it("cada uno dice cuántos habría SI se eligiera", () => {
    const options = resolveRoomOptions(BY_ROOMS, 2);

    // La faceta se cuenta sin su propio filtro: con «2» elegido, el número al
    // lado de «3» es cuántos habría si se cambiara, no cero.
    expect(options.find((option) => option.step === 3)?.count).toBe(4);
  });

  it("la selección es única: sólo uno queda elegido", () => {
    const chosen = resolveRoomOptions(BY_ROOMS, 2).filter((option) => option.chosen);

    expect(chosen.map((option) => option.step)).toEqual([2]);
  });

  it("volver a tocar el elegido lo suelta", () => {
    const options = resolveRoomOptions(BY_ROOMS, 2);

    expect(options.find((option) => option.step === 2)?.nextValue).toBeNull();
    expect(options.find((option) => option.step === 3)?.nextValue).toBe("3");
  });

  it("un escalón sin resultados queda deshabilitado: ninguna opción lleva a un vacío", () => {
    expect(resolveRoomOptions(BY_ROOMS, undefined).find((o) => o.step === 4)?.disabled).toBe(true);
  });

  it("el escalón elegido nunca se deshabilita, porque habría que poder soltarlo", () => {
    expect(
      resolveRoomOptions({ 1: 0, 2: 0, 3: 0, 4: 0 }, 2).find((o) => o.step === 2)?.disabled,
    ).toBe(false);
  });
});

describe("los escalones de baños (14.45, lámina 7b)", () => {
  const BY_BATHROOMS = { 1: 16, 2: 9, 3: 0 } as const;

  it("son los tres del dominio, con el «+» del último", () => {
    expect(resolveBathroomOptions(BY_BATHROOMS, undefined).map((option) => option.label)).toEqual([
      "1",
      "2",
      "3+",
    ]);
  });

  it("cada uno dice cuántos habría SI se eligiera, contado sin su propio filtro", () => {
    expect(resolveBathroomOptions(BY_BATHROOMS, 1).find((option) => option.step === 2)?.count).toBe(
      9,
    );
  });

  it("la selección es única y volver a tocar el elegido lo suelta", () => {
    const options = resolveBathroomOptions(BY_BATHROOMS, 2);

    expect(options.filter((option) => option.chosen).map((option) => option.step)).toEqual([2]);
    expect(options.find((option) => option.step === 2)?.nextValue).toBeNull();
    expect(options.find((option) => option.step === 1)?.nextValue).toBe("1");
  });

  it("un escalón sin resultados queda deshabilitado, y el elegido nunca", () => {
    expect(
      resolveBathroomOptions(BY_BATHROOMS, undefined).find((o) => o.step === 3)?.disabled,
    ).toBe(true);
    expect(resolveBathroomOptions(BY_BATHROOMS, 3).find((o) => o.step === 3)?.disabled).toBe(false);
  });
});

describe("los atributos declarados (F6)", () => {
  const BY_ATTRIBUTE = {
    hasPowerPlant: 9,
    hasRegularWater: 12,
    isFurnished: 4,
    hasSecurity: 0,
    hasAppliances: 3,
  };

  it("son los cinco del dominio, con su etiqueta legible", () => {
    const options = resolveAttributeOptions(BY_ATTRIBUTE, 16, []);

    expect(options).toHaveLength(5);
    expect(options[0]?.label).toBe("Planta eléctrica");
  });

  it("cada uno dice cuántos lo cumplen sobre el total", () => {
    const planta = resolveAttributeOptions(BY_ATTRIBUTE, 16, []).find(
      (option) => option.attribute === "hasPowerPlant",
    );

    expect(planta?.count).toBe(9);
    expect(planta?.note).toBe("9 de 16");
  });

  it("el que ningún resultado cumple queda deshabilitado, con su cero a la vista", () => {
    // F6, textual: «con cero queda deshabilitado». Y el cero SÍ se muestra:
    // es la respuesta a "¿por qué no puedo tocar esto?".
    const vigilancia = resolveAttributeOptions(BY_ATTRIBUTE, 16, []).find(
      (option) => option.attribute === "hasSecurity",
    );

    expect(vigilancia?.disabled).toBe(true);
    expect(vigilancia?.note).toBe("0 de 16");
  });

  it("uno ya marcado nunca se deshabilita: habría que poder desmarcarlo", () => {
    const vigilancia = resolveAttributeOptions(BY_ATTRIBUTE, 16, ["hasSecurity"]).find(
      (option) => option.attribute === "hasSecurity",
    );

    expect(vigilancia?.chosen).toBe(true);
    expect(vigilancia?.disabled).toBe(false);
  });

  it("se combinan con Y: marcar dos deja los dos marcados", () => {
    const chosen = resolveAttributeOptions(BY_ATTRIBUTE, 16, [
      "hasPowerPlant",
      "hasRegularWater",
    ]).filter((option) => option.chosen);

    expect(chosen.map((option) => option.attribute)).toEqual(["hasPowerPlant", "hasRegularWater"]);
  });

  it("marcar un atributo no desmarca al anterior", () => {
    // El de la mutación: con O, o con selección única, acá habría uno solo.
    expect(
      resolveAttributeOptions(BY_ATTRIBUTE, 16, ["hasPowerPlant", "isFurnished"]).filter(
        (option) => option.chosen,
      ),
    ).toHaveLength(2);
  });

  it("el próximo valor apaga el que está puesto y prende el que no", () => {
    const options = resolveAttributeOptions(BY_ATTRIBUTE, 16, ["hasPowerPlant"]);

    expect(options.find((o) => o.attribute === "hasPowerPlant")?.nextValue).toBeNull();
    expect(options.find((o) => o.attribute === "isFurnished")?.nextValue).toBe("1");
  });
});
