import { describe, expect, it } from "vitest";
import {
  countPillFilters,
  PANEL_OPEN_TOKEN,
  readSearchStep,
  resolveFilterPanel,
  resolveSearchSteps,
  SEARCH_STEPS,
  type SearchSelection,
  STALE_FILTER_GROUP_NOTICE,
  searchHeadline,
} from "./search-accordion";

const CARACAS: SearchSelection = { cityName: "Distrito Capital", zoneNames: [] };

function step(
  selection: SearchSelection,
  id: string,
  open?: Parameters<typeof resolveSearchSteps>[1],
) {
  const found = resolveSearchSteps(selection, open).find((candidate) => candidate.id === id);
  if (!found) throw new Error(`el paso ${id} no existe`);
  return found;
}

describe("los cuatro grupos, y su orden (14.32, 14.36)", () => {
  it("son precio, habitaciones, quién publica y atributos — ciudad y zona ya no están", () => {
    // La 14.36 sacó la ubicación del panel («vive SOLO en la ruta»), y lo que
    // queda son los cuatro grupos que la lámina 7b dibuja a la vez en 1280.
    expect(SEARCH_STEPS).toEqual(["precio", "habitaciones", "publica", "atributos"]);
  });

  it("cada grupo lleva su número, y el número sale de la lista", () => {
    expect(resolveSearchSteps(CARACAS).map((view) => view.position)).toEqual([1, 2, 3, 4]);
  });

  it("lee el grupo de la dirección y descarta lo que no es un grupo", () => {
    expect(readSearchStep("precio")).toBe("precio");
    expect(readSearchStep("  atributos  ")).toBe("atributos");
    expect(readSearchStep("constructor")).toBeUndefined();
    expect(readSearchStep("")).toBeUndefined();
    expect(readSearchStep(undefined)).toBeUndefined();
  });

  it("«ciudad» y «zona» dejaron de ser grupos: una dirección vieja no los reabre", () => {
    expect(readSearchStep("ciudad")).toBeUndefined();
    expect(readSearchStep("zona")).toBeUndefined();
  });
});

/**
 * **El panel es un estado de la página que decide la dirección** (14.33).
 *
 * Al perder la barra lateral, los filtros llegan sólo por el control de la
 * pastilla — y ése es `filtersHref`, *"la misma URL con el panel abierto desde
 * el servidor"* (14i). Así que "abierto" tiene que ser una lectura de la
 * dirección y no un manejador de clic: un panel que sólo existe cuando llega un
 * script deja sin filtros a quien se quedó sin bundle (D13).
 */
describe("si el panel está abierto lo dice la dirección (14.33)", () => {
  it("sin el parámetro el panel está cerrado", () => {
    expect(resolveFilterPanel(undefined)).toEqual({ open: false, notice: null });
    expect(resolveFilterPanel(null)).toEqual({ open: false, notice: null });
  });

  it("presente pero vacío tampoco lo abre: es un campo que nadie llenó", () => {
    expect(resolveFilterPanel("   ")).toEqual({ open: false, notice: null });
  });

  it("el token del filtro de la pastilla lo abre sin fijar ningún grupo", () => {
    // Sin grupo pedido, `resolveSearchSteps` abre el primero sin contestar —
    // que es lo que hace avanzar solo al acordeón del teléfono.
    expect(resolveFilterPanel(PANEL_OPEN_TOKEN)).toEqual({ open: true, notice: null });
  });

  it("un grupo nombrado lo abre en ese grupo", () => {
    expect(resolveFilterPanel("atributos")).toEqual({
      open: true,
      step: "atributos",
      notice: null,
    });
  });

  it("un grupo que ya no existe se ignora CON aviso, y el panel abre igual", () => {
    // Es el enlace viejo de `?filtros=zona` pegado en un chat: romperle la
    // página a alguien por eso es peor que abrirle el panel y explicarlo
    // (14.23b).
    expect(resolveFilterPanel("zona")).toEqual({
      open: true,
      notice: STALE_FILTER_GROUP_NOTICE,
    });
  });
});

