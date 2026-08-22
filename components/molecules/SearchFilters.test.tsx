import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { type SearchFilterControl, SearchFilters } from "./SearchFilters";

const cities = [
  { id: "dc", name: "Distrito Capital" },
  { id: "mcbo", name: "Maracaibo" },
];

const zones = [
  { id: "chacao", name: "Chacao", cityId: "dc" },
  { id: "la-lago", name: "La Lago", cityId: "mcbo" },
];

function render(props: Partial<Parameters<typeof SearchFilters>[0]> = {}) {
  return renderToStaticMarkup(<SearchFilters cities={cities} zones={zones} {...props} />);
}

describe("SearchFilters", () => {
  it("is a GET form, so a filtered search is a URL somebody can paste", () => {
    const markup = render();

    // D11/D13: the state lives in the query string. Listings circulate by
    // WhatsApp here, and a filter nobody can paste into a chat is a filter
    // that does not travel.
    expect(markup).toContain('method="get"');
    expect(markup).not.toMatch(/onchange|onclick|oninput/i);
  });

  it("ships a visible submit, because nothing applies a filter without one", () => {
    // There is no `onChange` to auto-submit. Hiding the button would leave
    // the form unusable for exactly the visitors the no-JS rule is for.
    expect(render()).toContain('type="submit"');
  });

  /**
   * **This test used to assert the opposite, and the opposite was the bug.**
   * It required every city's zones in one `<optgroup>` per city, so choosing
   * Maracaibo still offered Chacao. The founder called it (2026-08-21):
   * picking a city must narrow the zones.
   *
   * The narrowing itself is `zonesForCity` in listing-catalogue's domain, not
   * here — a rule in a component is a rule the 90% coverage floor never
   * reaches. What this asserts is the component's half of the contract: it
   * renders exactly the zones it was handed, and invents no grouping that
   * would put a second city back on screen.
   */
  it("renders exactly the zones it is handed, and never regroups by city", () => {
    // Exactly what `zonesForCity(zones, "dc")` hands back — spelled out
    // rather than indexed, so the fixture states the contract instead of
    // depending on the order of the array above.
    const caracasZones = zones.filter((zone) => zone.cityId === "dc");
    const markup = renderToStaticMarkup(
      <SearchFilters cities={cities} zones={caracasZones} values={{ city: "dc" }} />,
    );

    expect(markup).toContain("Chacao");
    expect(markup).not.toContain("La Lago");
    expect(markup).not.toContain("<optgroup");
  });

  it("preselects nothing on its own — the page decides the default", () => {
    // The component stays dumb about which city is chosen: it renders what
    // its caller passes. Artboard 2a shows Distrito Capital already selected,
    // and the page supplies that when the URL names none, so the default
    // lives in one place instead of two disagreeing ones.
    expect(render()).not.toContain("checked");
  });

  it("marks the city the URL carries, so a shared link arrives filtered", () => {
    const markup = render({ values: { city: "mcbo" } });
    const inputs = markup.match(/<input[^>]*name="city"[^>]*>/g) ?? [];

    // Matched per input rather than by attribute order: React emits
    // `checked` before `value`, and a regex that assumed the other order
    // failed while the markup was correct.
    const chosen = inputs.filter((tag) => tag.includes("checked"));
    expect(chosen).toHaveLength(1);
    expect(chosen[0]).toContain('value="mcbo"');
  });

  it("labels the last room step 4+, never a bare 4", () => {
    const markup = render();

    // A segmented control whose last step silently meant "exactly four" would
    // hide every larger apartment from the people most likely to want one.
    expect(markup).toContain("4+");
  });

  it("counts results on the action once there are any", () => {
    expect(render({ resultCount: 12 })).toContain("Ver 12 propiedades");
    expect(render()).toContain("Buscar");
  });
});

/**
 * Los grupos y los nombres nuevos (tasks 14.6 a 14.10) son **opcionales**, y
 * eso no es cortesía: `app/page.tsx` monta este mismo componente con las
 * props de siempre. Un grupo que aparece solo es una casilla que la página
 * que lo recibe no sabe leer, y que por lo tanto se destilda al recargar —
 * lo que en pantalla parece un error del sitio.
 */
describe("SearchFilters — lo que dibuja por defecto", () => {
  it("dibuja los mismos tres grupos de siempre y ni uno más", () => {
    const markup = render();

    expect(markup).toContain('name="city"');
    expect(markup).toContain('name="minPrice"');
    expect(markup).toContain('name="minRooms"');
    // Los de las tasks 14.7 a 14.9 sólo aparecen si alguien los pide.
    expect(markup).not.toContain("Cualquier tipo");
    expect(markup).not.toContain("Sólo de dueños");
    expect(markup).not.toContain("Planta eléctrica");
    expect(markup).not.toContain('type="checkbox"');
  });
});

