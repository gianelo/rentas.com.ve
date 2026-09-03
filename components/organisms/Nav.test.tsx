import { readFileSync } from "node:fs";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { resolveAccountMenuItems } from "@/modules/identity/domain/nav-account";
import type { AccountMenuProps } from "./AccountMenu";
import { Nav, type NavProps } from "./Nav";

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
    hasListings: true,
  };
  const publish = {
    bar: { label: "Publicar", emphasis: "outline" as const },
    menu: { label: "Publicar una propiedad", emphasis: "accent" as const },
  };

  /**
   * tasks.md 14.56 — **la barra no decide esto, lo lee.** `hasListings` lo
   * resuelve `resolveNavAccount` con lo que el `EXISTS` del puerto contestó;
   * acá sólo se comprueba que el estado llega hasta el marcado sin que este
   * componente escriba un `if` sobre datos (AGENTS.md §1).
   *
   * **Y sigue habiendo por dónde entrar**: el enlace real a `/mis-avisos` no
   * se toca —quien no publicó igual puede llegar y ver la pantalla vacía si
   * quiere—, lo que se va es la PROMESA escrita en la barra.
   */
  it("sin avisos, el disparador se queda sin palabras y conserva su nombre accesible", () => {
    const sinAvisos = { ...account, hasListings: false };

    const html = renderToStaticMarkup(
      <Nav account={sinAvisos} publish={publish} pill={PILL} signInHref="/signin" />,
    );

    expect(html).not.toMatch(/>Mis avisos</);
    expect(html).toContain('aria-label="Mis avisos"');
    expect(html).toMatch(/<a[^>]*href="\/mis-avisos"/);
  });

  it("con avisos, las palabras vuelven — y es el ÚNICO cambio entre los dos estados", () => {
    const conAvisos = renderToStaticMarkup(
      <Nav account={account} publish={publish} pill={PILL} signInHref="/signin" />,
    );
    const sinAvisos = renderToStaticMarkup(
      <Nav
        account={{ ...account, hasListings: false }}
        publish={publish}
        pill={PILL}
        signInHref="/signin"
      />,
    );

    expect(conAvisos).toMatch(/>Mis avisos</);
    expect(conAvisos).not.toBe(sinAvisos);
  });

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

/**
 * **El encabezado tiene UNA sola forma** (tasks.md 14.54).
 *
 * Tenía tres: la de la pastilla, la de la vuelta (`NavWithReturn`) y la del
 * publicador (`NavWithListing`, que la 14.43 agregó y esta tarea revierte
 * entera). La vuelta se fue al contenido —la ficha y `/reportar` la dibujan
 * arriba del suyo, como `/importar` y `/mis-avisos/[id]/editar` ya hacían— y la
 * placa se fue porque `ContactBlock` ya dice «publica como dueño» al lado del
 * nombre y del teléfono, que es donde el inquilino la lee justo antes de
 * escribir.
 *
 * Lo que queda es una interfaz y no una unión: los mismos campos en las cinco
 * pantallas, con la pastilla opcional porque una ficha no es una búsqueda.
 */
describe("Nav — una sola forma (14.54)", () => {
  const ficha: NavProps = {
    account: { kind: "anonymous" },
    publish: { bar: { label: "Publicar gratis", emphasis: "accent" }, menu: null },
    signInHref: "/signin",
  };

  it("sin pastilla no dibuja ningún formulario de búsqueda: una ficha no es una búsqueda", () => {
    const html = renderToStaticMarkup(<Nav {...ficha} />);

    expect(html).not.toContain("<form");
    expect(html).not.toContain('type="search"');
  });

  /**
   * **La marca se dibuja UNA vez, y ahí está el defecto que esta forma borra.**
   * Con `back` en el primer slot, la ficha dibujaba la marca en el del medio
   * (`.brandCentre`); sin `back`, ese segundo `rentas.` sería una marca
   * duplicada en toda pantalla sin pastilla. No lo ve `typecheck` ni una regla
   * de hoja: la única forma de verlo es contarla.
   */
  it("dibuja la marca una sola vez, con pastilla y sin ella", () => {
    const conteo = (html: string) => html.split(">rentas.<").length - 1;

    expect(conteo(renderToStaticMarkup(<Nav {...ficha} />))).toBe(1);
    expect(conteo(renderToStaticMarkup(<Nav {...ficha} pill={PILL} />))).toBe(1);
  });

  /**
   * **Lo comprueba `tsc` y no el runtime**: si la unión volviera, estos dos
   * `@ts-expect-error` quedarían sin usar y `pnpm typecheck` fallaría. Es la
   * misma forma de garantía que `ListingSearchPort` ya usa acá — «no hay
   * `searchAll` ni un valor comodín».
   */
  it("el tipo ya no admite ni vuelta ni publicador", () => {
    // @ts-expect-error — la vuelta la dibuja el contenido, no la barra (14.54)
    const conVuelta: NavProps = { ...ficha, back: { href: "/alquiler", label: "← Resultados" } };
    // @ts-expect-error — el publicador lo dice `ContactBlock`, no el encabezado (14.54)
    const conPlaca: NavProps = { ...ficha, publisher: "owner" };

    expect(conVuelta).toBeDefined();
    expect(conPlaca).toBeDefined();
  });

  /**
   * **La hoja se va con el marcado.** Una regla huérfana no pone nada en rojo
   * —es el mismo hueco que la 14.42 dejó escrito con `--searchbar-h`— y acá
   * además describiría una disposición que ya no existe.
   */
  it("la hoja no conserva las reglas de las formas que se fueron", () => {
    expect(navCss).not.toContain(".back");
    expect(navCss).not.toContain(".brandCentre");
    expect(navCss).not.toContain(".publisher");
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
