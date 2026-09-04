import { describe, expect, it } from "vitest";
import { withPoolCleanup } from "./pool-cleanup";

/**
 * tasks.md 22.35 — hallazgo `R3-afterall-pool-leak` (de una revisión de
 * fiabilidad de Gentle AI que quemó sus artefactos al reconocerse). Sin este
 * helper, un `afterAll` que corre varios `DELETE` y recién al final
 * `pool.end()` deja el pool abierto si cualquiera de los `DELETE` revienta:
 * el error de teardown tapa el fallo real y Vitest no cierra limpio.
 *
 * No hace falta Postgres real para probar esto — es control de flujo puro,
 * por eso el "pool" acá es un doble de prueba y no `pg.Pool`.
 */
function fakePool() {
  let closed = false;
  return {
    get closed() {
      return closed;
    },
    async end() {
      closed = true;
    },
  };
}

describe("withPoolCleanup", () => {
  it("cierra el pool después de que la limpieza termina bien", async () => {
    const pool = fakePool();

    await withPoolCleanup(pool, async () => {});

    expect(pool.closed).toBe(true);
  });

  it("cierra el pool aunque la limpieza reviente, y deja pasar el error real", async () => {
    const pool = fakePool();
    const fallo = new Error("DELETE violó una clave foránea");

    await expect(
      withPoolCleanup(pool, async () => {
        throw fallo;
      }),
    ).rejects.toBe(fallo);
    expect(pool.closed).toBe(true);
  });
});
