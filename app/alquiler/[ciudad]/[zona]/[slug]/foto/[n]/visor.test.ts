import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { contrastRatio } from "@/../components/contrast";

const DIR = "app/alquiler/[ciudad]/[zona]/[slug]/foto/[n]";
const page = readFileSync(`${DIR}/page.tsx`, "utf-8");
const css = readFileSync(`${DIR}/visor.module.css`, "utf-8");
const keys = readFileSync(`${DIR}/PhotoViewerKeys.tsx`, "utf-8");
const tokens = readFileSync("src/styles/tokens.css", "utf-8");

/** El cuerpo de un bloque de reglas, para leer una declaración concreta. */
function block(selector: string): string {
  const match = css.match(new RegExp(`\\.${selector}\\s*\\{([^}]*)\\}`));
  if (!match) throw new Error(`visor.module.css: falta .${selector}`);
  return match[1] ?? "";
}

describe("la página no decide nada (la regla que no se negocia)", () => {
  /**
   * **Ninguna regla de negocio vive en `app/`.** Qué foto pide una URL, cuál
   * es la anterior, si el visor da la vuelta y a dónde lleva la salida son
   * decisiones de `src/modules/listing-discovery/domain/photo-viewer.ts`. La
   * página lee parámetros, consulta y dibuja.
   */
  it("delega la resolución en el dominio", () => {
    expect(page).toContain("resolvePhotoViewer");
    expect(page).toContain("@/modules/listing-discovery/domain/photo-viewer");
  });

  /**
   * La traducción base uno / base cero es la regla que más fácil se copia mal.
   * Si aparece acá un `+ 1` o un `- 1` sobre el número de la foto, es que se
   * reescribió en la pantalla.
   */
  it("no reescribe la traducción entre el número de la URL y la posición", () => {
    expect(page).not.toMatch(/\bn\s*[-+]\s*1\b/);
    expect(page).not.toMatch(/position\s*\+\s*1/);
    expect(page).not.toMatch(/number\s*-\s*1/);
  });

  /**
   * Ni arma un solo destino a mano. La única plantilla con `/foto/` que la
   * página escribe es la ruta que le PIDIERON — Next no le da la URL a un
   * componente de servidor, así que rearmarla desde los parámetros es la
   * entrada del dominio, no una decisión. Todo lo que sale es del dominio.
   */
  it("todos los destinos que dibuja vienen del dominio", () => {
    const destinations = [...page.matchAll(/href=\{([^}]+)\}/g)].map((match) => match[1]?.trim());

    expect(destinations.length).toBeGreaterThan(0);
    expect(new Set(destinations)).toEqual(
      new Set(["view.exitHref", "view.previousHref", "view.nextHref", "item.href"]),
    );
  });

  it("sólo rearma la ruta pedida, y una sola vez por entrada", () => {
    expect(page.match(/\$\{[^}]*\}\/foto\//g)).toHaveLength(2);
    expect(page).not.toMatch(/href=\{`/);
  });

  it("cada resolución tiene su salida: 404, redirección o vista", () => {
    expect(page).toContain("notFound()");
    expect(page).toContain("redirect(");
  });

  /**
   * **Un viaje a Neon por petición, no dos.** `generateMetadata` y el
   * componente piden el mismo aviso y las mismas fotos; sin `cache` cada foto
   * abierta paga dos veces lo mismo. Es el error que ya se cometió en la ficha
   * y hubo que arreglar.
   */
  it("deduplica la consulta entre generateMetadata y el componente", () => {
    expect(page).toContain("cache(");
    expect(page).toContain('from "react"');
    expect(page).toContain("generateMetadata");
  });

  /** Las dos consultas salen juntas: contra Neon cada una es un viaje HTTP. */
  it("pide el aviso y las fotos en paralelo", () => {
    expect(page).toContain("Promise.all");
  });
});

describe("anterior y siguiente son enlaces reales (16.7)", () => {
  /**
   * **La consecuencia es lo que importa:** con enlaces, el botón "atrás" del
   * navegador retrocede UNA FOTO en vez de salir del aviso. Eso lo da el
   * historial de navegación, no un manejador — por eso no hay nada que
   * programar, y por eso hay que impedir que alguien lo convierta en estado de
   * cliente.
   */
  it("la página del visor no lleva JavaScript de cliente", () => {
    expect(page).not.toContain('"use client"');
  });

  it("dibuja anterior y siguiente como <a href>, tomados del dominio", () => {
    expect(page).toContain("previousHref");
    expect(page).toContain("nextHref");
    expect(page).toMatch(/href=\{view\.previousHref\}/);
    expect(page).toMatch(/href=\{view\.nextHref\}/);
  });

  /**
   * En la primera y en la última no hay enlace, y no se dibuja uno apagado:
   * un `<a>` sin `href` no es un enlace deshabilitado, es un enlace que el
   * teclado no alcanza y que el lector de pantalla anuncia igual.
   */
  it("no dibuja el enlace que el dominio dice que no existe", () => {
    expect(page).toMatch(/view\.previousHref\s*(\?|===|!==|&&)/);
    expect(page).toMatch(/view\.nextHref\s*(\?|===|!==|&&)/);
  });

  /** La salida de vuelta a la ficha, que el visor tiene que tener. */
  it("tiene una salida clara al aviso", () => {
    expect(page).toContain("view.exitHref");
    expect(page).toContain("Ver el aviso");
  });
});

describe("el teclado es una mejora encima de los enlaces (16.33)", () => {
  /**
   * **El orden de los dos criterios es la regla.** Criterio 8: funciona sin
   * JavaScript. Criterio 9: se navega con el teclado. Sólo son compatibles si
   * los enlaces van primero y el teclado va encima — nunca al revés.
   */
  it("el manejador de teclas es un componente de cliente aparte", () => {
    expect(keys).toContain('"use client"');
    expect(page).toContain("PhotoViewerKeys");
  });

  it("atiende flecha izquierda, flecha derecha y Escape", () => {
    expect(keys).toContain("ArrowLeft");
    expect(keys).toContain("ArrowRight");
    expect(keys).toContain("Escape");
  });

  /**
   * **Navega a un href que YA está en el DOM.** No recibe rutas por props ni
   * las calcula: busca el enlace y lo activa. Así el teclado no puede llevar a
   * un lugar distinto del que lleva el enlace visible, y en la primera foto la
   * flecha izquierda no hace nada por la misma razón por la que no hay enlace
   * — porque no está.
   */
  it("no calcula ninguna ruta: activa el enlace que ya existe", () => {
    expect(keys).toContain("querySelector");
    expect(keys).not.toContain("/foto/");
    expect(keys).not.toMatch(/[-+]\s*1\b/);
  });

  it("no hace nada cuando el enlace no está", () => {
    expect(keys).toMatch(/if\s*\(!\s*link\)/);
  });

  /**
   * **El enganche entre los dos archivos, que es lo único que puede romperse
   * en silencio.** El manejador busca por atributo; si la página deja de
   * ponerlo, el teclado se apaga sin un error, sin un test rojo y sin que
   * nada se vea distinto — porque los enlaces siguen ahí y funcionando. Esta
   * comparación es la que convierte esa rotura en un fallo.
   */
  it("cada selector del manejador existe en la página", () => {
    const selectors = [...keys.matchAll(/\[data-viewer-key="([^"]+)"\]/g)].map((match) => match[1]);

    expect(new Set(selectors)).toEqual(new Set(["previous", "next", "exit"]));
    for (const name of selectors) expect(page).toContain(`data-viewer-key="${name}"`);
  });

  /** Un atajo del navegador (abrir en pestaña nueva) sigue siendo suyo. */
  it("deja pasar las teclas con modificador", () => {
    expect(keys).toContain("metaKey");
    expect(keys).toContain("ctrlKey");
  });
});

describe("la paleta del visor está fuera del tema, a propósito (16.27)", () => {
  const VIEWER_TOKENS: [string, string][] = [
    ["--viewer-bg", "#131517"],
    ["--viewer-ink", "#f2f3f3"],
    ["--viewer-soft", "rgba(242, 243, 243, 0.62)"],
    ["--viewer-line", "rgba(242, 243, 243, 0.24)"],
  ];

  it.each(VIEWER_TOKENS)("%s vale exactamente lo que fija la especificación", (name, value) => {
    expect(tokens).toContain(`${name}: ${value};`);
  });

  /**
   * **La razón, para que nadie los "corrija" a los tokens del tema.** Una
   * fotografía se mira sobre gris muy oscuro y neutro: cualquier tinte le
   * cambia la temperatura al ojo. El visor es la única pantalla cuyo contenido
   * ES la imagen, así que es la única que no puede tomar el color del tema.
   */
  it("declara los cuatro en :root y NO dentro de un tema", () => {
    const themeBlocks = [...tokens.matchAll(/\[data-theme="[^"]+"\]\s*\{([^}]*)\}/g)].map(
      (match) => match[1] ?? "",
    );

    expect(themeBlocks.length).toBeGreaterThan(0);
    for (const [name] of VIEWER_TOKENS) {
      for (const body of themeBlocks) expect(body).not.toContain(name);
    }
  });

  it("deja escrita la razón junto a los valores", () => {
    const reason = tokens.slice(
      tokens.indexOf("--viewer-bg") - 1400,
      tokens.indexOf("--viewer-bg"),
    );

    expect(reason.toLowerCase()).toContain("temperatura");
    expect(reason.toLowerCase()).toContain("fuera del tema");
  });

  /** El texto sobre el fondo del visor cumple AA como en cualquier pantalla. */
  it("el texto del visor contrasta con su fondo (AA)", () => {
    expect(contrastRatio("#f2f3f3", "#131517")).toBeGreaterThanOrEqual(4.5);
  });

  /** La hoja del visor toma los suyos y ninguno del tema para pintar. */
  it("la hoja pinta con los tokens del visor, no con los del tema", () => {
    expect(block("page")).toContain("var(--viewer-bg)");
    expect(block("page")).toContain("var(--viewer-ink)");
    expect(css).not.toMatch(/(?:background|color):\s*var\(--(?:bg|ink|surface|soft|accent)\)/);
  });
});

describe("reglas transversales de la hoja", () => {
  /** El texto tenue es un token, nunca una opacidad. */
  it("no atenúa nada con opacity", () => {
    expect(css).not.toMatch(/opacity/);
  });

  it("declara un único punto de quiebre, el del proyecto", () => {
    const queries = [...css.matchAll(/@media([^{]+)\{/g)].map((match) => match[1]?.trim());

    expect(queries.length).toBeGreaterThan(0);
    expect(new Set(queries)).toEqual(new Set(["(min-width: 768px)"]));
  });

  /** Las zonas de toque de cada lado son del diseño, y salen de un token. */
  it("las zonas de toque y las miniaturas salen de tokens", () => {
    expect(css).toContain("var(--viewer-tap-w)");
    expect(css).toContain("var(--viewer-thumb-w)");
    expect(css).toContain("var(--viewer-thumb-h)");
  });

  it("el foco de teclado se ve en cada enlace de navegación", () => {
    expect(css).toMatch(/:focus-visible\s*\{[^}]*outline:\s*(?!none)/);
  });
});
