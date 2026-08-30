import { describe, expect, it } from "vitest";
import {
  LISTING_VIOLATION_FIELD,
  type ListingField,
  placeListingEditViolations,
} from "./violation-field";

/**
 * tasks.md 18.22 — **a qué campo pertenece cada negativa.**
 *
 * La pregunta es del producto, no del pixel: decide dónde se lee el mensaje y,
 * cuando no hay dónde, decide que igual se lea. Por eso vive acá y bajo el
 * piso del 90 %, y no adentro de la pantalla que lo dibuja (AGENTS.md §1).
 */

describe("el campo que produjo cada negativa (18.22)", () => {
  /**
   * El hueco que la tarea nombraba: `PUBLISH_VIOLATION_COPY` es un `Record`
   * sobre la unión de publicar y `publisherType.immutable` no está adentro, así
   * que ese código no tenía campo y era el único que no podía colocarse.
   */
  it("«no se puede cambiar quién publica» pertenece a quién publica", () => {
    expect(LISTING_VIOLATION_FIELD["publisherType.immutable"]).toBe("publisherType");
  });

  /**
   * Y los compartidos siguen diciendo lo mismo que decían: esta tabla no es una
   * segunda lista al lado de la de publicar, es la ÚNICA — `violation-copy.ts`
   * dejó de llevar `field` el mismo día que ésta apareció.
   */
  it("los códigos de publicar conservan el campo que ya tenían", () => {
    expect(LISTING_VIOLATION_FIELD["description.tooShort"]).toBe("description");
    expect(LISTING_VIOLATION_FIELD["zoneId.notInCity"]).toBe("zoneId");
    expect(LISTING_VIOLATION_FIELD["photos.tooMany"]).toBe("photos");
    expect(LISTING_VIOLATION_FIELD["parkingSpots.invalid"]).toBe("parkingSpots");
  });
});

describe("dónde va cada negativa de una edición (18.22)", () => {
  /**
   * Los nueve campos que un pedido de edición puede traer —los ocho que
   * escribe más `publisherType`, que viaja para ser rechazado— tienen dónde
   * leerse en la pantalla, así que el mensaje va ahí.
   */
  it("una negativa sobre un campo que la edición manda se coloca al lado de ese campo", () => {
    const placed = placeListingEditViolations([
      "priceUsd.invalid",
      "contactValue.invalid",
      "publisherType.immutable",
    ]);

    expect(placed.byField.get("priceUsd")).toBe("priceUsd.invalid");
    expect(placed.byField.get("contactValue")).toBe("contactValue.invalid");
    expect(placed.byField.get("publisherType")).toBe("publisherType.immutable");
    expect(placed.elsewhere).toEqual([]);
  });

  /**
   * **El par de la anterior, y existe porque una sola afirmación aceptaría las
   * dos respuestas.** Una edición no manda fotos, ni zona, ni ciudad, ni tipo
   * de inmueble, ni puestos: si el validador se queja de alguno, no hay campo
   * al lado del cual ponerlo. Se dice aparte en vez de tragarse, que es la
   * diferencia entre una negativa y un formulario que se niega en silencio
   * (AGENTS.md §7).
   */
  it("una negativa sobre algo que la edición no manda no tiene campo, y no se pierde", () => {
    const placed = placeListingEditViolations([
      "photos.required",
      "zoneId.notInCity",
      "cityId.unknown",
      "propertyType.invalid",
      "parkingSpots.invalid",
    ]);

    expect(placed.byField.size).toBe(0);
    expect(placed.elsewhere).toEqual([
      "photos.required",
      "zoneId.notInCity",
      "cityId.unknown",
      "propertyType.invalid",
      "parkingSpots.invalid",
    ]);
  });

  /**
   * Los códigos vuelven en la dirección porque sin JavaScript no hay otro lugar
   * donde devolverle la negativa a la pantalla, así que una dirección escrita a
   * mano es dato de afuera. Un código que esta tabla no conoce no tiene campo y
   * tampoco se descarta: sale entero, igual que ya hace
   * `listingEditViolationMessage` con su `?? violation`.
   */
  it("un código inventado no se coloca en ningún campo, y tampoco se traga", () => {
    const placed = placeListingEditViolations(["precio.regalado"]);

    expect(placed.byField.size).toBe(0);
    expect(placed.elsewhere).toEqual(["precio.regalado"]);
  });

  /**
   * Un campo, un mensaje: la misma regla que `errorsByField` ya aplica en los
   * nueve pasos. Dos frases apiladas sobre un control se leen como dos
   * problemas cuando son el mismo campo mal cargado.
   */
  it("dos negativas del mismo campo dejan la primera, no las dos", () => {
    const placed = placeListingEditViolations(["title.required", "title.tooLong"]);

    expect(placed.byField.get("title")).toBe("title.required");
    expect(placed.byField.size).toBe(1);
    expect(placed.elsewhere).toEqual([]);
  });

  /** Sin negativas no hay nada colocado ni nada aparte: el silencio no miente. */
  it("sin negativas no coloca nada", () => {
    const placed = placeListingEditViolations([]);

    expect(placed.byField.size).toBe(0);
    expect(placed.elsewhere).toEqual([]);
  });

  /**
   * El orden en que llegan es el orden en que se leen: el dominio los devuelve
   * en el orden que `validatePublishableListing` los produjo, y reordenarlos
   * acá inventaría una prioridad que nadie decidió.
   */
  it("respeta el orden en que el dominio los produjo", () => {
    const placed = placeListingEditViolations([
      "photos.required",
      "title.required",
      "cityId.unknown",
    ]);

    expect(placed.elsewhere).toEqual(["photos.required", "cityId.unknown"]);
    const fields: readonly ListingField[] = [...placed.byField.keys()];
    expect(fields).toEqual(["title"]);
  });
});
