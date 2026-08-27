import { initialsFrom } from "./account-initials";

/**
 * La barra, en sus tres estados (tasks.md 20.4; diseño §14a). "Sesión" y
 * "agencia" dibujan la MISMA barra — la diferencia entre ellas (importar
 * cartera) vive sólo en el menú de cuenta (14b), nunca acá. Por eso el
 * discriminante que importa a esta barra es binario: hay sesión o no la hay.
 */
export interface NavSession {
  readonly name: string | null;
  readonly email: string | null;
  /**
   * `user.image` queda NULL a propósito hoy (schema.ts, "Minimal Identity
   * Data"), así que este campo nunca llega poblado en producción todavía.
   * Se mantiene en la forma para que un futuro puerto que sí la traiga no
   * tenga que reabrir esta decisión — ver design-contract del apply-progress
   * de este trabajo.
   */
  readonly imageUrl?: string | null;
}

export interface NavAccountFlags {
  readonly bulkImportEnabled: boolean;
}

interface NavAccountAnonymous {
  readonly kind: "anonymous";
}

export interface NavAccountAuthenticated {
  readonly kind: "authenticated";
  readonly displayName: string;
  readonly email: string | null;
  readonly initials: string;
  readonly imageUrl: string | null;
  /** Sólo importa al menú de cuenta (14b), nunca a la barra. */
  readonly canImportListings: boolean;
}

export type NavAccount = NavAccountAnonymous | NavAccountAuthenticated;

const FALLBACK_DISPLAY_NAME = "Tu cuenta";

export function resolveNavAccount(session: NavSession | null, flags?: NavAccountFlags): NavAccount {
  if (session === null) return { kind: "anonymous" };

  const name = session.name?.trim() || null;
  const email = session.email?.trim() || null;

  return {
    kind: "authenticated",
    displayName: name ?? email ?? FALLBACK_DISPLAY_NAME,
    email,
    initials: initialsFrom(name, email),
    imageUrl: session.imageUrl ?? null,
    canImportListings: flags?.bulkImportEnabled ?? false,
  };
}

export interface NavPublishAction {
  readonly label: string;
  readonly emphasis: "accent" | "outline";
}

export interface NavPublish {
  /**
   * Siempre presente. Sin sesión va afuera en acento — "es cuando hay que
   * provocar" (14.38). Con sesión sigue en la barra (neutro) en escritorio;
   * en móvil la hoja de estilos la esconde bajo el punto de quiebre porque
   * se muda al menú — la MISMA decisión, resuelta en CSS y no en una
   * segunda rama de este dominio, porque "dónde cabe" es geometría.
   */
  readonly bar: NavPublishAction;
  /** Sólo con sesión: la primera fila del menú de cuenta, en acento. */
  readonly menu: NavPublishAction | null;
}

export function resolveNavPublish(account: NavAccount): NavPublish {
  if (account.kind === "anonymous") {
    return { bar: { label: "Publicar gratis", emphasis: "accent" }, menu: null };
  }

  return {
    bar: { label: "Publicar", emphasis: "outline" },
    menu: { label: "Publicar una propiedad", emphasis: "accent" },
  };
}

/** Una fila del menú de cuenta (14b). Misma forma que `AccountMenuItem`. */
export interface AccountMenuEntry {
  readonly label: string;
  readonly href: string;
  readonly emphasis?: "accent";
}

/**
 * Las filas del menú de cuenta (lámina 14b) — **la única pieza del producto
 * que mira `canImportListings`**.
 *
 * Hasta este trabajo ese campo se calculaba acá, se probaba acá y no lo leía
 * nadie: `Nav.tsx` escribía su lista de filas a mano. Una regla que sólo vive
 * en un componente no la alcanza el piso de 90% (AGENTS.md §1), y ésta lo
 * demostró quedando muerta sin que ninguna prueba se pusiera roja.
 *
 * **La lámina dibuja cinco filas y acá hay tres.** «Mis datos» y «Salir» son
 * pantallas que todavía no existen, y una fila que lleva a un enlace roto es
 * peor que una fila ausente (AGENTS.md §7). Anotado como desvío en tasks.md
 * 9.26, no resuelto en silencio.
 *
 * **`/importar` no es la única puerta, y no debe serlo**: la lámina 14d pone
 * «Importar cartera» dentro de `/mis-avisos` ("importar vive acá, no en la
 * navegación global"), que es la que funciona con JavaScript apagado. Ésta es
 * el atajo de 14b, no el camino.
 */
export function resolveAccountMenuItems(
  account: NavAccount,
  publish: NavPublish,
): readonly AccountMenuEntry[] {
  if (account.kind === "anonymous") return [];

  const items: AccountMenuEntry[] = [];
  if (publish.menu) {
    items.push({ label: publish.menu.label, href: "/publicar", emphasis: "accent" });
  }
  items.push({ label: "Mis avisos", href: "/mis-avisos" });
  if (account.canImportListings) {
    items.push({ label: "Importar cartera", href: "/importar" });
  }
  return items;
}
