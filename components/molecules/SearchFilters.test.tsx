import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SearchFilters } from "./SearchFilters";

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

  it("offers every zone grouped by city, not only the chosen city's", () => {
    const markup = render({ values: { city: "dc" } });

    // The same shape the publish form needed: a cascade that depends on a
    // reload cannot narrow this before the visitor has chosen.
    expect(markup).toContain('<optgroup label="Distrito Capital">');
    expect(markup).toContain('<optgroup label="Maracaibo">');
    expect(markup).toContain("La Lago");
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
