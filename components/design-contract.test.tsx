import { readdirSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import * as buttons from "./atoms/buttons";
import { contrastRatio, relativeLuminance, themeColor } from "./contrast";
import { Field } from "./molecules/Field";

const buttonCss = readFileSync("components/atoms/Button.module.css", "utf-8");
const badgeCss = readFileSync("components/atoms/PublisherBadge.module.css", "utf-8");
const priceCss = readFileSync("components/atoms/Price.module.css", "utf-8");
const buttonsSource = readFileSync("components/atoms/buttons.tsx", "utf-8");
const tokensCss = readFileSync("src/styles/tokens.css", "utf-8");

/**
 * El valor de un token que no pertenece a ningún tema — geometría y tipografía,
 * que viven en `:root`. Se lee de `tokens.css` y nunca de una copia: una
 * aserción contra un número escrito acá dejaría de medir el archivo real en
 * cuanto alguien lo editara.
 */
function tokenValue(name: string): string {
  const match = tokensCss.match(new RegExp(`${name}\\s*:\\s*([^;]+);`));
  if (!match?.[1]) throw new Error(`tokens.css: "${name}" no está declarado`);
  return match[1].trim();
}

function block(css: string, selector: string): string {
  const match = css.match(new RegExp(`\\.${selector}\\s*\\{([^}]*)\\}`));
  if (!match) throw new Error(`missing .${selector} block`);
  return match[1] ?? "";
}

// 1b.6 — three distinct button components, not one component with a
// free-form variant prop.
describe("button hierarchy (1b.6)", () => {
  it("exports three distinct components, no shared variant prop", () => {
    expect(typeof buttons.ActionButton).toBe("function");
    expect(typeof buttons.SelectionButton).toBe("function");
    expect(typeof buttons.NeutralButton).toBe("function");
    // Props is exactly ButtonHTMLAttributes — no added `variant` field a
    // caller could pass to blend two hierarchy levels.
    expect(buttonsSource).toContain("type Props = ButtonHTMLAttributes<HTMLButtonElement>;");
    expect(buttonsSource).not.toMatch(/variant\s*[:?]/);
  });

  it("action is filled --accent; selection is --tint fill + --accent border; neutral is --strong border, no fill", () => {
    expect(block(buttonCss, "action")).toContain("background: var(--accent)");
    expect(block(buttonCss, "selection")).toContain("background: var(--tint)");
    expect(block(buttonCss, "selection")).toContain("border: 1px solid var(--accent)");
    expect(block(buttonCss, "neutral")).toContain("background: none");
    expect(block(buttonCss, "neutral")).toContain("border: 1px solid var(--strong)");
  });
});

// 1b.16 — keyboard focus visibly indicated on every interactive atom.
describe("focus visibility (1b.16)", () => {
  it.each(["action", "selection", "neutral"])(
    "%s has a non-none :focus-visible outline",
    (level) => {
      const rule = buttonCss.match(new RegExp(`\\.${level}:focus-visible\\s*\\{([^}]*)\\}`));
      expect(rule).not.toBeNull();
      const outline = rule?.[1]?.match(/outline:\s*([^;]+);/)?.[1]?.trim();
      expect(outline).toBeDefined();
      expect(outline).not.toBe("none");
      expect(outline).not.toMatch(/^0(px)?( |$)/);
    },
  );
});

// 1b.7 — publisher_type badge distinguishable with colour removed.
describe("publisher badge greyscale legibility (1b.7)", () => {
  it("owner is filled (background) and broker is outlined (border, no fill) — structural, survives greyscale by construction", () => {
    expect(block(badgeCss, "owner")).toContain("background: var(--ink)");
    expect(block(badgeCss, "broker")).toContain("background: none");
    expect(block(badgeCss, "broker")).toContain("border: 1px solid var(--strong)");
  });

  it.each(["menta", "oscuro"] as const)(
    "%s: owner fill is legible against --surface (luminance apart, contrast >= 4.5)",
    (theme) => {
      const ink = themeColor(theme, "--ink");
      const surface = themeColor(theme, "--surface");
      expect(Math.abs(relativeLuminance(ink) - relativeLuminance(surface))).toBeGreaterThan(0.3);
      expect(contrastRatio(ink, surface)).toBeGreaterThanOrEqual(4.5);
    },
  );
});

// 1b.9 — price uses the monospace stack with tabular-nums.
describe("price typography (1b.9)", () => {
  it("declares --disp font-family and tabular-nums", () => {
    expect(priceCss).toContain("font-family: var(--disp)");
    expect(priceCss).toContain("font-variant-numeric: tabular-nums");
  });
});

// 1b.15 — WCAG AA text contrast for every token pair actually in use, both
// shipped themes. All pairs here are normal-size text (11-15px), so the
// 4.5:1 threshold applies uniformly — none qualifies for the 3:1 large-text
// exception.
describe("WCAG AA contrast (1b.15)", () => {
  const pairs: [string, string, string][] = [
    ["--ink", "--surface", "title/price text on row background"],
    ["--soft", "--surface", "metadata text / broker badge text"],
    ["--accent-ink", "--accent", "action button label"],
    ["--accent", "--tint", "selection button label"],
    // El contador en falta de publicar (`.counterShort`) y el aviso de cambio
    // de ciudad del panel (`.warning`): los dos únicos usos de `--warn`.
    ["--warn", "--surface", "contador en falta / texto de advertencia"],
    ["--warn", "--warn-bg", "aviso sobre su propio fondo"],
  ];

  for (const theme of ["menta", "oscuro"] as const) {
    describe(theme, () => {
      it.each(pairs)("%s on %s (%s) >= 4.5:1", (fg, bg) => {
        const ratio = contrastRatio(themeColor(theme, fg), themeColor(theme, bg));
        expect(ratio).toBeGreaterThanOrEqual(4.5);
      });
    });
  }
});

/**
 * **Una advertencia tiene que verse como una advertencia.**
 *
 * `--warn` pinta el contador de caracteres en falta de publicar y el aviso de
 * que cambiar de ciudad borra las zonas. Traía el azul del acento —el mismo
 * color que TODO lo demás de la pantalla— así que no se leía como aviso: se
 * leía como texto. La especificación de publicar §8 lo pide ámbar, `#8a5a00`.
 */
describe("el aviso se lee como aviso (Publicar §8)", () => {
  it("menta lleva el ámbar de la especificación, textual", () => {
    expect(themeColor("menta", "--warn")).toBe("#8a5a00");
  });

  it("oscuro NO puede llevar ese mismo ámbar, y este es el número que lo dice", () => {
    // 2,52:1 sobre `--surface` y 2,90:1 sobre `--bg`. Los dos por debajo de
    // 4,5. Esta aserción existe para que nadie "corrija" el tema oscuro al
    // valor de la spec dentro de seis meses creyendo que arregla una
    // inconsistencia.
    expect(contrastRatio("#8a5a00", themeColor("oscuro", "--surface"))).toBeLessThan(4.5);
    expect(themeColor("oscuro", "--warn")).not.toBe("#8a5a00");
  });

  it("y sigue siendo ámbar en oscuro, no otro color del tema", () => {
    // Ámbar es rojo alto, verde medio y azul bajo. Sin esto, "que pase AA" lo
    // cumpliría cualquier color — incluido el azul del que se viene.
    const [r, g, b] = [1, 3, 5].map((at) =>
      Number.parseInt(themeColor("oscuro", "--warn").slice(at, at + 2), 16),
    ) as [number, number, number];

    expect(r).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(b);
  });
});

/**
 * **Los tokens que faltaban, y por qué faltar no es inocuo.**
 *
 * Tres agentes anotaron lo mismo por separado (tasks.md 16.22–16.26): el
 * conjunto no nombraba el alto de la barra de búsqueda, ni su tamaño de texto,
 * ni el subtítulo de la tira, ni tenía token de sombra. Cada hueco se tapó con
 * el token *parecido* — `--target-min` por el alto, `--control-fs` por el
 * texto, `--meta-fs` por el subtítulo, `var(--line)` por la sombra — y eso es
 * exactamente lo que `tokens.css` ya documenta como el defecto real que produjo
 * el `<h1>` del inicio agarrando `--fpb` ("precio en ficha"): `lint:tokens`
 * pasa, porque verifica que un valor SEA una propiedad personalizada, nunca que
 * sea la CORRECTA. Un token faltante no pone ningún gate en rojo; produce una
 * respuesta plausible y equivocada.
 */
describe("los tokens que el conjunto no nombraba (16.22–16.26)", () => {
  const stripCss = readFileSync("components/molecules/ListingStrip.module.css", "utf-8");

  /**
   * **Lo que la 14.42 se llevó de este bloque, dicho acá y no en el mensaje del
   * commit.** Tres aserciones leían `SearchBar.module.css`: que `.bar` usara
   * `--searchbar-h`, que `.label` usara `--searchbar-fs`, y el `it` entero de
   * «la sombra es un token y no la línea del borde». Su sujeto era esa hoja, y
   * la hoja se borró con la pieza. Se borran con ella en vez de reapuntarlas a
   * `SearchPill.module.css`: una aserción mudada de sujeto es una que dice
   * seguir protegiendo lo de antes y protege otra cosa, y eso es peor que no
   * tenerla, porque nadie vuelve a mirarla.
   *
   * **`--searchbar-h` y `--searchbar-fs` quedan sin un solo uso** — eran de esa
   * hoja y de ninguna otra. No se borran acá: sacar un token es un cambio al
   * conjunto (SISTEMA.md) y no un uso de él, y `lint:tokens` no lo exige porque
   * verifica paridad de temas y literales, nunca si alguien lo usa. Queda
   * anotado como hallazgo de la 14.42. Lo que sigue abajo sí sobrevive: mide
   * `tokens.css`, que es un sujeto que no se borró.
   */
  it("el alto propio de la barra no queda por debajo del mínimo táctil: 50 ≥ 44", () => {
    expect(Number.parseFloat(tokenValue("--searchbar-h"))).toBeGreaterThanOrEqual(
      Number.parseFloat(tokenValue("--target-min")),
    );
  });

  it("la sombra repinta al cambiar de tema, como cualquier otro color", () => {
    // Una sombra clara sobre un fondo oscuro no levanta nada: se ve como una
    // mancha. `lint:tokens` ya exige que los dos temas la declaren distinta;
    // esto lo dice acá para que se lea junto al resto del contrato.
    expect(themeColor("menta", "--shadow-raised")).not.toBe(
      themeColor("oscuro", "--shadow-raised"),
    );
  });

  it("el subtítulo de la tira lleva su medida y su paso de escritorio", () => {
    expect(block(stripCss, "subtitle")).toContain("var(--strip-subtitle-fs)");
    expect(stripCss).toContain("var(--strip-subtitle-fs-desktop)");
  });

  it("cada tamaño nuevo es el del diseño, no el del token que se le parecía", () => {
    // Si alguno volviera a apuntar al token vecino, este bloque seguiría en
    // verde por casualidad — salvo que se compare contra el número dibujado.
    expect(tokenValue("--searchbar-h")).toBe("50px");
    expect(tokenValue("--searchbar-fs")).toBe("14px");
    expect(tokenValue("--strip-subtitle-fs")).toBe("12.5px");
    expect(tokenValue("--strip-subtitle-fs-desktop")).toBe("13px");
    // Y son distintos de sus vecinos, que es lo que los hace tokens propios y
    // no alias: 14 ≠ --control-fs (15) y 12,5 ≠ --meta-fs (12).
    expect(tokenValue("--searchbar-fs")).not.toBe(tokenValue("--control-fs"));
    expect(tokenValue("--strip-subtitle-fs")).not.toBe(tokenValue("--meta-fs"));
  });

  it("un solo nombre por color: la spec escribe --rule y --acc-ink, y ships --strong y --accent-ink", () => {
    // 16.22. Dos nombres para un mismo valor es cómo una paleta empieza a
    // discrepar. Se elige la grafía que ya ship*a* — es la del archivo de
    // referencia del diseño y la que usan las 120 hojas — y `lint:tokens`
    // rechaza la otra, que es lo que impide que vuelva a entrar.
    expect(themeColor("menta", "--strong")).toBe("#788189");
    expect(themeColor("menta", "--accent-ink")).toBe("#ffffff");
    expect(tokensCss).not.toMatch(/^\s*--rule\s*:/m);
    expect(tokensCss).not.toMatch(/^\s*--acc-ink\s*:/m);
  });

  it("--target-min-desktop NO se toca: 36 ships y la spec dice 40, y decide el fundador", () => {
    // 16.24. No es un hueco sino un conflicto, y el cambio es global — todo
    // control de toda pantalla. Se deja anclado para que nadie lo "arregle"
    // de paso mientras agrega tokens.
    expect(tokenValue("--target-min-desktop")).toBe("36px");
  });
});

// 1b.18 — shipped read-path CSS carries no webfont request, and this
// slice's components carry no runtime JavaScript.
describe("no webfont, no read-path JS (1b.18)", () => {
  it("tokens.css has no @font-face / font url()", () => {
    expect(tokensCss).not.toMatch(/@font-face/);
    expect(tokensCss).not.toMatch(/url\(/);
  });

  it('no shipped atom/molecule declares "use client"', () => {
    const roots = ["components/atoms", "components/molecules"];
    const files = roots.flatMap((root) =>
      readdirSync(root)
        .filter((f) => extname(f) === ".tsx" && !f.includes(".test."))
        .map((f) => join(root, f)),
    );
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      expect(readFileSync(file, "utf-8")).not.toContain('"use client"');
    }
  });
});

// ---------------------------------------------------------------------------
// Form fields (3.9). These are SYSTEM rules, not publish-form rules: the
// renewal screen, the report flow and the import preview all get them by
// composing `Field`, and each assertion below is the thing that would
// silently rot if a future screen hand-rolled its own markup instead.
// ---------------------------------------------------------------------------

const fieldCss = readFileSync("components/molecules/Field.module.css", "utf-8");

function renderField(props: Partial<Parameters<typeof Field>[0]> = {}) {
  return renderToStaticMarkup(
    <Field name="titulo" label="Título" {...props}>
      {(attributes) => <input {...attributes} type="text" />}
    </Field>,
  );
}

describe("required marking is never colour alone (3.9)", () => {
  it("renders the glyph and the word, both inside the label", () => {
    const markup = renderField({ required: true });

    // The design says it outright, and forced-colors mode drops the red
    // entirely — leaving a field that looks optional and is not.
    expect(markup).toContain("✱");
    expect(markup.toLowerCase()).toContain("obligatorio");
    expect(markup).toMatch(/<label[^>]*>[\s\S]*obligatorio[\s\S]*<\/label>/i);
  });

  it("marks nothing when the field is optional", () => {
    expect(renderField()).not.toContain("obligatorio");
  });
});

describe("an invalid field is announced, not only drawn (3.9)", () => {
  it("sets aria-invalid and points aria-describedby at a message that exists", () => {
    const markup = renderField({ error: "✱ Mínimo 120 caracteres. Vas 24." });

    expect(markup).toContain('aria-invalid="true"');
    expect(markup).toContain('aria-describedby="titulo-error"');
    // The id must resolve. An aria-describedby pointing at nothing is worse
    // than none: it reports as accessible and reads as silence.
    expect(markup).toContain('id="titulo-error"');
  });

  it("adds nothing to announce when the field is valid", () => {
    const markup = renderField();

    expect(markup).not.toContain("aria-invalid");
    expect(markup).not.toContain("aria-describedby");
  });

  it("keeps the help text when an error appears, and puts the error first", () => {
    const markup = renderField({ error: "Muy corta.", help: "Mínimo 120 caracteres." });

    // Order is the artboard's. The rule must not be mentioned for the first
    // time by the message saying it was broken.
    expect(markup.indexOf("Muy corta.")).toBeLessThan(markup.indexOf("Mínimo 120"));
    expect(markup).toContain("Mínimo 120 caracteres.");
  });
});

describe("field geometry comes from tokens, not literals (3.9/D16)", () => {
  it("uses the touch-target tokens rather than a bare 44px", () => {
    expect(block(fieldCss, "control")).toContain("var(--target-min)");
    expect(fieldCss).toContain("var(--target-min-desktop)");
  });

  it("declares the 2px error border the design specifies", () => {
    expect(block(fieldCss, "controlInvalid")).toMatch(/border:\s*2px solid var\(--err\)/);
  });

  it("pairs two fields on one row at every width, not behind a media query", () => {
    // The 360 artboard puts city and zone side by side exactly as 1280 does.
    // A media query here would silently stack them on the viewport the
    // product is designed for first.
    const rowIndex = fieldCss.indexOf(".row");
    const mediaIndex = fieldCss.indexOf("@media");
    expect(rowIndex).toBeGreaterThan(-1);
    expect(rowIndex).toBeLessThan(mediaIndex);
  });
});