describe("SearchFilters — los filtros nuevos (tasks 14.7 a 14.9)", () => {
  /** Los grupos que la página de resultados pide. */
  const TODOS: readonly SearchFilterControl[] = [
    "price",
    "rooms",
    "propertyType",
    "publisherType",
    "attributes",
  ];

  it("ofrece los cinco tipos de propiedad, y la opción de no filtrar por tipo", () => {
    const markup = renderToStaticMarkup(
      <SearchFilters cities={cities} zones={zones} controls={TODOS} />,
    );

    expect(markup).toContain("Cualquier tipo");
    for (const label of ["Apartamento", "Casa", "Quinta", "Anexo", "Habitación"]) {
      expect(markup).toContain(label);
    }
  });

  it("ofrece «sólo de dueños» como una casilla, no como una elección de tres", () => {
    // F6 es la pregunta que la gente se hace. "Cualquiera" es no marcarla.
    const markup = renderToStaticMarkup(
      <SearchFilters cities={cities} zones={zones} controls={TODOS} />,
    );

    expect(markup).toMatch(/<input[^>]*type="checkbox"[^>]*value="owner"/);
    expect(markup).toContain("Sólo de dueños");
  });

  it("ofrece los cinco atributos, y ninguno pide el «no»", () => {
    const markup = renderToStaticMarkup(
      <SearchFilters cities={cities} zones={zones} controls={TODOS} />,
    );

    for (const attribute of [
      "hasPowerPlant",
      "hasRegularWater",
      "isFurnished",
      "hasSecurity",
      "hasAppliances",
    ]) {
      expect(markup).toContain(`name="${attribute}"`);
    }
    // Cada casilla manda "1" y nada más: no existe el valor que pediría los
    // avisos que declararon que NO, porque `false` significa "no lo declaró".
    const casillas = markup.match(/<input[^>]*type="checkbox"[^>]*>/g) ?? [];
    expect(casillas).toHaveLength(6); // los cinco atributos y «sólo de dueños»
    expect(casillas.filter((tag) => /value="(0|false)"/.test(tag))).toHaveLength(0);
  });

  it("marca los atributos que la URL trae, para que un enlace llegue filtrado", () => {
    const markup = renderToStaticMarkup(
      <SearchFilters
        cities={cities}
        zones={zones}
        controls={TODOS}
        values={{ attributes: ["hasPowerPlant", "hasSecurity"] }}
      />,
    );

    const marcadas = (markup.match(/<input[^>]*type="checkbox"[^>]*>/g) ?? []).filter((tag) =>
      tag.includes("checked"),
    );

    expect(marcadas).toHaveLength(2);
    expect(marcadas.some((tag) => tag.includes('name="hasPowerPlant"'))).toBe(true);
    expect(marcadas.some((tag) => tag.includes('name="hasSecurity"'))).toBe(true);
  });

  it("sigue sin JavaScript de cliente con todos los grupos puestos", () => {
    const markup = renderToStaticMarkup(
      <SearchFilters cities={cities} zones={zones} controls={TODOS} />,
    );

    expect(markup).toContain('method="get"');
    expect(markup).not.toMatch(/onchange|onclick|oninput/i);
    expect(markup).toContain('type="submit"');
  });
});

describe("SearchFilters — cómo se llaman los campos en la URL", () => {
  it("usa los nombres que le pasan, sin decidir ninguno por su cuenta", () => {
    // Los cortos son los del fundador (F12). El renombre es del borde de
    // entrega: lo pasa la página, no lo elige este componente.
    const markup = renderToStaticMarkup(
      <SearchFilters
        cities={cities}
        zones={zones}
        controls={["price", "rooms", "propertyType"]}
        names={{ minPrice: "min", maxPrice: "max", minRooms: "hab", propertyType: "tipo" }}
      />,
    );

    expect(markup).toContain('name="min"');
    expect(markup).toContain('name="max"');
    expect(markup).toContain('name="hab"');
    expect(markup).toContain('name="tipo"');
    expect(markup).not.toContain('name="minPrice"');
  });

  it("deja el lugar fuera cuando la ruta ya lo afirma", () => {
    // En `/alquiler/<ciudad>/<zona>` la ciudad y la zona están en la
    // dirección. Un selector de ciudad ahí manda un parámetro que la página
    // ignora, y que se ve como un control roto.
    const markup = renderToStaticMarkup(
      <SearchFilters cities={cities} zones={zones} controls={["price"]} />,
    );

    expect(markup).not.toContain('name="city"');
    expect(markup).not.toContain("Todas las zonas");
  });
});
