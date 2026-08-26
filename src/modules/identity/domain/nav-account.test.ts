import { describe, expect, it } from "vitest";
import { type NavSession, resolveNavAccount, resolveNavPublish } from "./nav-account";

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
    });
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
    });

    expect(publish.bar).toEqual({ label: "Publicar", emphasis: "outline" });
    expect(publish.menu).toEqual({ label: "Publicar una propiedad", emphasis: "accent" });
  });
});
