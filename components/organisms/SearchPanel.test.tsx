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

// El panel es un estado de la dirección (14.33): cerrado no dibuja nada, así
// que casi todo lo que hay que mirar vive detrás de este parámetro.
const ABIERTO = { filtros: "todos" };

function render(overrides: Partial<SearchPanelInput> = {}) {
  return renderToStaticMarkup(
    <SearchPanel model={buildSearchPanel({ ...INPUT, query: ABIERTO, ...overrides })} />,
  );
}

const SOURCE = readFileSync(new URL("./SearchPanel.tsx", import.meta.url), "utf8");

describe("el acordeón funciona con JavaScript apagado (F14)", () => {
  it("no es un componente de cliente", () => {
    // La directiva sólo cuenta al principio del archivo; nombrarla dentro de
    // un comentario que explica por qué NO está no la convierte en una.
    expect(SOURCE.trimStart().startsWith('"use client"')).toBe(false);
    expect(SOURCE.trimStart().startsWith("'use client'")).toBe(false);
  });

  it("cada grupo se abre con un enlace, así que el servidor decide cuál queda abierto", () => {
    // Antes eran `<details name>`, el acordeón exclusivo del navegador. Se
    // cambió por enlaces cuando el panel dejó de ser barra lateral (14.32):
    // en escritorio los cuatro grupos van abiertos a la vez, y ninguna hoja de
    // estilos puede volver a abrir de forma confiable un `<details>` cerrado.
    // Un solo marcado con punto de quiebre, nunca dos implementaciones.
    const markup = render();

    expect(markup).not.toContain("<details");
    for (const group of ["precio", "habitaciones", "publica", "atributos"]) {
      expect(markup).toContain(`href="/alquiler/distrito-capital?filtros=${group}"`);
    }
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

describe("lo que cada grupo muestra", () => {
  it("la ubicación no está en ninguna parte del panel (14.36)", () => {
    // «Este panel ya no repite ciudad ni zona: eso lo resuelve el buscador de
    // la pastilla, y tenerlo en los dos lugares era el problema» (lámina 7b).
    const markup = render({ chosenZoneIds: ["chacao"], query: { ...ABIERTO, zona: "chacao" } });

    expect(markup).not.toContain("¿En qué ciudad?");
    expect(markup).not.toContain("¿Qué zonas?");
    expect(markup).not.toContain("Maracaibo");
    expect(markup).not.toContain("Buscar una zona");
  });

  it("los cuatro grupos, con su título y su pregunta", () => {
    const markup = render();

    for (const title of ["Precio", "Habitaciones", "Quién publica", "La propiedad tiene"]) {
      expect(markup).toContain(title);
    }
    expect(markup).toContain("¿Quién publica el aviso?");
  });

  it("una opción con cero se ofrece sin enlace: ninguna lleva a un vacío", () => {
    // El escalón de 4 habitaciones tiene cero, y `hasSecurity` también.
    expect(render()).toContain('aria-disabled="true"');
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
    // El filtro de la pastilla lleva a `…#filtros`: sin este `id` el enlace recarga
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

/**
 * **El panel es un estado de la página, no una barra lateral** (14.33, lámina
 * 7c: *"Sin barra lateral: los filtros viven solo en el modal"*).
 */
describe("el panel como modal en todos los anchos (14.33)", () => {
  it("cerrado no dibuja nada: no hay filtros escondidos ocupando lugar", () => {
    const markup = renderToStaticMarkup(
      <SearchPanel model={buildSearchPanel({ ...INPUT, query: {} })} />,
    );

    expect(markup).toBe("");
  });

  it("abierto es un diálogo con nombre, y con una salida visible", () => {
    const markup = render();

    expect(markup).toContain('role="dialog"');
    expect(markup).toMatch(/aria-label="Cerrar los filtros"/);
    // La salida es una dirección de verdad: se puede abrir en otra pestaña y
    // funciona con el script apagado, igual que todo el camino de lectura.
    expect(markup).toMatch(/<a[^>]*href="\/alquiler\/distrito-capital"/);
  });

  it("una dirección vieja abre el panel y lo explica, en vez de romperlo", () => {
    const markup = render({ query: { filtros: "zona" } });

    expect(markup).toContain('role="dialog"');
    expect(markup).toContain("ya no existe");
  });

  it("el grupo abierto se marca en el marcado, que es lo que la hoja de estilos lee", () => {
    const markup = render({ query: { filtros: "atributos" } });

    expect(markup.match(/data-open=""/g)).toHaveLength(1);
    expect(markup).toMatch(
      /id="filtros-atributos"[^>]*data-open=""|data-open=""[^>]*id="filtros-atributos"/,
    );
  });
});
