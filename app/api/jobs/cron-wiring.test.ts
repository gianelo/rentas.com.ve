import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * El cableado de los trabajos programados (tasks.md 19.4).
 *
 * **Esto existe porque el defecto era el cableado y nada lo afirmaba.**
 * `app/api/jobs/photo-purge/route.ts` se construyó, se probó y se dejó
 * deliberadamente fuera de `vercel.json`; la casilla de la 19.4 quedó marcada,
 * la 19.5 empezó a mandar el correo que anuncia la purga y la 19.6 dibujó el
 * conteo regresivo. Entre las tres el producto prometía un borrado que nadie
 * ejecutaba: alguien recibía el aviso, veía el conteo llegar a cero y sus
 * fotos seguían ahí. Ninguna prueba podía ponerse roja por eso, porque ninguna
 * miraba el archivo que faltaba.
 *
 * Se afirma sobre el DIRECTORIO y no sobre una lista escrita a mano: una lista
 * hay que acordarse de actualizarla, y acordarse es justo lo que falló. El
 * trabajo número cuatro se delata solo el día que alguien lo cree.
 */

const REPO = fileURLToPath(new URL("../../..", import.meta.url));

interface CronEntry {
  readonly path: string;
  readonly schedule: string;
}

function crons(): readonly CronEntry[] {
  const config = JSON.parse(readFileSync(`${REPO}/vercel.json`, "utf8")) as {
    crons?: readonly CronEntry[];
  };
  return config.crons ?? [];
}

/** Cada carpeta bajo `app/api/jobs/` que tenga una ruta de verdad. */
function jobRoutes(): readonly string[] {
  return readdirSync(`${REPO}/app/api/jobs`, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .filter((entry) =>
      readdirSync(`${REPO}/app/api/jobs/${entry.name}`).some((file) => /^route\.tsx?$/.test(file)),
    )
    .map((entry) => `/api/jobs/${entry.name}`);
}

describe("los trabajos programados están cableados", () => {
  // El control de que lo de abajo mide algo: si la carpeta se leyera vacía
  // —un `readdirSync` que cambia de forma, una ruta que se mueve— las dos
  // afirmaciones siguientes pasarían sin haber comparado nada.
  it("hay rutas de trabajo que cablear", () => {
    expect(jobRoutes().length).toBeGreaterThanOrEqual(3);
  });

  it("toda ruta bajo app/api/jobs tiene su horario en vercel.json", () => {
    const programadas = crons().map((cron) => cron.path);

    expect([...jobRoutes()].sort()).toEqual([...programadas].sort());
  });

  /**
   * **Horas distintas, y es la razón por la que hay tres entradas y no una.**
   * Montadas a la misma hora, una función que agota su tiempo o revienta el
   * pool de conexiones se lleva puesta a la otra, y `job_run` no distingue el
   * trabajo que falló del que nunca corrió porque el vecino lo tapó.
   */
  it("no comparten horario", () => {
    const horas = crons().map((cron) => cron.schedule.split(" ").slice(0, 2).join(" "));

    expect(new Set(horas).size).toBe(horas.length);
  });

  /**
   * El plan Hobby de Vercel corre cada cron **una vez por día**, y una
   * expresión más frecuente no se ignora: **falla el despliegue**
   * (`vercel.com/docs/cron-jobs/usage-and-pricing`, verificado el 2026-09-02).
   * Acá eso es rojo en la suite en vez de rojo en producción.
   */
  it("ninguna corre más de una vez por día", () => {
    for (const { path, schedule } of crons()) {
      const [minuto, hora] = schedule.split(" ");
      expect(`${path} ${minuto}`).toMatch(/ \d{1,2}$/);
      expect(`${path} ${hora}`).toMatch(/ \d{1,2}$/);
    }
  });
});
