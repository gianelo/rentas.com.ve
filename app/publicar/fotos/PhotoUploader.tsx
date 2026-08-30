"use client";

import { Fragment, useEffect, useId, useState } from "react";
import {
  type DraftPhotoAction,
  movePhotoBy,
  offersDragReorder,
  photoActionsFor,
  planPhotoRemoval,
  promoteToCover,
  reorderPhotoTo,
} from "../../../src/modules/listing-publication/domain/draft-photo-actions";
import { MAX_PHOTOS_PER_LISTING } from "../../../src/modules/listing-publication/domain/publishable-listing";
import { SUPPORTED_PHOTO_CONTENT_TYPES } from "../../../src/modules/listing-publication/domain/uploaded-photo";
import {
  coverChangedNotice,
  discardPhotoLabel,
  PHOTO_ACTION_COPY,
  PHOTO_REMOVAL_REFUSAL_COPY,
  photoActionLabel,
} from "../photo-action-copy";
import { requestUploadTargets } from "./actions";
import { computeResize, UPLOAD_CONTENT_TYPE, UPLOAD_QUALITY } from "./compress";
import styles from "./photo-uploader.module.css";

/**
 * SISTEMA.md artboard `2g` — step 2 of 2.
 *
 * The only client component in the publish flow, and the only screen where
 * the design allows JavaScript. The reason is specific: a phone photo is
 * 3–8 MB, six of them on a Venezuelan mobile connection is the slowest thing
 * this product ever asks anyone to do, and compressing before the bytes leave
 * the device is the only fix that works on the connection rather than around
 * it. The screen says so out loud — `2,4 MB → 38 KB` per row — because the
 * saving is the reason the wait is worth it.
 *
 * **The design says "Hasta 8 fotos"; the founder chose to keep 6**
 * (2026-08-18). Eight costs about a quarter of the free tier's catalogue
 * capacity — ~5,900 listings against ~7,900, measured against the stored
 * derivatives rather than the discarded originals. So the copy reads from
 * `MAX_PHOTOS_PER_LISTING` rather than repeating a number.
 *
 * Order: **compress → measure → sign → upload.** The presigned PUT pins
 * `ContentLength` into its signature, so the exact byte count has to be known
 * before the signature is requested; compressing afterwards would invalidate
 * every URL just issued.
 */

type PhotoStatus = "compressing" | "uploading" | "ready" | "failed";

interface Photo {
  readonly id: string;
  readonly name: string;
  readonly originalBytes: number;
  status: PhotoStatus;
  compressedBytes?: number;
  /** 0–1, real bytes sent. Only meaningful while uploading. */
  progress?: number;
  key?: string;
  error?: string;
  preview?: string;
  blob?: Blob;
}

/** "2,4 MB" / "38 KB" — Spanish decimal comma, as the artboard writes it. */
function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
  }
  return `${Math.round(bytes / 1024)} KB`;
}

async function compress(file: File): Promise<{ blob: Blob; preview: string }> {
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
  return { blob, preview: URL.createObjectURL(blob) };
}

/**
 * `XMLHttpRequest`, not `fetch`, and this is the only reason: **fetch cannot
 * report upload progress.** It has no event for bytes sent, so a bar driven
 * by it can only be a guess — the first version painted 40% and then 80%,
 * numbers that meant nothing.
 *
 * The artboard draws a real bar because on a Venezuelan mobile connection
 * this wait is measured in tens of seconds, and a progress bar that does not
 * move is worse than none: it tells someone the upload has died when it has
 * not.
 */
function putWithProgress(
  url: string,
  blob: Blob,
  onProgress: (fraction: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", url);
    // Exactly the type that was signed; any other value fails the signature
    // at R2's edge rather than landing something unexpected.
    request.setRequestHeader("content-type", UPLOAD_CONTENT_TYPE);
    request.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    });
    request.addEventListener("load", () =>
      request.status >= 200 && request.status < 300
        ? resolve()
        : reject(new Error(String(request.status))),
    );
    request.addEventListener("error", () => reject(new Error("network")));
    request.addEventListener("abort", () => reject(new Error("abort")));
    request.send(blob);
  });
}

/**
 * The refusal a publisher actually sees. `createImageBitmap` throws for a
 * video, a PDF or a corrupt file alike, so the declared type is what
 * distinguishes them — and "es un video" is the case the artboard draws,
 * because picking one out of a phone gallery by accident is easy.
 */
function refusalFor(file: File): string {
  if (file.type.startsWith("video/")) return "✱ Es un video, no una foto";
  if (!(SUPPORTED_PHOTO_CONTENT_TYPES as readonly string[]).includes(file.type)) {
    return "✱ Ese formato no lo podemos usar";
  }
  return "✱ No pudimos leer esta foto";
}

