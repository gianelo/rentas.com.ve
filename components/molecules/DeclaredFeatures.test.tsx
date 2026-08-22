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
