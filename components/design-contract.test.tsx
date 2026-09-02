import { readdirSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import * as buttons from "./atoms/buttons";
import { alphaOf, compositeOver, contrastRatio, relativeLuminance, themeColor } from "./contrast";
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

  /**
   * **16.24, decidida por el fundador el 2026-08-27: 44.**
   *
   * El ancla anterior decía «NO se toca: 36 ships y la spec dice 40, y decide
   * el fundador». La decisión llegó y las tres candidatas no eran equivalentes:
   * WCAG 2.2 SC 2.5.8 (AA) pide 24×24 y las tres lo pasan, pero SC 2.5.5 (AAA)
   * pide 44×44 y **sólo 44 lo alcanza**. 40 era «mejor que 36» y seguía sin ser
   * suficiente, así que el criterio dejó de ser de gusto y pasó a ser el único
   * que se puede comprobar contra una norma.
   *
   * **El token sigue existiendo aunque ahora valga lo mismo que `--target-min`,
   * y no se colapsa en un alias.** El nombre registra la intención: quien
   * mañana quiera bajar el mínimo de escritorio tiene que ver cuál de los dos
   * está tocando. Un alias haría que bajar uno bajara los dos sin decirlo.
   */
  it("--target-min-desktop es 44: el único valor que alcanza WCAG 2.2 SC 2.5.5 (16.24)", () => {
    expect(tokenValue("--target-min-desktop")).toBe("44px");
  });

  it("sigue siendo un token propio y no un alias de --target-min", () => {
    // Valen lo mismo hoy, y aun así son dos declaraciones. Si alguien
    // "simplificara" a `--target-min-desktop: var(--target-min)`, esto lo dice.
    expect(tokensCss).toMatch(/^\s*--target-min-desktop:\s*44px;/m);
    expect(tokensCss).toMatch(/^\s*--target-min:\s*44px;/m);
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
// Form fields (3.9). These are SYSTEM rules and not publish-form rules: each
// assertion below is the thing that would silently rot if a screen hand-rolled
// its own markup instead.
//
// **CORREGIDO EL 2026-09-02, contando consumidores archivo por archivo (1b.5).**
// Esta cabecera decía que «la pantalla de renovación, el flujo de reporte y la
// vista previa de la importación» obtenían estas reglas componiendo `Field`.
// Los tres son falsos, y verificados uno por uno: la renovación no es una
// pantalla sino `app/renovar/[token]/route.ts`, un manejador de ruta sin
// formulario; `reportar/page.tsx` sólo lleva campos ocultos y sus propios
// controles; e `ImportarCartera.tsx` escribe su `<input type="file">` a mano.
// El único consumidor vivo de `Field` es `ContactBlock.tsx`.
//
// La cuenta importa porque cambia lo que este bloque prueba: no que el sistema
// haya adoptado un campo común —no lo ha hecho, y eso es lo que la 1b.5 sigue
// teniendo abierto—, sino que la pieza que existe es correcta. La adopción se
// afirma abajo, y por separado.
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

  /**
   * **Lo que la 8.9 se llevó de este bloque, dicho acá y no en el mensaje del
   * commit.** Había una aserción más: «pairs two fields on one row at every
   * width, not behind a media query», sobre `.row` de esta misma hoja. Su
   * sujeto era `FieldRow`, y `FieldRow` no lo dibujaba nadie: el par
   * ciudad/zona que iba a usarlo era el del `PublishForm` que la 3.9(c)
   * reemplazó por `PublishStep`, y ese asistente **no pregunta la ciudad en
   * ningún paso** (medido: `layout.spec.ts` → «3.9: la ciudad no se pregunta
   * en ninguna parte del paso»). El par para el que existía no puede existir.
   *
   * Se borra con la pieza en vez de reapuntarla a otra hoja, por la misma
   * razón que la 14.42 dejó escrita más arriba: una aserción mudada de sujeto
   * dice seguir protegiendo lo de antes y protege otra cosa.
   */
});

/** Cada componente entregado bajo un directorio, recorriendo el árbol. */
function shippedComponents(root: string): readonly string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return shippedComponents(path);
    if (extname(entry.name) !== ".tsx" || entry.name.includes(".test.")) return [];
    return [path];
  });
}

