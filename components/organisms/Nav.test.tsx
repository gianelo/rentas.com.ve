import { readFileSync } from "node:fs";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { resolveAccountMenuItems } from "@/modules/identity/domain/nav-account";
import type { AccountMenuProps } from "./AccountMenu";
import { Nav, type NavBackAction, type NavProps, type NavWithReturn } from "./Nav";

/**
 * Las filas viven detrás del estado `open` de `AccountMenu`, así que el HTML
 * del servidor no las trae. En vez de hidratar, se lee el árbol de React que
 * `Nav` devuelve y se toman las props con las que llama al menú: es la MISMA
 * pregunta —qué filas ofrece esta cuenta— sin montar un navegador para ella.
 */
function accountMenuItemsOf(element: ReactElement): readonly AccountMenuProps["items"][number][] {
  const found = findAccountMenu(element as unknown as ReactNode);
  if (!found) throw new Error("Nav no dibujó el control de cuenta");
  return found.items;
}

function findAccountMenu(node: ReactNode): AccountMenuProps | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findAccountMenu(child);
      if (found) return found;
    }
    return null;
  }
  if (!isValidElement(node)) return null;
  const element = node as ReactElement<{ children?: ReactNode }>;
  if (typeof element.type === "function") {
    if (element.type.name === "AccountMenu") return element.props as unknown as AccountMenuProps;
    // Se ejecuta el componente para ver QUÉ devuelve. Un recorrido que sólo
    // mirara `props.children` nunca entraría en `Nav`, que no recibe hijos:
    // sus hijos son lo que su cuerpo construye.
    const rendered = (element.type as (props: unknown) => ReactNode)(element.props);
    return findAccountMenu(rendered);
  }
  return findAccountMenu(element.props.children ?? null);
}

const navCss = readFileSync("components/organisms/Nav.module.css", "utf-8");

/**
 * La hoja es «móvil primero»: lo que está antes del primer `@media` es el
 * teléfono, y `@media (min-width: 768px)` es el escritorio. Separarlas es lo
 * que permite afirmar QUÉ ancho hace qué — una comprobación sobre el archivo
 * entero no distingue las dos, y ése es exactamente el falso verde que la
 * prueba móvil de `SearchPill` ya tuvo que corregir una vez.
 */
const MOBILE_CSS = navCss.slice(0, navCss.indexOf("@media"));
const DESKTOP_CSS = (() => {
  const at = navCss.indexOf("@media (min-width: 768px)");
  if (at < 0) throw new Error("Nav.module.css: falta el bloque de escritorio");
  return navCss.slice(at);
})();

function rule(css: string, selector: string): string {
  const match = css.match(new RegExp(`\\.${selector}\\s*\\{([^}]*)\\}`));
  if (!match) throw new Error(`falta la regla .${selector}`);
  return match[1] ?? "";
}

const PILL = {
  action: "/",
  name: "zona",
  value: "",
  placeholder: "¿En qué zona buscás?",
  submitLabel: "Buscar",
  state: { kind: "empty" as const },
};

/**
 * La navegación (diseño 14a), presente en toda pantalla salvo el flujo de
 * publicar (§7 de esa especificación no menciona un nav — un buscador en
 * medio de un embudo de nueve pasos es una salida justo donde menos
 * conviene) y `/renovar/[token]` (ruta bare, sin estilo, deliberadamente).
 */
describe("Nav — sin sesión", () => {
  const account = { kind: "anonymous" as const };
  const publish = { bar: { label: "Publicar gratis", emphasis: "accent" as const }, menu: null };

  it("Publicar gratis en acento y Entrar, los dos con destino real", () => {
    const html = renderToStaticMarkup(
      <Nav account={account} publish={publish} pill={PILL} signInHref="/signin" />,
    );

    expect(html).toContain("Publicar gratis");
    expect(html).toMatch(/<a[^>]*href="\/publicar"[^>]*>Publicar gratis/);
    expect(html).toMatch(/<a[^>]*href="\/signin"[^>]*>Entrar/);
  });

  it("la marca es un enlace real a «/» y no un botón", () => {
    const html = renderToStaticMarkup(
      <Nav account={account} publish={publish} pill={PILL} signInHref="/signin" />,
    );

    expect(html).toMatch(/<a[^>]*href="\/"[^>]*>rentas\./);
  });

  it('nunca un href="#", en ningún estado', () => {
    const html = renderToStaticMarkup(
      <Nav account={account} publish={publish} pill={PILL} signInHref="/signin" />,
    );

    expect(html).not.toContain('href="#"');
  });
});

