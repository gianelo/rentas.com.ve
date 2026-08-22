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
    expect(readSiteBaseUrl({ VERCEL_URL: "rentas-abc123.vercel.app" })).toBe(
      "https://rentas-abc123.vercel.app",
    );
  });

  it("cae al dominio del producto, y nunca falla", () => {
    // La asimetría con `readPhotoPublicBaseUrl`, que sí lanza: aquélla protege
    // una pantalla que sin la variable se ve rota. Ésta sirve a un rastreador,
    // y fallar dejaría al sitio entero sin sitemap por una variable faltante.
    expect(readSiteBaseUrl({})).toBe("https://rentas.com.ve");
  });

  it("ignora una variable presente pero vacía", () => {
    // Es lo que deja un panel de configuración donde alguien borró el valor
    // sin borrar la clave. Tratarla como configurada emitiría `https://`.
    expect(readSiteBaseUrl({ SITE_URL: "   ", VERCEL_URL: "" })).toBe("https://rentas.com.ve");
  });
});
