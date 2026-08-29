"use client";

import { FailureScreen } from "@/../components/organisms/FailureScreen";
import { resolveErrorScreen } from "@/modules/operability/domain/failure-report";

/**
 * La frontera de error de la aplicación (tarea 11b.2).
 *
 * **Next la dibuja en el servidor**, así que estos bytes son los que sale la
 * respuesta y la pantalla existe con el script apagado. `"use client"` es el
 * requisito del archivo, no una dependencia del navegador: acá no se
 * suscribe nada ni se toca ningún estado.
 *
 * **No se ofrece `reset()`.** Es la única pieza de esta pantalla que
 * necesitaría JavaScript para hacer algo, y un botón que no responde con el
 * script apagado es peor que no tenerlo — es la trampa que este proyecto ya
 * evita en el resto del camino de lectura. La salida es un enlace.
 */
export default function ErrorBoundary({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // El error NO se registra acá: `instrumentation.ts` ya lo escribió en el
  // servidor con el mismo digest (11b.4), y hacerlo también en este
  // componente lo duplicaría en cada hidratación del navegador.
  return <FailureScreen model={resolveErrorScreen(error.digest)} />;
}