describe("Nav — con sesión", () => {
  const account = {
    kind: "authenticated" as const,
    displayName: "María Fernández",
    email: "maria.f@gmail.com",
    initials: "MF",
    imageUrl: null,
    canImportListings: false,
  };
  const publish = {
    bar: { label: "Publicar", emphasis: "outline" as const },
    menu: { label: "Publicar una propiedad", emphasis: "accent" as const },
  };

  it("Publicar queda neutro (contorno) y el control de cuenta lleva a /mis-avisos", () => {
    const html = renderToStaticMarkup(
      <Nav account={account} publish={publish} pill={PILL} signInHref="/signin" />,
    );

    expect(html).toMatch(/<a[^>]*href="\/publicar"[^>]*>Publicar</);
    expect(html).not.toContain("Publicar gratis");
    expect(html).toMatch(/<a[^>]*href="\/mis-avisos"/);
    expect(html).toContain("MF");
  });

  it("agencia y sesión dibujan la MISMA barra (20.4) — la única diferencia es interna al menú, no visible acá", () => {
    const agency = { ...account, canImportListings: true };

    const sessionHtml = renderToStaticMarkup(
      <Nav account={account} publish={publish} pill={PILL} signInHref="/signin" />,
    );
    const agencyHtml = renderToStaticMarkup(
      <Nav account={agency} publish={publish} pill={PILL} signInHref="/signin" />,
    );

    expect(agencyHtml).toBe(sessionHtml);
  });

  /**
   * **La barra dibuja igual; el menú NO.** La prueba de arriba compara los
   * bytes del servidor, donde el panel está cerrado y por eso las filas no
   * salen — así que por sí sola no distingue "la agencia no cambia la barra"
   * de "`canImportListings` no lo lee nadie", que es exactamente lo que
   * pasaba antes de este trabajo. Ésta mira las filas que `Nav` le PASA al
   * menú, que es donde vive la diferencia.
   */
  it("le entrega al menú las filas que decide el dominio, «Importar cartera» incluida", () => {
    const agency = { ...account, canImportListings: true };

    expect(
      accountMenuItemsOf(
        <Nav account={agency} publish={publish} pill={PILL} signInHref="/signin" />,
      ),
    ).toEqual(resolveAccountMenuItems(agency, publish));
    expect(
      accountMenuItemsOf(
        <Nav account={account} publish={publish} pill={PILL} signInHref="/signin" />,
      ),
    ).toEqual(resolveAccountMenuItems(account, publish));
  });
});

