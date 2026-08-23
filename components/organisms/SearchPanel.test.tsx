import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  buildSearchPanel,
  type SearchPanelInput,
} from "@/modules/listing-search/domain/search-panel";
import { SearchPanel } from "./SearchPanel";

const COUNTS = {
  total: 16,
  byZone: { chacao: 12, altamira: 9, rosal: 0 },
  byMinRooms: { 1: 16, 2: 9, 3: 4, 4: 0 },
  byAttribute: {
    hasPowerPlant: 9,
    hasRegularWater: 12,
    isFurnished: 4,
    hasSecurity: 0,
    hasAppliances: 3,
  },
  byPublisherType: { owner: 11, broker: 5 },
} as const;

const INPUT: SearchPanelInput = {
  basePath: "/alquiler/distrito-capital",
  cityPath: "/alquiler/distrito-capital",
  query: {},
  cityId: "dc",
  cities: [
    { id: "dc", name: "Distrito Capital", path: "/alquiler/distrito-capital", count: 47 },
    { id: "mcbo", name: "Maracaibo", path: "/alquiler/maracaibo", count: 23 },
  ],
  zones: [
    { id: "chacao", name: "Chacao", slug: "chacao", path: "/alquiler/distrito-capital/chacao" },
    {
      id: "altamira",
      name: "Altamira",
      slug: "altamira",
      path: "/alquiler/distrito-capital/altamira",
    },
    {
      id: "rosal",
      name: "El Rosal",
      slug: "el-rosal",
      path: "/alquiler/distrito-capital/el-rosal",
    },
  ],
  chosenZoneIds: [],
  counts: COUNTS,
  criteria: {},
};

function render(overrides: Partial<SearchPanelInput> = {}) {
  return renderToStaticMarkup(<SearchPanel model={buildSearchPanel({ ...INPUT, ...overrides })} />);
}

const SOURCE = readFileSync(new URL("./SearchPanel.tsx", import.meta.url), "utf8");

describe("el acordeón funciona con JavaScript apagado (F14)", () => {
  it("no es un componente de cliente", () => {
    // La directiva sólo cuenta al principio del archivo; nombrarla dentro de
    // un comentario que explica por qué NO está no la convierte en una.
    expect(SOURCE.trimStart().startsWith('"use client"')).toBe(false);
    expect(SOURCE.trimStart().startsWith("'use client'")).toBe(false);
  });

  it("abre y cierra con `<details>` nativo", () => {
    const markup = render();

    expect(markup).toContain("<details");
    expect(markup).toContain("<summary");
  });

  it("los cuatro pasos comparten nombre, así que el navegador cierra el anterior solo", () => {
    // `name` en `<details>` es el acordeón exclusivo nativo: sin una línea de
    // JavaScript, abrir uno cierra los otros.
    expect(render().match(/name="paso-de-busqueda"/g)).toHaveLength(4);
  });

  it("no cuelga ni un manejador de eventos", () => {
    expect(render()).not.toMatch(/onclick|onchange|oninput|onsubmit/i);
  });

  it("cada opción es un enlace o un formulario GET", () => {
    const markup = render();

    expect(markup).toContain('method="get"');
    expect(markup).toContain("<a ");
  });
});

describe("el conteo en vivo (F7)", () => {
  it("el botón lleva el número adentro y nunca dice «Aplicar»", () => {
    const markup = render();
    // Sólo el botón de confirmar: el buscador de zonas tiene su propio
    // «Buscar», que es otro control y otra pregunta.
    const confirm = /data-testid="search-confirm"[^>]*>([^<]*)</.exec(markup)?.[1];

    expect(confirm).toBe("Ver 16 avisos");
    for (const forbidden of ["Aplicar", "Buscar", "Filtrar"]) {
      expect(confirm).not.toBe(forbidden);
    }
  });

  it("con cero resultados no se apaga: explica y ofrece una salida", () => {
    const markup = render({
      counts: { ...COUNTS, total: 0 },
      criteria: { minPriceUsd: 900 },
      relief: {
        filter: "price",
        label: "Quitar el precio y ver 14",
        resultCount: 14,
        href: "/alquiler/distrito-capital",
      },
    });

    expect(markup).toContain("Ningún aviso coincide");
    expect(markup).toContain("Quitar el precio y ver 14");
    // Y la salida es un enlace de verdad, no un botón apagado. `aria-disabled`
    // sí aparece en el marcado — es de una opción con cero, que es otra cosa.
    expect(markup).not.toContain("<button disabled");
    expect(markup).toMatch(/<a[^>]*>Quitar el precio y ver 14</);
  });

  it("con un solo resultado el botón lleva a la ficha", () => {
    const markup = render({
      counts: { ...COUNTS, total: 1 },
      onlyListingHref: "/alquiler/distrito-capital/chacao/apto-84512",
    });

    expect(markup).toContain("/alquiler/distrito-capital/chacao/apto-84512");
    expect(markup).toContain("Ver el único aviso");
  });
});

describe("lo que cada paso muestra", () => {
  it("las ciudades con su conteo, y el aviso de que se pierden las zonas", () => {
    const markup = render({ chosenZoneIds: ["chacao"], query: { zona: "chacao" } });

    expect(markup).toContain("Maracaibo");
    expect(markup).toContain("23");
    expect(markup).toContain("quita la zona elegida");
  });

  it("las zonas con su conteo, y la vacía sin número y sin enlace", () => {
    const markup = render();

    expect(markup).toContain("Chacao");
    expect(markup).toContain(">12<");
    // El Rosal tiene cero: se ofrece para que se vea que no hay nada, pero no
    // se puede tocar — ninguna opción lleva a un vacío.
    expect(markup).toContain('aria-disabled="true"');
  });

  it("el precio como dos campos opcionales de un formulario GET", () => {
    const markup = render();

    expect(markup).toContain('name="min"');
    expect(markup).toContain('name="max"');
  });

  it("las habitaciones con el «4+» del último escalón", () => {
    expect(render()).toContain("4+");
  });

  it("«Limpiar todo» está siempre a la vista (F8)", () => {
    expect(render()).toContain("Limpiar todo");
  });
});

describe("el ancla del engranaje", () => {
  it("el panel se llama «filtros», que es adónde apunta la barra resumen", () => {
    // En el teléfono el panel queda debajo de la cuadrícula. El engranaje de
    // `SearchSummaryBar` lleva a `…#filtros`: sin este `id` el enlace recarga
    // la misma pantalla y no lleva a ninguna parte visible.
    expect(render()).toContain('id="filtros"');
  });

  it("ninguna opción marca su estado con un atributo que su rol no admite", () => {
    // Un enlace tiene rol `link`, y `aria-pressed` pertenece al rol `button`:
    // ningún lector de pantalla lo anuncia. Es marcado que parece accesible y
    // no lo es, y por eso el estado elegido viaja en `aria-current`.
    const markup = render({ chosenZoneIds: ["chacao"], criteria: { minRooms: 2 } });

    expect(markup).not.toContain("aria-pressed");
    expect(markup).toContain('aria-current="true"');
  });
});
