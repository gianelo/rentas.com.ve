"use client";

import { useState } from "react";
import { MAX_PHOTOS_PER_LISTING } from "../../../src/modules/listing-publication/domain/publishable-listing";
import { SUPPORTED_PHOTO_CONTENT_TYPES } from "../../../src/modules/listing-publication/domain/uploaded-photo";
import { requestUploadTargets } from "./actions";
import { computeResize, UPLOAD_CONTENT_TYPE, UPLOAD_QUALITY } from "./compress";
import styles from "./photo-uploader.module.css";

/**
 * Step 2 of 2 — the only client component in the publish flow, and the only
 * screen in the product where SISTEMA.md allows JavaScript. The reason is
 * specific: a phone photo is 3–8 MB, six of them on a Venezuelan mobile
 * connection is the slowest thing this product ever asks anyone to do, and
 * compressing before the bytes leave the device is the only fix that works
 * on the connection rather than around it.
 *
 * ## The order is the design
 *
 * **Compress → measure → sign → upload.** The presigned PUT pins
 * `ContentLength` into its signature, so a body of any other length fails at
 * R2's edge. That means the exact byte count must be known *before* the
 * signature is requested — compressing after signing would invalidate every
 * URL just issued. It reads as an implementation detail and it is the whole
 * sequence.
 *
 * Nothing here decides what is acceptable. `validateUploadRequest` refuses a
 * request worth no signature, `inspectUploadedPhoto` reads the file's own
 * header after upload, and `deriveListingPhoto` produces what is actually
 * stored. A client that lies gets a signature it cannot use.
 */

type Stage = "idle" | "compressing" | "signing" | "uploading" | "done" | "failed";

export interface UploadedPhoto {
  readonly key: string;
  readonly name: string;
}

async function compress(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const { width, height } = computeResize({ width: bitmap.width, height: bitmap.height });

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("El navegador no pudo procesar la imagen.");
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, UPLOAD_CONTENT_TYPE, UPLOAD_QUALITY),
  );
  if (!blob) throw new Error("El navegador no pudo comprimir la imagen.");
  return blob;
}

export function PhotoUploader({ onUploaded }: { onUploaded?: (photos: UploadedPhoto[]) => void }) {
  const [stage, setStage] = useState<Stage>("idle");
  const [message, setMessage] = useState<string>("");
  const [uploaded, setUploaded] = useState<UploadedPhoto[]>([]);

  async function handleFiles(fileList: FileList | null) {
    const files = Array.from(fileList ?? []);
    if (files.length === 0) return;

    if (files.length > MAX_PHOTOS_PER_LISTING) {
      // Said here as well as refused on the server, because a publisher who
      // picked ten photos should learn that before waiting for ten uploads.
      setStage("failed");
      setMessage(`Hasta ${MAX_PHOTOS_PER_LISTING} fotos por aviso. Elegí las mejores.`);
      return;
    }

    try {
      setStage("compressing");
      setMessage("Preparando las fotos en tu teléfono…");
      const blobs = await Promise.all(files.map(compress));

      setStage("signing");
      setMessage("Pidiendo permiso para subirlas…");
      const result = await requestUploadTargets(
        blobs.map((blob) => ({ contentType: UPLOAD_CONTENT_TYPE, byteLength: blob.size })),
      );
      if (!result.ok) {
        setStage("failed");
        setMessage("No pudimos preparar la subida. Volvé a intentar.");
        return;
      }

      setStage("uploading");
      const done: UploadedPhoto[] = [];
      for (const [index, target] of result.targets.entries()) {
        setMessage(`Subiendo ${index + 1} de ${result.targets.length}…`);
        const blob = blobs[index] as Blob;
        // Sequential, matching the server pipeline: six parallel uploads on a
        // constrained connection make every one of them slower and give the
        // publisher no idea which is progressing.
        const response = await fetch(target.url, {
          method: "PUT",
          // Exactly the type that was signed. Any other value fails the
          // signature at R2's edge rather than landing something unexpected.
          headers: { "content-type": UPLOAD_CONTENT_TYPE },
          body: blob,
        });
        if (!response.ok) throw new Error(`R2 respondió ${response.status}`);
        done.push({ key: target.key, name: files[index]?.name ?? `foto-${index + 1}` });
      }

      setUploaded(done);
      setStage("done");
      setMessage(
        `${done.length} foto${done.length === 1 ? "" : "s"} lista${done.length === 1 ? "" : "s"}.`,
      );
      onUploaded?.(done);
    } catch (error) {
      setStage("failed");
      setMessage(error instanceof Error ? error.message : "No pudimos subir las fotos.");
    }
  }

  const busy = stage === "compressing" || stage === "signing" || stage === "uploading";

  return (
    <div className={styles.uploader}>
      <label className={styles.label} htmlFor="photos">
        Fotos <span className={styles.required}>✱ obligatorio</span>
      </label>

      <input
        id="photos"
        name="photos"
        type="file"
        multiple
        // The same list the guard enforces. A file input advertising a type
        // the guard rejects wastes a publisher's upload; one omitting a type
        // the guard accepts hides a format that would have worked.
        accept={SUPPORTED_PHOTO_CONTENT_TYPES.join(",")}
        className={styles.input}
        disabled={busy}
        onChange={(event) => void handleFiles(event.target.files)}
      />

      <p className={styles.help}>
        Hasta {MAX_PHOTOS_PER_LISTING}. Se achican en tu teléfono antes de subir, así gastás menos
        datos.
      </p>

      {/* Announced, not merely shown: this is the slowest step in the flow and
          a screen-reader user gets no progress from a changing paragraph
          unless it is a live region. */}
      <p
        className={stage === "failed" ? styles.error : styles.status}
        role="status"
        aria-live="polite"
      >
        {message}
      </p>

      {uploaded.map((photo) => (
        <input key={photo.key} type="hidden" name="photoKey" value={photo.key} />
      ))}
    </div>
  );
}
