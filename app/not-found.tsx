import { FailureScreen } from "@/../components/organisms/FailureScreen";
import { NOT_FOUND_SCREEN } from "@/modules/operability/domain/failure-report";

/**
 * Dónde aterriza `notFound()` (tarea 11b.3).
 *
 * **Hacía falta desde que existe la ficha**: los enlaces de este producto
 * circulan por WhatsApp durante meses, y la ruta del aviso llama `notFound()`
 * en cuanto un id no resuelve — un aviso dado de baja, o una dirección mal
 * copiada. Hasta hoy eso terminaba en la pantalla en blanco de Next.
 *
 * **Y las tres respuestas son la misma a propósito** (tarea 16.20): dado de
 * baja, oculto por reportes o nunca existido se contestan igual, porque
 * distinguirlas le entrega a quien sondea direcciones el dato exacto que le
 * falta. Qué se dice y qué NO se dice lo decide `failure-report.ts`, y hay una
 * prueba nombrada que lo sostiene.
 *
 * `robots` se escribe acá y no como `metadata` porque Next no exporta
 * metadatos desde este archivo. React 19 iza la etiqueta al `<head>`.
 */
export default function NotFound() {
  return (
    <>
      <meta name="robots" content="noindex, follow" />
      <FailureScreen model={NOT_FOUND_SCREEN} />
    </>
  );
}
