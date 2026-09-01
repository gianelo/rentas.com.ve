import { describe, expect, it } from "vitest";
import { parseStoredDraft } from "./draft";

/**
 * Lo que queda de las dos cookies: **decodificar, y nada más** (tasks.md 18.30).
 *
 * La lista blanca —qué campos se aceptan y con qué tipo— se mudó al dominio
 * (`stored-draft.ts`), donde la usan las DOS puertas: esta cookie y la fila de
 * `publish_draft`. Sus pruebas se mudaron con ella. Acá quedan las tres cosas
 * que son de la cookie y de ninguna otra fuente: base64url que puede llegar
 * truncado, la descripción que viaja en la segunda cookie, y que ninguna de las
 * dos cosas pueda reventar el render.
 *
 * Lo que se fue con `serialiseStoredDraft`: la prueba de los treinta minutos y
 * la del peor caso de 4 KB. Las dos medían una cookie que ya nadie escribe.
 */

const encode = (json: string) => Buffer.from(json, "utf8").toString("base64url");

describe("las dos cookies del puente", () => {
  it.each([
    ["nada", undefined],
    ["una cadena vacia", ""],
    ["texto que no decodifica a nada util", "no-soy-json"],
    ["algo que no es un objeto", Buffer.from("42").toString("base64url")],
  ])("devuelve null para %s en vez de reventar", (_caso, raw) => {
    // Una cookie truncada o editada a mano deja un formulario vacio, que se
    // puede recuperar. Un error deja un 500, que no.
    expect(parseStoredDraft(raw, undefined)).toBeNull();
  });

  it("la descripcion viene de la segunda cookie y se pega al aviso", () => {
    const parsed = parseStoredDraft(
      encode('{"listing":{"title":"Real"},"photos":[]}'),
      encode('"Un texto largo"'),
    );

    expect(parsed?.listing).toEqual({ title: "Real", description: "Un texto largo" });
  });

  it("una descripcion ausente, vacia o ilegible no inventa el campo", () => {
    const cuerpo = encode('{"listing":{"title":"Real"},"photos":[]}');

    for (const texto of [undefined, encode('""'), "no-soy-json"]) {
      expect(parseStoredDraft(cuerpo, texto)?.listing).toEqual({ title: "Real" });
    }
  });
});
