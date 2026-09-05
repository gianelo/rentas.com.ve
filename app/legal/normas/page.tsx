import type { Metadata } from "next";
import { DraftNotice } from "../draft-notice";
import styles from "../legal.module.css";

/**
 * "Normas de publicación" (tasks.md 23.5) — el caso de borde de esta tarea:
 * política de producto más que texto legal, derivada de
 * `publishable-listing.ts` y `uploaded-photo.ts` en vez de escrita de cero.
 * Cada número acá es el mismo que el formulario aplica hoy.
 */
export const metadata: Metadata = {
  title: "Normas de publicación — Rentas",
  description: "Qué se puede publicar en rentas.com.ve, tal como lo aplica el formulario hoy.",
};

export default function NormasPage() {
  return (
    <article>
      <h1 className={styles.title}>Normas de publicación</h1>
      <DraftNotice />

      <p className={styles.text}>
        Estas reglas son las mismas que aplica el formulario de publicar: nada de lo que sigue es
        una política aparte, es lo que el sitio ya exige antes de dejar activar un aviso.
      </p>

      <h2 className={styles.heading}>Qué se puede publicar, y quién publica</h2>
      <p className={styles.text}>
        Sólo inmuebles residenciales en alquiler: apartamento, casa, quinta, anexo o habitación. No
        se acepta local comercial ni ningún otro uso. Te identificás como dueño o como inmobiliaria
        al crear el aviso.
      </p>

      <h2 className={styles.heading}>Datos obligatorios</h2>
      <ul className={styles.list}>
        <li className={styles.item}>Un título de hasta 90 caracteres.</li>
        <li className={styles.item}>Una descripción de entre 120 y 1.200 caracteres.</li>
        <li className={styles.item}>Un precio en dólares, en número entero, sin decimales.</li>
        <li className={styles.item}>Una ciudad y una zona, elegidas de una lista cerrada.</li>
        <li className={styles.item}>
          Habitaciones, metros cuadrados y baños, en números enteros positivos; puestos de
          estacionamiento, que sí puede ser cero.
        </li>
        <li className={styles.item}>
          Un método de contacto válido: WhatsApp, teléfono o correo, con un valor que tenga forma de
          ese contacto.
        </li>
      </ul>

      <h2 className={styles.heading}>Fotos</h2>
      <p className={styles.text}>
        Hacen falta entre 1 y 6 fotos por aviso para poder activarlo. Sólo se aceptan archivos JPEG,
        PNG o WebP de hasta 10 MB cada uno, y el sistema rechaza cualquier archivo que no sea
        realmente una imagen de ese tipo. Una foto que ya aparece en un aviso de otro dueño también
        se rechaza.
      </p>

      <h2 className={styles.heading}>Qué pasa si reportan tu aviso</h2>
      <p className={styles.text}>
        Cuando tres cuentas distintas reportan el mismo aviso, éste se oculta automáticamente
        mientras se revisa.
      </p>

      <h2 className={styles.heading}>Una sola regla, para todos por igual</h2>
      <p className={styles.text}>
        Estas normas se aplican de la misma forma sin importar cómo se publique el aviso: no hay una
        versión más laxa para una carga masiva.
      </p>
    </article>
  );
}
