import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DeclaredFeatures } from "./DeclaredFeatures";
import { StatStrip } from "./StatStrip";

const NONE = {
  hasPowerPlant: false,
  hasRegularWater: false,
  isFurnished: false,
  hasSecurity: false,
  hasAppliances: false,
};

describe("DeclaredFeatures", () => {
  /**
   * **La regla más delicada de la ficha, y la más fácil de romper con buenas
   * intenciones.** Un interruptor apagado en el formulario se ve como un "no",
   * así que quien lea la columna sin saberlo va a escribir "No amoblado" — y
   * eso es afirmar algo que el sistema no sabe. `false` significa "no lo
   * declaró", nunca "no lo tiene".
   */
  it("nunca afirma que la propiedad NO tiene algo", () => {
    const markup = renderToStaticMarkup(<DeclaredFeatures {...NONE} hasPowerPlant isFurnished />);

    expect(markup).toContain("Planta eléctrica");
    expect(markup).toContain("Amoblado");
    // Lo no declarado aparece, pero nombrado como no declarado.
    expect(markup).toContain("Solo se lista lo declarado");
    expect(markup).not.toMatch(/No tiene|Sin vigilancia|no cuenta con/i);
  });

  it("nombra lo que quedó afuera en vez de callarlo", () => {
    // Callarlo sería honesto pero incompleto: quien lee no sabría si la
    // propiedad no tiene vigilancia o si nadie preguntó.
    const markup = renderToStaticMarkup(<DeclaredFeatures {...NONE} hasPowerPlant />);

    expect(markup).toContain("agua regular");
    expect(markup).toContain("vigilancia 24 h");
  });

  it("no dibuja la sección cuando no se declaró ninguno", () => {
    // Un encabezado sobre una lista vacía dice "esta propiedad no tiene nada",
    // que es exactamente la mentira que la regla evita.
    expect(renderToStaticMarkup(<DeclaredFeatures {...NONE} />)).toBe("");
  });

  it("omite la aclaración cuando se declararon los cinco", () => {
    const markup = renderToStaticMarkup(
      <DeclaredFeatures hasPowerPlant hasRegularWater isFurnished hasSecurity hasAppliances />,
    );

    expect(markup).not.toContain("Solo se lista lo declarado");
  });

  /**
   * **El puesto entra en la lista y sale del «no se declaró»** (14.45 rebanada
   * C, decisión del fundador: «con su ✓ en el filtro y en la lista *La
   * propiedad tiene*»).
   *
   * Las dos mitades tienen una sola razón y es la que separa este dato de los
   * otros cinco: `parking_spots` es `NOT NULL DEFAULT 0` y **el paso 4 de
   * publicar lo pide siempre** —«Puestos permite 0»—, así que el cero es un
   * cero declarado, no un silencio. Nombrarlo entre lo no declarado diría que
   * nadie contestó sobre una respuesta que sí existe, y encima la tira de
   * datos de arriba ya la escribe como «0 Puestos». La regla de la sección
   * —nunca afirmar una ausencia— se respeta igual: no se dibuja «Sin puesto».
   */
  it("lista el puesto cuando hay al menos uno", () => {
    const markup = renderToStaticMarkup(<DeclaredFeatures {...NONE} parkingSpots={2} />);

    expect(markup).toContain("Puesto de estacionamiento");
  });

  it("no nombra el puesto entre lo no declarado, porque el cero sí se declaró", () => {
    const markup = renderToStaticMarkup(<DeclaredFeatures {...NONE} hasPowerPlant />);

    expect(markup).toContain("Solo se lista lo declarado");
    expect(markup.toLowerCase()).not.toContain("puesto");
  });

  it("un puesto solo no alcanza para dibujar la sección de nada más", () => {
    // El cero no es «no lo declaró», así que sin ningún atributo y sin puesto
    // la sección sigue sin dibujarse.
    expect(renderToStaticMarkup(<DeclaredFeatures {...NONE} parkingSpots={0} />)).toBe("");
  });
});

describe("StatStrip", () => {
  /**
   * **Las cuatro celdas siempre, y el cero se muestra.** El esquema ya lo dice
   * sobre las columnas que la alimentan: la tira "dibuja cuatro celdas iguales
   * y no tiene estado vacío para ninguna". Ocultar la de puestos cuando vale
   * cero deja tres celdas y un hueco, que se lee como un error de carga.
   */
  it("dibuja las cuatro celdas aunque una valga cero", () => {
    const markup = renderToStaticMarkup(
      <StatStrip rooms={2} bathrooms={1} areaM2={78} parkingSpots={0} />,
    );

    expect(markup.match(/Hab|Baños|m²|Puestos/g)).toHaveLength(4);
    expect(markup).toContain(">0<");
  });

  it("dice «Puesto» en singular cuando hay uno solo", () => {
    const markup = renderToStaticMarkup(
      <StatStrip rooms={1} bathrooms={1} areaM2={40} parkingSpots={1} />,
    );

    expect(markup).toContain("Puesto<");
    expect(markup).not.toContain("Puestos");
  });
});
