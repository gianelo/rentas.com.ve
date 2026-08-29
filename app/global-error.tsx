"use client";

import "@/styles/tokens.css";
import "@/styles/base.css";
import { FailureScreen } from "@/../components/organisms/FailureScreen";
import { resolveErrorScreen } from "@/modules/operability/domain/failure-report";

/**
 * La frontera de último recurso: **el layout raíz mismo falló** (tarea 11b.2).
 *
 * **Reemplaza el documento entero**, así que no puede apoyarse en nada que la
 * aplicación normalmente provea. Por eso este archivo repite tres cosas que
 * `app/layout.tsx` ya hace y que acá no existen: el `<html>` con `lang`, los
 * dos atributos que seleccionan el tema y la estructura, y las dos hojas de
 * estilo. Sin `data-theme` ninguna propiedad personalizada de `tokens.css`
 * queda declarada y esta pantalla se dibujaría sin una sola regla del
 * sistema — el fallo del fallo.
 *
 * La repetición no es duplicación de una decisión: `app/layout.test.tsx` fija
 * los mismos tres atributos para el documento normal, y
 * `app/pantallas-de-fallo.test.tsx` los fija para éste.
 */
export default function GlobalErrorBoundary({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="es" data-theme="menta" data-layout="compacto">
      <body>
        <FailureScreen model={resolveErrorScreen(error.digest)} />
      </body>
    </html>
  );
}