/**
 * Las fotos que el borrador ya traía, cuando alguien vuelve al paso 8.
 *
 * **Sin miniatura, y no es un descuido.** La vista previa era un `blob:` que
 * apuntaba a memoria de la pestaña anterior: al volver ya no existe, y la
 * única forma de recuperarla sería volver a bajar de R2 la foto que ya está
 * subida — datos móviles gastados en mirar algo que ya se decidió. La fila
 * lleva el nombre y el tamaño, que es lo que hace falta para reconocerla.
 */
export interface UploadedPhoto {
  readonly key: string;
  readonly name: string;
  readonly bytes: number;
}

export function PhotoUploader({ initial = [] }: { initial?: readonly UploadedPhoto[] }) {
  const inputId = useId();
  const [photos, setPhotos] = useState<Photo[]>(() =>
    initial.map((photo) => ({
      id: photo.key,
      name: photo.name,
      // Ya comprimida: el original quedó en el teléfono de la sesión anterior,
      // así que los dos tamaños son el mismo y la fila no miente sobre lo
      // ahorrado.
      originalBytes: photo.bytes,
      compressedBytes: photo.bytes,
      status: "ready" as PhotoStatus,
      key: photo.key,
    })),
  );
  const [notice, setNotice] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  /** Arranca en `false`: el primer marcado es el del teléfono, con las cuatro
      acciones nombradas y sin agarre. El arrastre llega después. */
  const [pointerIsFine, setPointerIsFine] = useState(false);

  useEffect(() => {
    // `(pointer: fine)` es "mouse o lápiz", no "pantalla grande": un teléfono
    // apaisado sigue siendo un pulgar.
    setPointerIsFine(window.matchMedia("(pointer: fine)").matches);
  }, []);

  const dragEnabled = offersDragReorder({ pointerIsFine, photoCount: photos.length });

  const update = (id: string, patch: Partial<Photo>) =>
    setPhotos((current) => current.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  async function handleFiles(fileList: FileList | null) {
    const files = Array.from(fileList ?? []);
    if (files.length === 0) return;

    const room = MAX_PHOTOS_PER_LISTING - photos.length;
    if (files.length > room) {
      // Said before the wait, not after it: someone who picked ten photos
      // should not watch six upload to learn the rest were dropped.
      setNotice(
        room === 0
          ? `Ya tenés ${MAX_PHOTOS_PER_LISTING} fotos. Quitá alguna para agregar otra.`
          : `Podés agregar ${room} más. Elegí las mejores.`,
      );
      return;
    }
    setNotice("");

    const added: Photo[] = files.map((file, index) => ({
      id: `${Date.now()}-${index}-${file.name}`,
      name: file.name.replace(/\.[^.]+$/, ""),
      originalBytes: file.size,
      status: "compressing",
    }));
    setPhotos((current) => [...current, ...added]);

    // Sequential: parallel decodes on a phone compete for the same memory and
    // give no honest sense of progress.
    const compressed: { photo: Photo; blob: Blob }[] = [];
    for (const [index, file] of files.entries()) {
      const photo = added[index] as Photo;
      try {
        const { blob, preview } = await compress(file);
        update(photo.id, { compressedBytes: blob.size, preview, blob, status: "uploading" });
        compressed.push({ photo, blob });
      } catch {
        update(photo.id, { status: "failed", error: refusalFor(file) });
      }
    }

    if (compressed.length === 0) return;

    const result = await requestUploadTargets(
      compressed.map(({ blob }) => ({ contentType: UPLOAD_CONTENT_TYPE, byteLength: blob.size })),
    );
    if (!result.ok) {
      for (const { photo } of compressed) {
        update(photo.id, { status: "failed", error: "✱ No pudimos preparar la subida" });
      }
      return;
    }

    for (const [index, target] of result.targets.entries()) {
      const entry = compressed[index];
      if (!entry) continue;
      try {
        update(entry.photo.id, { progress: 0 });
        await putWithProgress(target.url, entry.blob, (fraction) =>
          update(entry.photo.id, { progress: fraction }),
        );
        update(entry.photo.id, { status: "ready", key: target.key });
      } catch {
        update(entry.photo.id, { status: "failed", error: "✱ No pudimos subirla" });
      }
    }
  }

  /**
   * El orden nuevo, aplicado a las filas. **Ninguna de estas funciones decide
   * el orden**: lo decide `draft-photo-actions.ts`, que es puro y sí entra en
   * el piso de 90% que este archivo no toca.
   */
  function applyOrder(current: Photo[], ids: readonly string[]): Photo[] {
    const byId = new Map(current.map((photo) => [photo.id, photo]));
    return ids.flatMap((id) => {
      const photo = byId.get(id);
      return photo ? [photo] : [];
    });
  }

  function reorder(next: (ids: readonly string[]) => readonly string[]) {
    setPhotos((current) => applyOrder(current, next(current.map((photo) => photo.id))));
  }

  /**
   * Quitar del aviso. **El piso lo contesta el dominio** con la misma
   * constante que `activateListing` revalida al activar; se dice acá porque
   * enterarse cuatro pasos después es peor. Cuenta sólo las `ready`: una foto
   * que se rompió al subir nunca entró al aviso.
   */
  function removeFromListing(id: string) {
    const readyIds = photos.filter((photo) => photo.status === "ready").map((photo) => photo.id);
    const plan = planPhotoRemoval(readyIds, id);
    if (!plan.ok) {
      setNotice(PHOTO_REMOVAL_REFUSAL_COPY[plan.refusal]);
      return;
    }

    const promoted = plan.coverChangedTo
      ? photos.find((photo) => photo.id === plan.coverChangedTo)
      : undefined;
    setNotice(promoted ? coverChangedNotice(promoted.name) : "");
    discard(id);
  }

  /**
   * Sacar la fila y soltar la miniatura. **El objeto ya subido a R2 se queda
   * ahí y nunca se adjunta**: su clave sale de los campos ocultos, así que el
   * borrador no lo referencia y ningún aviso lo muestra. Borrarlo pediría una
   * acción de servidor con permiso de borrado sobre el bucket — un puerto de
   * escritura más ancho por un huérfano que la política del bucket recoge —,
   * y AGENTS.md §3 pide lo contrario: no ensanchar el puerto angosto.
   */
  function discard(id: string) {
    setPhotos((current) => {
      const gone = current.find((p) => p.id === id);
      if (gone?.preview) URL.revokeObjectURL(gone.preview);
      return current.filter((p) => p.id !== id);
    });
  }

  function runPhotoAction(action: DraftPhotoAction, id: string) {
    if (action === "remove") {
      removeFromListing(id);
      return;
    }
    setNotice("");
    if (action === "makeCover") {
      reorder((ids) => promoteToCover(ids, id));
      return;
    }
    reorder((ids) => movePhotoBy(ids, id, action === "moveUp" ? -1 : 1));
  }

  const ready = photos.filter((p) => p.status === "ready");
  const orderIds = photos.map((photo) => photo.id);

  const picker = (label: string, className: string | undefined) => (
    <>
      <input
        id={inputId}
        className={styles.fileInput}
        type="file"
        multiple
        accept={SUPPORTED_PHOTO_CONTENT_TYPES.join(",")}
        onChange={(event) => {
          void handleFiles(event.target.files);
          event.target.value = "";
        }}
      />
      {/* The label IS the button the artboard draws. The input stays in the
          tab order and the accessibility tree — `display: none` removes it
          from both. */}
      <label className={className} htmlFor={inputId}>
        {label}
      </label>
    </>
  );

  return (
    <div className={styles.uploader}>
      <div className={styles.heading}>
        <span />
        <span className={styles.count}>
          {photos.length} de {MAX_PHOTOS_PER_LISTING}
        </span>
      </div>

      {photos.length === 0 ? (
        <div className={styles.empty}>
          <span className={styles.emptyLabel}>Todavía no hay fotos</span>
          {picker("Elegir del teléfono", styles.pickButton)}
          <span className={styles.hint}>Hasta {MAX_PHOTOS_PER_LISTING} fotos · JPG o PNG</span>
        </div>
      ) : (
        <ul className={styles.list}>
          {photos.map((photo, index) => (
            <li
              key={photo.id}
              className={
                photo.status === "failed" ? `${styles.row} ${styles.rowFailed}` : styles.row
              }
              // Sólo con puntero fino, y sólo encima de las acciones
              // nombradas: arrastrar con el pulgar en un teléfono lento no es
              // confiable, con mouse sí.
              draggable={dragEnabled}
              onDragStart={() => setDragId(photo.id)}
              onDragEnd={() => setDragId(null)}
              onDragOver={(event) => {
                // Sin `preventDefault` no hay zona de soltado — y no se llama
                // cuando no hay arrastre nuestro en curso, así que soltar un
                // archivo del escritorio sigue haciendo lo que el navegador
                // hace, en vez de ser tragado por esta lista.
                if (dragId) event.preventDefault();
              }}
              onDrop={(event) => {
                if (!dragId) return;
                event.preventDefault();
                const moved = dragId;
                reorder((ids) => reorderPhotoTo(ids, moved, index));
                setDragId(null);
                setNotice("");
              }}
            >
              <div
                className={
                  photo.status === "failed"
                    ? `${styles.thumb} ${styles.thumbFailed}`
                    : photo.status === "ready"
                      ? styles.thumb
                      : `${styles.thumb} ${styles.thumbBusy}`
                }
              >
                {photo.preview ? (
                  /* next/image optimises remote assets through a metered
                     service. This src is a blob: URL for a file already on
                     the device — nothing to fetch, resize or cache — and
                     routing it through the optimiser would spend a paid
                     transform on bytes that never left the phone. */
                  // biome-ignore lint/performance/noImgElement: blob: URL, nothing to optimise
                  <img className={styles.thumbImage} src={photo.preview} alt="" />
                ) : null}
                {/* Said in words, not implied by position: a list read aloud
                    has no "first". */}
                {index === 0 && photo.status !== "failed" ? (
                  <span className={styles.cover}>Portada</span>
                ) : null}
              </div>

              <div className={styles.rowBody}>
                <div className={styles.name}>{photo.name}</div>

                {photo.status === "failed" ? (
                  <div className={styles.rowError}>{photo.error}</div>
                ) : photo.status === "ready" ? (
                  <div className={styles.size}>
                    {formatBytes(photo.originalBytes)} → {formatBytes(photo.compressedBytes ?? 0)}
                  </div>
                ) : (
                  <>
                    <div className={styles.progressTrack}>
                      <div
                        className={styles.progressFill}
                        style={{ inlineSize: photo.status === "uploading" ? "80%" : "40%" }}
                      />
                    </div>
                    <div className={styles.size}>
                      {photo.status === "uploading" ? "Subiendo…" : "Comprimiendo en tu teléfono…"}
                    </div>
                  </>
                )}
              </div>

              {/* Un renglón por acción, con nombre y con la aclaración A LA
                  VISTA: los dos textos largos no son decorativos, y un
                  `title` no aparece nunca en un teléfono. Es un `<details>`
                  y no un panel propio, así que las cuatro acciones siguen ahí
                  para el teclado y el lector en los dos anchos — el arrastre
                  de escritorio se suma a esto, no lo reemplaza. */}
              {photo.status === "ready" ? (
                <details className={styles.menu}>
                  <summary className={styles.menuTrigger} aria-label={`Acciones de ${photo.name}`}>
                    ⋯
                  </summary>
                  <div className={styles.menuSheet}>
                    {photoActionsFor(orderIds, photo.id).map((action) => (
                      <button
                        key={action}
                        type="button"
                        className={styles.menuItem}
                        onClick={() => runPhotoAction(action, photo.id)}
                        aria-label={photoActionLabel(action, photo.name)}
                      >
                        <span className={styles.menuItemLabel}>
                          {PHOTO_ACTION_COPY[action].label}
                        </span>
                        {PHOTO_ACTION_COPY[action].hint ? (
                          <span className={styles.menuItemHint}>
                            {PHOTO_ACTION_COPY[action].hint}
                          </span>
                        ) : null}
                      </button>
                    ))}
                  </div>
                </details>
              ) : (
                <button
                  type="button"
                  className={
                    photo.status === "failed"
                      ? `${styles.remove} ${styles.removeFailed}`
                      : styles.remove
                  }
                  onClick={() => discard(photo.id)}
                  aria-label={discardPhotoLabel(photo.name)}
                >
                  ×
                </button>
              )}
            </li>
          ))}

          {photos.length < MAX_PHOTOS_PER_LISTING ? picker("+ Agregar más", styles.addMore) : null}
        </ul>
      )}

      {notice ? (
        <p className={styles.rowError} role="status" aria-live="polite">
          {notice}
        </p>
      ) : null}

      <p className={styles.hint}>
        Las comprimimos acá antes de subirlas, así gastás menos datos. La primera es la portada.
      </p>

      <div className={styles.trust}>
        <p className={styles.trustLead}>Tienen que ser fotos tuyas, de esta propiedad.</p>
        <p className={styles.trustBody}>
          Publicar fotos tomadas de otro aviso es motivo de baja de la cuenta. Es el reporte más
          frecuente que recibimos.
        </p>
      </div>

      {/* Lo que el formulario del paso 8 envía. **El nombre y el tamaño viajan
          al lado de la clave** porque la pantalla de revisar los muestra
          ("3 fotos · 449 KB") y no hay forma de recuperarlos después sin
          volver a bajar los archivos. Los tres campos van en el mismo orden,
          que es como `readStepAnswers` los vuelve a emparejar — y ese orden es
          el que eligió quien publica, así que tiene que sobrevivir. */}
      {ready.map((photo) => (
        <Fragment key={photo.id}>
          <input type="hidden" name="photoKey" value={photo.key} />
          <input type="hidden" name="photoName" value={photo.name} />
          <input
            type="hidden"
            name="photoBytes"
            value={String(photo.compressedBytes ?? photo.originalBytes)}
          />
        </Fragment>
      ))}
    </div>
  );
}