describe("un solo grupo abierto a la vez en el teléfono (acordeón secuencial)", () => {
  it("abre el que pide la dirección", () => {
    const open = resolveSearchSteps(CARACAS, "atributos").filter((view) => view.open);

    expect(open.map((view) => view.id)).toEqual(["atributos"]);
  });

  it("sin nada pedido abre el primero sin contestar", () => {
    const open = resolveSearchSteps(CARACAS).filter((view) => view.open);

    expect(open.map((view) => view.id)).toEqual(["precio"]);
  });

  it("con el precio puesto sigue con las habitaciones", () => {
    const open = resolveSearchSteps({ ...CARACAS, maxPriceUsd: 700 }).filter((view) => view.open);

    expect(open.map((view) => view.id)).toEqual(["habitaciones"]);
  });

  it("con todo contestado no queda ninguno abierto", () => {
    const open = resolveSearchSteps({
      ...CARACAS,
      maxPriceUsd: 700,
      minRooms: 2,
      publisherType: "owner",
      attributes: ["hasPowerPlant"],
    }).filter((view) => view.open);

    expect(open).toEqual([]);
  });

  it("nunca hay dos abiertos, ni siquiera pidiendo el que ya está contestado", () => {
    const open = resolveSearchSteps({ ...CARACAS, maxPriceUsd: 700 }, "precio").filter(
      (view) => view.open,
    );

    expect(open.map((view) => view.id)).toEqual(["precio"]);
  });
});

describe("cada grupo cerrado muestra lo elegido", () => {
  it("el precio dice el rango, o de qué lado está abierto", () => {
    expect(step(CARACAS, "precio").summary).toBe("Cualquiera");
    expect(step(CARACAS, "precio").answered).toBe(false);
    expect(step({ ...CARACAS, minPriceUsd: 250, maxPriceUsd: 700 }, "precio").summary).toBe(
      "$250 – $700",
    );
    expect(step({ ...CARACAS, minPriceUsd: 250 }, "precio").summary).toBe("Desde $250");
    expect(step({ ...CARACAS, maxPriceUsd: 700 }, "precio").summary).toBe("Hasta $700");
  });

  it("las habitaciones dicen el escalón, y el último dice «o más»", () => {
    expect(step(CARACAS, "habitaciones").summary).toBe("Cualquiera");
    expect(step({ ...CARACAS, minRooms: 2 }, "habitaciones").summary).toBe("2 hab");
    expect(step({ ...CARACAS, minRooms: 4 }, "habitaciones").summary).toBe("4+ hab");
  });

  /**
   * **Los baños viven en el MISMO grupo que las habitaciones** (14.45): el
   * fundador lo llamó «tamaño» y la lámina 7b los dibuja en una sola columna,
   * uno debajo del otro. Por eso el resumen del grupo cerrado tiene que decir
   * los dos — con sólo «2 hab» encima de un grupo que además filtra baños, el
   * renglón del acordeón esconde justo el filtro que alguien acaba de poner.
   */
  it("el grupo del tamaño resume habitaciones Y baños, y el «3+» dice «o más»", () => {
    expect(step({ ...CARACAS, minBathrooms: 1 }, "habitaciones").summary).toBe("1 baño");
    expect(step({ ...CARACAS, minBathrooms: 3 }, "habitaciones").summary).toBe("3+ baños");
    expect(step({ ...CARACAS, minRooms: 2, minBathrooms: 2 }, "habitaciones").summary).toBe(
      "2 hab · 2 baños",
    );
  });

  it("el grupo queda contestado con los baños solos, sin habitaciones", () => {
    expect(step({ ...CARACAS, minBathrooms: 2 }, "habitaciones").answered).toBe(true);
    expect(step(CARACAS, "habitaciones").answered).toBe(false);
  });

  it("quién publica dice a quién, con las mismas palabras que el resumen", () => {
    expect(step(CARACAS, "publica").summary).toBe("Cualquiera");
    expect(step(CARACAS, "publica").answered).toBe(false);
    expect(step({ ...CARACAS, publisherType: "owner" }, "publica").summary).toBe("dueños");
    expect(step({ ...CARACAS, publisherType: "owner" }, "publica").answered).toBe(true);
  });

  it("los atributos se nombran todos: se combinan con Y y cada uno estrecha", () => {
    expect(step(CARACAS, "atributos").summary).toBe("Cualquiera");
    const view = step({ ...CARACAS, attributes: ["hasPowerPlant", "hasSecurity"] }, "atributos");
    expect(view.summary).toBe("planta · vigilancia");
    expect(view.answered).toBe(true);
  });

  it("cada grupo lleva su pregunta y su título, tal como los dibuja la lámina 7b", () => {
    expect(step(CARACAS, "precio").title).toBe("Precio");
    expect(step(CARACAS, "precio").question).toBe("¿Cuánto podés pagar al mes?");
    expect(step(CARACAS, "habitaciones").title).toBe("Habitaciones");
    expect(step(CARACAS, "habitaciones").question).toBe("¿Cuántas habitaciones?");
    expect(step(CARACAS, "publica").title).toBe("Quién publica");
    expect(step(CARACAS, "publica").question).toBe("¿Quién publica el aviso?");
    expect(step(CARACAS, "atributos").title).toBe("La propiedad tiene");
    expect(step(CARACAS, "atributos").question).toBe("¿Qué tiene que tener?");
  });
});

