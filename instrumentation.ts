import { failureLogLine } from "@/modules/operability/domain/failure-report";

/**
 * **Una línea de JSON por fallo, en el único sitio donde caben las tres
 * fronteras** (tarea 11b.4).
 *
 * Next llama `onRequestError` para todo lo que falla del lado del servidor —
 * componentes de servidor, manejadores de ruta y acciones—, con el **mismo
 * digest** que la frontera de error acaba de dibujarle al visitante. Ésa es la
 * juntura: quien nos cita un código nos lleva a una línea.
 *
 * Vercel captura `stdout`/`stderr`, así que el valor no es escribirlo sino
 * escribirlo en una forma que se pueda buscar y alertar. Qué puede aparecer en
 * esa forma no se decide acá: lo decide `failure-report.ts`, con el suelo de
 * cobertura del 90 % encima. Este archivo sólo elige de dónde sale cada campo,
 * y **la ruta sale del patrón y no de la URL** — `/renovar/<token>` lleva la
 * llave de renovación en el camino.
 */
export function onRequestError(
  error: unknown,
  _request: { path: string; method: string; headers: unknown },
  context: { routerKind: string; routePath: string; routeType: string },
): void {
  console.error(
    failureLogLine({
      // El conjunto que Next puede mandar es cerrado —`render`, `route`,
      // `action`, `middleware`— y el dominio lo vuelve a cerrar, así que un
      // valor nuevo de una versión futura queda anotado como desconocido en
      // vez de entrar sin mirar.
      boundary: context.routeType,
      route: context.routePath,
      digest: (error as { digest?: string })?.digest,
      cause: error,
    }),
  );
}