/**
 * **Que `Field` lo componga alguien, y no sólo esta prueba (1b.5).**
 *
 * Es la lección de la 8.9 escrita como aserción en vez de como párrafo.
 * `FieldRow` se entregó probado y sin que lo dibujara nadie, y su prueba
 * estuvo verde hasta el día que se borró la pieza entera: una aserción sobre
 * un componente sin consumidor no protege el producto, protege un archivo.
 * `Field` está hoy a un consumidor de esa misma situación —`ContactBlock` es
 * el único—, y lo que lo delató fue contar, no leer la cabecera de arriba, que
 * nombraba tres.
 *
 * **Se cuenta del árbol y no de una lista**: una lista de consumidores se
 * pondría roja al AGREGAR uno, que es justo el movimiento que esta tarea
 * quiere. Ésta sólo se pone roja cuando desaparece el último.
 */
describe("el campo del sistema tiene quien lo dibuje (1b.5)", () => {
  const consumers = ["components", "app"]
    .flatMap(shippedComponents)
    .filter((path) => path !== join("components", "molecules", "Field.tsx"))
    .filter((path) => /<Field[\s/>]/.test(readFileSync(path, "utf-8")));

  // Sin esto, un recorrido que se leyera vacío dejaría la afirmación de abajo
  // comparando nada contra nada.
  it("la guarda: el recorrido encuentra los componentes entregados", () => {
    expect(["components", "app"].flatMap(shippedComponents).length).toBeGreaterThan(20);
  });

  it("lo compone código entregado, no sólo esta prueba", () => {
    expect(consumers).not.toEqual([]);
  });
});

/**
 * **El velo de los modales (14.46), medido por lo que produce.**
 *
 * `lint:tokens` prueba que ninguna hoja escribe un literal. No prueba **qué
 * color sale**, y ésa es exactamente la diferencia que esta tarea existe para
 * cubrir: `SearchPanel.module.css` tapaba el viewport con `background:
 * var(--surface)` —un token, cero quejas del gate— y el resultado era una hoja
 * opaca donde la lámina dibuja un modal. Una aserción de que `--scrim` está
 * declarado tendría el mismo defecto: un velo opaco lo cumpliría.
 *
 * Se miden dos cosas que un token opaco no puede fingir: que deja pasar lo de
 * atrás (alfa entre 0 y 1) y que, compuesto sobre el fondo de la página,
 * **aleja** ese fondo de la lámina que va encima en vez de acercarlo. Lo
 * segundo es lo que obliga al par claro/oscuro: el mismo velo oscuro que en
 * `menta` separa 3,9:1 deja `oscuro` PEOR que sin velo, porque oscurecer un
 * fondo ya oscuro no separa nada.
 */
describe("el velo de los modales (14.46)", () => {
  const panelCss = readFileSync("components/organisms/SearchPanel.module.css", "utf-8");
  const doorCss = readFileSync("components/organisms/SignInDoor.module.css", "utf-8");
  const linterSource = readFileSync("scripts/lint-tokens.mjs", "utf-8");
  const themes = ["menta", "oscuro"] as const;

  it.each(themes)("%s: el velo deja ver la lista — no es una lámina opaca", (theme) => {
    const scrim = themeColor(theme, "--scrim");
    const alpha = alphaOf(scrim);
    expect(alpha).toBeGreaterThan(0);
    expect(alpha).toBeLessThan(1);
  });

  it.each(themes)("%s: el velo aleja el fondo de la lámina, no lo acerca", (theme) => {
    const bg = themeColor(theme, "--bg");
    const surface = themeColor(theme, "--surface");
    const veiled = compositeOver(themeColor(theme, "--scrim"), bg);

    // La cota no es un número inventado: es lo que el propio tema ya separa sin
    // velo. Pedir más sería inventar una regla; pedir menos es dejar pasar un
    // velo que empeora la pantalla, que es lo que hace el velo claro en oscuro.
    expect(contrastRatio(veiled, surface)).toBeGreaterThan(contrastRatio(bg, surface));
  });

  it("el par existe de verdad: los dos temas no repiten el mismo velo", () => {
    expect(themeColor("menta", "--scrim")).not.toBe(themeColor("oscuro", "--scrim"));
  });

  it("el modal de filtros se dibuja sobre el velo y su hoja conserva --surface", () => {
    expect(block(panelCss, "panel")).toContain("background: var(--scrim)");
    // El par de la negativa: sin esto, borrar el fondo de la hoja dejaría el
    // texto del panel sobre el velo y esta prueba seguiría verde.
    expect(block(panelCss, "sheet")).toContain("background: var(--surface)");
  });

  it("la puerta usa el mismo velo: un valor, un nombre (16.22)", () => {
    expect(block(doorCss, "veil")).toContain("background: var(--scrim)");
    expect(linterSource).toContain('["--door-veil", "--scrim"]');
  });
});
