import { describe, expect, it } from "vitest";
import { contactDoorFor, DOOR_OPEN_TOKEN, DOOR_QUERY_NAME, doorHrefFor } from "./sign-in-door";

const DUENO = { type: "owner" as const, name: "María F." };
const CON_LLAVE = { state: "locked" as const, method: "whatsapp" as const };

describe("la puerta del contacto se abre por la dirección (15.8)", () => {
  /**
   * El arreglo es lo que Next entrega con el parámetro repetido: se cierra,
   * porque quien lo repite no está tocando el botón y una puerta que aparece
   * con entradas que nadie dibujó es una puerta que nadie sabe cuándo sale.
   */
  it("está cerrada mientras el parámetro no traiga el token exacto", () => {
    expect(DOOR_QUERY_NAME).toBe("entrar");
    expect(contactDoorFor(CON_LLAVE, DUENO, undefined)).toBeNull();
    expect(contactDoorFor(CON_LLAVE, DUENO, "")).toBeNull();
    expect(contactDoorFor(CON_LLAVE, DUENO, "no")).toBeNull();
    expect(contactDoorFor(CON_LLAVE, DUENO, `${DOOR_OPEN_TOKEN}x`)).toBeNull();
    expect(contactDoorFor(CON_LLAVE, DUENO, [DOOR_OPEN_TOKEN, DOOR_OPEN_TOKEN])).toBeNull();
  });

  it("se abre con el token exacto y nombra a quien publica", () => {
    const puerta = contactDoorFor(CON_LLAVE, DUENO, DOOR_OPEN_TOKEN);

    expect(puerta?.title).toBe("Entrá para ver el WhatsApp de María F.");
    expect(puerta?.stayLabel).toBe("Seguir mirando sin entrar");
    expect(puerta?.assurance).toBe("Volvés a este mismo aviso al terminar.");
  });

  /** El canal sale del método, y el papel sale del tipo cuando no hay nombre. */
  it("dice el canal del aviso y el papel de quien publica", () => {
    const porTelefono = contactDoorFor(
      { state: "locked", method: "telefono" },
      DUENO,
      DOOR_OPEN_TOKEN,
    );
    const sinNombre = (type: "owner" | "broker") =>
      contactDoorFor(CON_LLAVE, { type, name: null }, DOOR_OPEN_TOKEN)?.title;

    expect(porTelefono?.title).toBe("Entrá para ver el teléfono de María F.");
    // «de el dueño» no es una frase: la contracción va adentro de la regla.
    expect(sinNombre("owner")).toBe("Entrá para ver el WhatsApp del dueño");
    expect(sinNombre("broker")).toBe("Entrá para ver el WhatsApp de la inmobiliaria");
  });

  /**
   * **Cierra con llave, no por costumbre.** El token lo escribe cualquiera; si
   * el contacto ya está a la vista o el aviso venció, una puerta encima sería
   * un muro delante de algo abierto.
   */
  it("no se abre sobre un contacto que ya no tiene llave", () => {
    const revelado = { state: "revealed" as const, method: "whatsapp" as const, value: "+58…" };

    expect(contactDoorFor(revelado, DUENO, DOOR_OPEN_TOKEN)).toBeNull();
    expect(contactDoorFor({ state: "expired" }, DUENO, DOOR_OPEN_TOKEN)).toBeNull();
  });
});

describe("la dirección que abre la puerta (15.8)", () => {
  const FICHA = "/alquiler/maracaibo/tierra-negra/aviso";

  /**
   * **Conserva el origen de la búsqueda** (16.9): son dos vueltas anidadas, y
   * pisar la de afuera deja a quien entró volviendo a un aviso que ya no sabe
   * a qué búsqueda pertenecía. Aplicada dos veces da lo mismo.
   */
  it("cuelga el parámetro de la ficha sin pisar lo que ya llevaba", () => {
    expect(doorHrefFor(FICHA)).toBe(`${FICHA}?entrar=si`);
    expect(doorHrefFor(`${FICHA}?desde=%2Fmaracaibo`)).toBe(
      `${FICHA}?desde=%2Fmaracaibo&entrar=si`,
    );
    expect(doorHrefFor(doorHrefFor(FICHA))).toBe(doorHrefFor(FICHA));
  });
});