describe("la barra resumen de resultados", () => {
  it("encabeza con las zonas elegidas, y con la ciudad si no hay ninguna", () => {
    expect(searchHeadline({ ...CARACAS, zoneNames: ["Chacao", "Altamira"] })).toBe(
      "Chacao, Altamira",
    );
    expect(searchHeadline(CARACAS)).toBe("Distrito Capital");
  });
});

/**
 * **El número de la pastilla es el único que hay, y esto es la corrección de
 * una contradicción real entre dos contratos ya escritos.**
 *
 * Hasta la 14.49 convivía con `countActiveFilters`, que contaba la zona como un
 * filtro porque el engranaje de la barra resumen abría un acordeón que TENÍA un
 * paso de zona. La 14.36 sacó ciudad y zona del panel («la ubicación pasa a
 * vivir SOLO en la ruta; los filtros SOLO en la query»), la 14i lo dice desde el
 * otro lado —el filtro de la pastilla «abre precio, tamaño, quién publica y
 * atributos. Ciudad y zona no están ahí: eso lo resuelve el texto»— y la 14.41
 * reemplazó la barra por la pastilla. Ese otro conteo quedó sin pantalla y se
 * borró con `model.activeFilters`.
 *
 * Y la lámina 7b/7c lo dibuja: con Chacao, Altamira, $250–$700, 2 habitaciones
 * y "solo de dueños" puestos, la pastilla dice **«3 filtros»** — no 4, no 5.
 *
 * Dibujar acá el número del engranaje habría puesto un número que no es el que
 * abre nada, y no hay lámina ni prueba de dominio que se ponga roja por eso.
 */
describe("countPillFilters — lo que el filtro de la pastilla abre de verdad (14i)", () => {
  it("la zona NO cuenta: la resuelve el texto de la pastilla, no el panel", () => {
    expect(countPillFilters({ ...CARACAS, zoneNames: ["Chacao", "Altamira"] })).toBe(0);
  });

  it("los baños cuentan como un filtro más: la pastilla abre el grupo del tamaño entero", () => {
    expect(countPillFilters({ ...CARACAS, minBathrooms: 2 })).toBe(1);
    expect(countPillFilters({ ...CARACAS, minRooms: 2, minBathrooms: 2 })).toBe(2);
  });

  it("el caso de la lámina 7c: precio, habitaciones y quién publica son 3", () => {
    expect(
      countPillFilters({
        ...CARACAS,
        zoneNames: ["Chacao", "Altamira"],
        minPriceUsd: 250,
        maxPriceUsd: 700,
        minRooms: 2,
        publisherType: "owner",
      }),
    ).toBe(3);
  });

  it("sin nada puesto es cero, y la ciudad tampoco cuenta (F8)", () => {
    expect(countPillFilters(CARACAS)).toBe(0);
  });

  it("cada atributo cuenta por su cuenta: se combinan con Y", () => {
    expect(countPillFilters({ ...CARACAS, attributes: ["hasPowerPlant", "hasRegularWater"] })).toBe(
      2,
    );
  });

  it("un solo extremo del precio ya es el filtro de precio", () => {
    expect(countPillFilters({ ...CARACAS, maxPriceUsd: 900 })).toBe(1);
    expect(countPillFilters({ ...CARACAS, minPriceUsd: 300 })).toBe(1);
  });

  /**
   * **La zona era la única diferencia con el conteo del engranaje**, y hasta la
   * 14.49 esto se afirmaba restando `countActiveFilters`. Ese conteo se borró
   * con `model.activeFilters` —la barra resumen que lo dibujaba se fue en la
   * 14.41— así que la resta ya no tiene minuendo. Lo que la resta protegía sí
   * se conserva, y de la única forma que queda honesta: afirmando que agregar
   * una zona a una selección **no mueve este número**.
   */
  it("agregar una zona no mueve el número: es lo único que no cuenta", () => {
    const sinZonas = { ...CARACAS, minRooms: 3, attributes: ["hasSecurity"] as const };
    const conZonas = { ...sinZonas, zoneNames: ["Chacao", "Altamira"] };

    expect(countPillFilters(sinZonas)).toBe(2);
    expect(countPillFilters(conZonas)).toBe(2);
  });
});
