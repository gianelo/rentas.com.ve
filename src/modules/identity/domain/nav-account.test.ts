import { describe, expect, it } from "vitest";
import {
  type NavAccountAuthenticated,
  type NavSession,
  resolveAccountMenuItems,
  resolveNavAccount,
  resolveNavPublish,
} from "./nav-account";

/**
 * Los tres estados de la barra (tasks.md 20.4) y la regla de Publicar
 * (14.38, RESUELTO por el fundador 2026-08-25): sin sesión, "Publicar
 * gratis" en acento — es cuando hay que provocar. Con sesión, "Publicar" en
 * escritorio, y en el menú de cuenta "Publicar una propiedad" en acento.
 * Sesión y agencia son IDÉNTICAS para la barra — la diferencia (importar
 * cartera) vive sólo en el menú, no acá.
 */
describe("resolveNavAccount", () => {
  it("sin sesión, es anónimo", () => {
    expect(resolveNavAccount(null)).toEqual({ kind: "anonymous" });
  });

  it("con sesión, arma nombre visible e iniciales desde el nombre", () => {
    const session: NavSession = { name: "María Fernández", email: "maria.f@gmail.com" };

    expect(resolveNavAccount(session)).toEqual({
      kind: "authenticated",
      displayName: "María Fernández",
      email: "maria.f@gmail.com",
      initials: "MF",
      imageUrl: null,
      canImportListings: false,
      hasListings: false,
    });
  });

  /**
   * tasks.md 14.56 — «Mis avisos» sólo se dice si de verdad hay avisos.
   *
   * **Falla cerrada** (AGENTS.md §7): una pantalla que no consultó la cartera
   * no afirma nada, y lo que no se afirma no se promete. Prometerle «Mis
   * avisos» a quien acaba de crear la cuenta lo manda a una página vacía.
   */
  it("sin banderas, no se afirma que haya avisos", () => {
    const account = resolveNavAccount({ name: "Recién llegada", email: "r@x.com" });

    expect(account.kind === "authenticated" && account.hasListings).toBe(false);
  });

  it("con la cartera consultada, `hasListings` viaja tal cual llegó", () => {
    const session: NavSession = { name: "María", email: "m@x.com" };

    const sin = resolveNavAccount(session, { hasListings: false });
    const con = resolveNavAccount(session, { hasListings: true });

    expect(sin.kind === "authenticated" && sin.hasListings).toBe(false);
    expect(con.kind === "authenticated" && con.hasListings).toBe(true);
  });

  it("sin nombre (cuenta de enlace mágico), el nombre visible degrada al correo", () => {
    const session: NavSession = { name: null, email: "usuario@dominio.com" };

    const account = resolveNavAccount(session);

    expect(account.kind === "authenticated" && account.displayName).toBe("usuario@dominio.com");
    expect(account.kind === "authenticated" && account.initials).toBe("US");
  });

  it("con foto de Google, la lleva — aunque hoy `user.image` nunca la puebla (schema.ts)", () => {
    const session: NavSession = {
      name: "Inés Castillo",
      email: "ines@gmail.com",
      imageUrl: "https://x/y.png",
    };

    const account = resolveNavAccount(session);

    expect(account.kind === "authenticated" && account.imageUrl).toBe("https://x/y.png");
  });

  it("sesión y agencia son idénticas salvo `canImportListings`", () => {
    const session: NavSession = { name: "Inmobiliaria Caracas", email: "c@inmocaracas.com" };

    const owner = resolveNavAccount(session, { bulkImportEnabled: false });
    const broker = resolveNavAccount(session, { bulkImportEnabled: true });

    expect(owner.kind === "authenticated" && owner.canImportListings).toBe(false);
    expect(broker.kind === "authenticated" && broker.canImportListings).toBe(true);
    // El resto del estado es idéntico — la barra no distingue agencia.
    expect({ ...owner, canImportListings: undefined }).toEqual({
      ...broker,
      canImportListings: undefined,
    });
  });

  it("sin nombre y sin correo (dato imposible pero no se cae), degrada a un valor neutro", () => {
    const account = resolveNavAccount({ name: null, email: null });

    expect(account.kind === "authenticated" && account.displayName).toBe("Tu cuenta");
    expect(account.kind === "authenticated" && account.initials).toBe("?");
  });
});

