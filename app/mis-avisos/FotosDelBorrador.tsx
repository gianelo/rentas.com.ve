"use client";

import { useId, useState } from "react";
import { MAX_PHOTOS_PER_LISTING } from "../../src/modules/listing-publication/domain/publishable-listing";
import { SUPPORTED_PHOTO_CONTENT_TYPES } from "../../src/modules/listing-publication/domain/uploaded-photo";
import { computeResize, UPLOAD_CONTENT_TYPE, UPLOAD_QUALITY } from "../publicar/fotos/compress";
import { adjuntarFotoAlBorrador, pedirDestinoDeFoto } from "./actions";
import styles from "./mis-avisos.module.css";

/**
 * tasks.md 9.28 — «Subir fotos» de la lámina 14d, sobre un borrador que ya
 * existe.
 *
 * **Por qué éste puede tener JavaScript.** AGENTS.md §2 exime a `/mis-avisos`
 * y a la importación del piso de la ruta de lectura, y la exención tiene un
 * motivo concreto: comprimir la foto ANTES de que salga del teléfono es la
 * diferencia entre subir 3 MB y subir 38 KB, y en una conexión venezolana esa
 * diferencia es la que decide si la foto llega. La exención cubre esto y no
 * cubre la activación, que es un `<form>` de verdad en `page.tsx`.
 *
 * **Reusa la compresión de publicar, no una segunda.** `computeResize`,
 * `UPLOAD_QUALITY` y `UPLOAD_CONTENT_TYPE` salen de
 * `app/publicar/fotos/compress.ts`: dos tamaños de borde distintos serían dos
 * calidades distintas para la misma foto según por dónde entró.
 *
 * **Sin miniaturas, sin reordenar, sin portada.** La lámina 14h dibuja al
 * corredor fotografiando en la calle: lo que hace falta acá es que la foto
 * llegue. Ordenar y elegir portada ya existen en el paso 2 de publicar y son
 * una porción aparte, no un hueco que este comentario deja sin nombrar.
 *
 * Orden: **comprimir → medir → firmar → subir → adjuntar.** El PUT firmado
 * fija el largo exacto en su firma, así que el tamaño tiene que conocerse
 * antes de pedirla; comprimir después invalidaría la URL recién emitida.
 */

type Estado = "listo" | "comprimiendo" | "subiendo" | "hecho" | "fallo";

async function comprimir(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const { width, height } = computeResize({ width: bitmap.width, height: bitmap.height });

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Tu navegador no pudo procesar esta imagen.");
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, UPLOAD_CONTENT_TYPE, UPLOAD_QUALITY),
  );
  if (!blob) throw new Error("Tu navegador no pudo comprimir esta imagen.");
  return blob;
}

export function FotosDelBorrador({
  listingId,
  photoCount,
}: {
  readonly listingId: string;
  readonly photoCount: number;
}) {
  const inputId = useId();
  const [estado, setEstado] = useState<Estado>("listo");
  const [mensaje, setMensaje] = useState("");

  async function subir(file: File) {
    setMensaje("");
    try {
      setEstado("comprimiendo");
      const blob = await comprimir(file);

      setEstado("subiendo");
      const destino = await pedirDestinoDeFoto({
        listingId,
        contentType: UPLOAD_CONTENT_TYPE,
        byteLength: blob.size,
      });

      const respuesta = await fetch(destino.url, {
        method: "PUT",
        // Exactamente el tipo que se firmó: cualquier otro falla en el borde
        // de R2 en vez de dejar caer algo inesperado en el bucket.
        headers: { "content-type": UPLOAD_CONTENT_TYPE },
        body: blob,
      });
      if (!respuesta.ok) throw new Error(String(respuesta.status));

      // El único camino: `attachPhotoToDraft` pasa por `processUploadedPhoto`,
      // que es donde vive el rechazo de foto duplicada entre cuentas (4.7).
      await adjuntarFotoAlBorrador({
        listingId,
        key: destino.key,
        contentType: UPLOAD_CONTENT_TYPE,
      });

      setEstado("hecho");
      setMensaje("Foto subida. Ya podés activar el aviso.");
    } catch {
      setEstado("fallo");
      setMensaje("✱ No pudimos subir esta foto. Probá de nuevo.");
    }
  }

  const trabajando = estado === "comprimiendo" || estado === "subiendo";
  const lleno = photoCount >= MAX_PHOTOS_PER_LISTING;

  return (
    <div className={styles.fotos}>
      <input
        id={inputId}
        className={styles.fileInput}
        type="file"
        accept={SUPPORTED_PHOTO_CONTENT_TYPES.join(",")}
        disabled={trabajando || lleno}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void subir(file);
        }}
      />
      {/* La etiqueta ES el botón que dibuja la lámina. El input queda en el
          orden de tabulación y en el árbol de accesibilidad — `display: none`
          lo saca de los dos. */}
      <label className={styles.subir} htmlFor={inputId}>
        {trabajando
          ? estado === "comprimiendo"
            ? "Comprimiendo en tu teléfono…"
            : "Subiendo…"
          : "Subir fotos"}
      </label>

      {mensaje === "" ? null : (
        <p className={estado === "fallo" ? styles.fotoError : styles.fotoOk} role="status">
          {mensaje}
        </p>
      )}

      {/* Se dice por qué, en vez de quedarse mudo — el mismo precedente que la
          pantalla de importar (9.26). */}
      <noscript>
        <p className={styles.fotoError}>
          Subir fotos necesita JavaScript: las comprimimos en tu teléfono antes de mandarlas, así
          gastás muchos menos datos.
        </p>
      </noscript>
    </div>
  );
}
