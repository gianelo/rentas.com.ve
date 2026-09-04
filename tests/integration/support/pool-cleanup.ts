/**
 * tasks.md 22.35 — el `afterAll` de treinta y ocho suites de integración
 * corre varios `DELETE` de limpieza y recién al final `pool.end()`, sin
 * `try`/`finally`. Si cualquiera de los `DELETE` revienta —una violación de
 * clave foránea por filas que otra suite dejó en la base compartida, el
 * caso exacto que `tests/integration/listing-report.test.ts` ya documenta—
 * el pool queda abierto, Vitest no cierra limpio y el error de teardown tapa
 * el `DELETE` que falló de verdad (hallazgo `R3-afterall-pool-leak`, de una
 * revisión de fiabilidad de Gentle AI que quemó sus artefactos al
 * reconocerse).
 *
 * **Un helper compartido y no un `try`/`finally` copiado treinta y ocho
 * veces**, porque copiarlo es exactamente cómo una convención deja de serlo:
 * el día que alguien agrega una suite nueva sin mirar las otras treinta y
 * siete, vuelve a escribir el defecto.
 *
 * `ClosablePool` y no `pg.Pool` a propósito: esto es control de flujo puro,
 * y tipar contra la forma mínima que necesita (`end(): Promise<void>`) es lo
 * que deja probarlo sin Postgres real.
 */
export interface ClosablePool {
  end(): Promise<void>;
}

export async function withPoolCleanup(
  pool: ClosablePool,
  cleanup: () => Promise<void>,
): Promise<void> {
  try {
    await cleanup();
  } finally {
    await pool.end();
  }
}
