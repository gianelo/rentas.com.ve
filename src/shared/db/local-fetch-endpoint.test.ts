import { describe, expect, it } from "vitest";
import { resolveLocalFetchEndpoint } from "./local-fetch-endpoint";

/**
 * **La costura del arnés de e2e** (tasks.md 11.22), y la razón por la que tiene
 * su propia guarda en vez de ser una variable de entorno más.
 *
 * Sin la comprobación de bucle local, `NEON_FETCH_ENDPOINT` no es una costura
 * de prueba: es una variable capaz de **redirigir la base de datos entera** a
 * cualquier host que alguien ponga en el entorno de un despliegue. La cadena de
 * conexión seguiría pareciendo la de siempre y `assertPooledConnectionString`
 * seguiría diciendo que sí, porque el ruteo real ya no viaja por ahí.
 *
 * Fallo cerrado, como el resto del repositorio: lo desconocido se rechaza.
 */
describe("resolveLocalFetchEndpoint", () => {
  /** Sin variable no hay costura, y es el caso de producción. */
  it("sin valor no redirige nada", () => {
    expect(resolveLocalFetchEndpoint(undefined)).toBeNull();
    expect(resolveLocalFetchEndpoint("")).toBeNull();
    expect(resolveLocalFetchEndpoint("   ")).toBeNull();
  });

  it("acepta el bucle local por número y por nombre", () => {
    expect(resolveLocalFetchEndpoint("http://127.0.0.1:5544/sql")).toBe(
      "http://127.0.0.1:5544/sql",
    );
    expect(resolveLocalFetchEndpoint("http://localhost:5544/sql")).toBe(
      "http://localhost:5544/sql",
    );
    expect(resolveLocalFetchEndpoint("http://[::1]:5544/sql")).toBe("http://[::1]:5544/sql");
  });

  /**
   * **El caso que esta guarda existe para negar.** Un endpoint remoto acá manda
   * cada consulta de la aplicación —incluidas las que llevan el contacto de
   * quien publica— a donde diga esa variable.
   */
  it("rechaza cualquier host que no sea el bucle local", () => {
    expect(() => resolveLocalFetchEndpoint("https://api.evil.test/sql")).toThrow(
      /bucle local|loopback/i,
    );
    // El clásico: un nombre que EMPIEZA con el del bucle y no lo es.
    expect(() => resolveLocalFetchEndpoint("http://localhost.evil.test/sql")).toThrow();
    // Y el otro clásico: el bucle escrito como usuario de otro host.
    expect(() => resolveLocalFetchEndpoint("http://127.0.0.1@evil.test/sql")).toThrow();
  });

  it("rechaza lo que no es una dirección", () => {
    expect(() => resolveLocalFetchEndpoint("no-es-una-url")).toThrow();
  });
});