describe("resolveNavPublish", () => {
  it("sin sesión: «Publicar gratis» en acento, afuera — sin entrada de menú", () => {
    const publish = resolveNavPublish({ kind: "anonymous" });

    expect(publish.bar).toEqual({ label: "Publicar gratis", emphasis: "accent" });
    expect(publish.menu).toBeNull();
  });

  it("con sesión: «Publicar» en la barra (neutro) y «Publicar una propiedad» en el menú (acento)", () => {
    const publish = resolveNavPublish({
      kind: "authenticated",
      displayName: "María",
      email: "m@gmail.com",
      initials: "MA",
      imageUrl: null,
      canImportListings: false,
      hasListings: false,
    });

    expect(publish.bar).toEqual({ label: "Publicar", emphasis: "outline" });
    expect(publish.menu).toEqual({ label: "Publicar una propiedad", emphasis: "accent" });
  });
});

/**
 * El menú de cuenta (lámina 14b), que es lo ÚNICO que distingue una cuenta de
 * agencia de una cuenta con sesión — la barra ya se probó idéntica arriba.
 *
 * **Por qué la lista la decide el dominio y no `Nav.tsx`.** Hasta este
 * trabajo `canImportListings` lo calculaba `resolveNavAccount`, lo probaba
 * este archivo… y no lo leía NADIE: `Nav.tsx` armaba su lista de filas a
 * mano, sin mirarlo. Una regla que sólo vive en un componente es una regla
 * que el piso de 90% no alcanza (AGENTS.md §1), y ésta lo demostró quedando
 * muerta sin que ninguna prueba se pusiera roja.
 */
describe("resolveAccountMenuItems", () => {
  const publish = { bar: { label: "Publicar", emphasis: "outline" as const }, menu: null };
  const publishWithMenu = {
    bar: { label: "Publicar", emphasis: "outline" as const },
    menu: { label: "Publicar una propiedad", emphasis: "accent" as const },
  };

  function accountWith(canImportListings: boolean): NavAccountAuthenticated {
    return {
      kind: "authenticated",
      displayName: "Inmobiliaria Caracas",
      email: "contacto@inmocaracas.com",
      initials: "IC",
      imageUrl: null,
      canImportListings,
      hasListings: true,
    };
  }

  it("una cuenta de dueño NO recibe «Importar cartera»", () => {
    const items = resolveAccountMenuItems(accountWith(false), publishWithMenu);

    expect(items.map((item) => item.href)).toEqual(["/publicar", "/mis-avisos"]);
    expect(items.some((item) => item.href === "/importar")).toBe(false);
  });

  it("una cuenta de agencia recibe «Importar cartera» hacia /importar, después de «Mis avisos» (14b)", () => {
    const items = resolveAccountMenuItems(accountWith(true), publishWithMenu);

    expect(items.map((item) => item.href)).toEqual(["/publicar", "/mis-avisos", "/importar"]);
    expect(items.at(-1)).toEqual({ label: "Importar cartera", href: "/importar" });
  });

  it("sin sesión no hay menú que abrir", () => {
    expect(resolveAccountMenuItems({ kind: "anonymous" }, publish)).toEqual([]);
  });

  it("sin fila de publicar, la lista arranca en «Mis avisos» y no deja un hueco", () => {
    const items = resolveAccountMenuItems(accountWith(true), publish);

    expect(items.map((item) => item.href)).toEqual(["/mis-avisos", "/importar"]);
  });
});