describe("Nav — la ficha, según sus dos láminas", () => {
  // `NavWithReturn` y no `NavProps`: esparcir la unión en JSX la ensancha a
  // algo que podría traer `pill`, y el tipo dejaría de decir lo que dice.
  const ficha: NavWithReturn = {
    account: { kind: "anonymous" },
    publish: { bar: { label: "Publicar gratis", emphasis: "accent" }, menu: null },
    signInHref: "/signin",
    back: { href: "/alquiler/maracaibo", label: "← Resultados" },
  };

  function draw(back: NavBackAction = ficha.back) {
    return renderToStaticMarkup(<Nav {...ficha} back={back} />);
  }

  it("el enlace de vuelta es un enlace real, con el destino que le dan", () => {
    // Dos aserciones separadas y no un único regex ordenado: el orden en que
    // React serializa los atributos de un elemento es un detalle de
    // implementación de `next/link`, no un contrato de este componente.
    expect(draw()).toContain('href="/alquiler/maracaibo"');
    expect(draw()).not.toContain('href="#"');
  });

  /**
   * **El texto del enlace se DIBUJA, no se esconde detrás de un `aria-label`.**
   *
   * `resultsLink` (listing-discovery) devuelve dos etiquetas distintas para dos
   * acciones distintas: «← Resultados» cuando hay una búsqueda a la que volver,
   * y «Ver avisos en Chacao» cuando no la hay — y su propio comentario dice que
   * en ese segundo caso «su texto no dice volver». Un `←` solo, con la etiqueta
   * escondida, dibuja las dos iguales: le promete a quien llegó desde Google
   * una vuelta que nunca existió.
   *
   * Las dos láminas de la ficha lo dibujan visible («← Resultados»), así que
   * esto además es lo que el diseño pide.
   */
  it("dibuja el texto de la vuelta, que es el que decide el dominio", () => {
    // `>texto<` y no `toContain(texto)`: la versión suelta también pasaba con
    // el texto escondido dentro de un `aria-label`, que es justo lo que esta
    // prueba tiene que poder distinguir. Mismo defecto que la prueba móvil de
    // `SearchPill` ya corrigió una vez.
    expect(draw()).toContain(">← Resultados<");
    expect(draw({ href: "/alquiler/x/y", label: "Ver avisos en Chacao" })).toContain(
      ">Ver avisos en Chacao<",
    );
  });

  it("no duplica el nombre accesible en un aria-label", () => {
    expect(draw()).not.toContain('aria-label="←');
  });

  /**
   * **RESUELTO por el fundador: «seguí el diseño, que fue lo que se decidió
   * acá».** La 14.38 escribía que «la marca cede su lugar al ←», y eso vale
   * SÓLO en móvil: la lámina 11 (escritorio 1280) dibuja un encabezado de tres
   * hijos —`← Resultados` · `rentas` · `Publicar gratis`— con la marca en el
   * medio, y la lámina 10 (móvil 360) dibuja dos, sin marca, porque a 360 px no
   * caben tres. Las dos láminas tienen razón: describen anchos distintos.
   *
   * Por eso la marca **está en el marcado** también en la ficha, y es el ancho
   * el que decide si se ve — un solo componente con puntos de quiebre, nunca
   * dos implementaciones (el mismo argumento que `SearchFilters` y
   * `app/home.module.css` ya dejaron escrito acá).
   */
  it("la marca sigue en el marcado y sigue llevando al inicio", () => {
    expect(draw()).toContain(">rentas.<");
    expect(draw()).toMatch(/<a[^>]*href="\/"[^>]*>rentas\./);
  });

  it("en móvil la marca no se dibuja: el ← le tomó el lugar (lámina 10)", () => {
    expect(rule(MOBILE_CSS, "brandCentre")).toMatch(/display:\s*none/);
  });

  it("en escritorio la marca vuelve, y va al centro (lámina 11)", () => {
    expect(rule(DESKTOP_CSS, "brandCentre")).toMatch(/display:\s*flex/);
    expect(rule(DESKTOP_CSS, "brandCentre")).toMatch(/justify-content:\s*center/);
  });

  /**
   * **Ninguna de las dos láminas de la ficha dibuja la pastilla.** Eso acota la
   * 14i —«la pastilla aparece en todas las páginas»— a «en todas menos la
   * ficha»: una ficha no es una búsqueda, y el encabezado de la lámina 11 gasta
   * su slot central en la marca.
   */
  it("sin pastilla no dibuja ningún formulario de búsqueda", () => {
    const html = draw();

    expect(html).not.toContain("<form");
    expect(html).not.toContain("<search>");
    expect(html).not.toContain('type="search"');
  });

  /**
   * **El tipo hace inexpresable la combinación que el diseño no admite.**
   *
   * `back` ya estuvo mal una vez y sólo lo destapó su primer llamador real. La
   * ficha es un segundo llamador con otro contrato —vuelta sí, pastilla no—, y
   * dejar las dos opcionales admitiría en silencio una ficha con pastilla y una
   * pantalla de resultados con flecha de vuelta, que es justo lo que el
   * fundador acaba de decidir que no va.
   *
   * Lo comprueba `tsc`, no el runtime: si `NavProps` volviera a admitirlas
   * juntas, este `@ts-expect-error` quedaría sin usar y `pnpm typecheck`
   * fallaría. Es la misma forma de garantía que `ListingSearchPort` ya usa —
   * «no hay `searchAll` ni un valor comodín».
   */
  it("el tipo prohíbe pastilla y vuelta a la vez", () => {
    // @ts-expect-error — `pill` y `back` se excluyen (láminas 10 y 11: la ficha no lleva pastilla)
    const imposible: NavProps = { ...ficha, pill: PILL };

    expect(imposible).toBeDefined();
  });
});

describe("Nav — geometría de escritorio (14a: 250 / 420 / 250)", () => {
  it("las dos columnas laterales fijas están en la hoja de estilos — la del medio la da la pastilla (SearchPill)", () => {
    expect(navCss).toMatch(/grid-template-columns:\s*250px\s+1fr\s+250px/);
  });

  it("con sesión, Publicar se esconde en móvil — se muda al menú (14.38)", () => {
    expect(navCss).toMatch(/@media[^{]*\{[\s\S]*publishAuth[\s\S]*display:\s*none/);
  });
});
