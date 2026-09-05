import type { Metadata } from "next";
import { AppLink } from "@/../components/atoms/AppLink";
import styles from "../ayuda.module.css";

/**
 * "Cómo reportar un aviso" (tasks.md 23.6, DECIDIDA 2026-09-04) — la etiqueta
 * vieja del pie, "Reportar un aviso", prometía un verbo imposible desde ahí:
 * reportar es POR AVISO
 * (`app/alquiler/[ciudad]/[zona]/[slug]/reportar/page.tsx` necesita el aviso
 * en la dirección) y exige una cuenta (`report-threshold.ts`), y un pie no
 * tiene ninguna de las dos. **Esta página no reporta nada — explica cómo y
 * desde dónde**, y es exactamente la salida que 23.6 decidió en vez de
 * apuntar a un canal general o caerse del pie.
 *
 * Cada hecho de acá sale del código real: el enlace de reportar vive al pie
 * de cada ficha (`page.tsx` de la ficha, `styles.report`), la Server Action
 * exige sesión antes de contar nada (`reportar/actions.ts`,
 * `UnauthenticatedError` → `/signin`), la restricción de una cuenta por
 * reporte es la unicidad de `listing_report_listing_reporter_unique`
 * (`schema.ts`), y el umbral de ocultamiento automático es
 * `AUTO_HIDE_REPORT_THRESHOLD = 3` en `listing-trust/domain/report-threshold.ts`
 * — el mismo número que la página de Términos (23.5) ya hace público, así
 * que decirlo acá no revela nada nuevo.
 */
export const metadata: Metadata = {
  title: "Cómo reportar un aviso — Rentas",
  description: "Cómo y desde dónde se reporta un aviso en rentas.com.ve.",
};

export default function ComoReportarPage() {
  return (
    <article>
      <h1 className={styles.title}>Cómo reportar un aviso</h1>

      <p className={styles.text}>
        Reportar es por aviso, así que no se hace desde acá: se hace desde la propia ficha del aviso
        que querés reportar.
      </p>

      <h2 className={styles.heading}>1. Abrí el aviso</h2>
      <p className={styles.text}>
        Entrá a la ficha del aviso que te parece sospechoso o que no corresponde. Al final de la
        ficha, junto al ID y a la fecha de vencimiento, hay un enlace:{" "}
        <strong>«Reportar este aviso»</strong>.
      </p>

      <h2 className={styles.heading}>2. Entrás con tu cuenta</h2>
      <p className={styles.text}>
        Reportar pide entrar con tu cuenta, con Google o con un enlace por correo. Si no habías
        entrado, te lo pide antes de contar el reporte, y después te devuelve a esta misma pantalla.
      </p>

      <h2 className={styles.heading}>3. Enviás el reporte</h2>
      <p className={styles.text}>
        Un botón, sin escribir nada más. Cada cuenta cuenta una vez por cuenta para el mismo aviso:
        reportarlo de nuevo no suma un segundo reporte.
      </p>

      <h2 className={styles.heading}>Qué pasa después</h2>
      <p className={styles.text}>
        Cuando tres cuentas distintas reportan el mismo aviso, se oculta automáticamente hasta que
        lo revisemos. <strong>No te vamos a decir</strong> si tu reporte fue el que lo ocultó, ni
        cuántos reportes lleva: decirlo le daría a quien publica contenido falso el dato exacto que
        le falta para evadir el límite.
      </p>

      <h2 className={styles.heading}>¿Tu situación no es sobre un aviso puntual?</h2>
      <p className={styles.text}>
        Para cualquier otra cosa, escribinos desde{" "}
        <AppLink href="/ayuda/escribinos">Escribinos</AppLink>.
      </p>
    </article>
  );
}
