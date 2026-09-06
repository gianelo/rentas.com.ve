import { describe, expect, it } from "vitest";
import { readSiteBaseUrl } from "./site-base-url";

describe("readSiteBaseUrl", () => {
  it("prefiere la configuración explícita sobre todo lo demás", () => {
    expect(readSiteBaseUrl({ SITE_URL: "https://ejemplo.test", VERCEL_URL: "x.vercel.app" })).toBe(
      "https://ejemplo.test",
    );
  });

  it("le quita la barra final, para que el sitemap no emita `//sitemap.xml`", () => {
    expect(readSiteBaseUrl({ SITE_URL: "https://ejemplo.test/" })).toBe("https://ejemplo.test");
  });

  /**
   * Sin esto, cada rama desplegada publicaría un sitemap que apunta a
   * producción. Un rastreador que encuentre la vista previa indexaría
   * direcciones de producción desde un dominio que no es el nuestro.
   */
  it("usa el dominio de la vista previa de Vercel cuando no hay configuración", () => {
    expect(readSiteBaseUrl({ VERCEL_URL: "rentoru-abc123.vercel.app" })).toBe(
      "https://rentoru-abc123.vercel.app",
    );
  });

  it("lanza cuando no hay ninguna variable, en vez de inventar un dominio", () => {
    // Ya no hay respaldo codificado (tasks.md 26.10). En Vercel `VERCEL_URL`
    // siempre está puesta (26.1), así que este caso no es producción: es una
    // prueba o un entorno local sin configurar, y ahí un error ruidoso vale
    // más que un origen que parece bueno y está mal.
    expect(() => readSiteBaseUrl({})).toThrow(/SITE_URL/);
  });

  it("lanza con una variable presente pero vacía, igual que si faltara", () => {
    // Es lo que deja un panel de configuración donde alguien borró el valor
    // sin borrar la clave. Tratarla como configurada emitiría `https://`.
    expect(() => readSiteBaseUrl({ SITE_URL: "   ", VERCEL_URL: "" })).toThrow(/SITE_URL/);
  });
});
