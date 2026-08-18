import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireSession } from "../../_lib/require-session";
import { DRAFT_COOKIE, parseDraft } from "../draft";
import styles from "../publish-page.module.css";
import { PhotoUploader } from "./PhotoUploader";

export const metadata: Metadata = {
  title: "Publicar · fotos — Rentas",
};

/**
 * SISTEMA.md screen 3, step 2 of 2 — the photos.
 *
 * The upload works: compress on the device, request a signature for the exact
 * compressed size, PUT straight to R2. **What is still missing is the last
 * step**, task 3.14c — running `processUploadedPhoto` over each uploaded key
 * and then `publishListing`. Until that lands the photos reach the bucket's
 * incoming prefix and no listing row is written, which is why this page still
 * shows the draft back rather than a published advert.
 */
export default async function PublishPhotosPage() {
  await requireSession("/publicar/fotos");

  const draft = parseDraft((await cookies()).get(DRAFT_COOKIE)?.value);

  // Reaching step 2 without a draft means the cookie expired or the URL was
  // typed directly. Sending someone back to an empty form beats showing them
  // an empty summary and asking them to trust it.
  if (!draft) redirect("/publicar");

  const { values } = draft;

  return (
    <>
      <header className={styles.bar}>
        <div className={styles.barInner}>
          <p className={styles.brand}>rentas.</p>
          <span className={styles.step}>Paso 2 de 2</span>
        </div>
      </header>

      <main className={styles.column}>
        <h1 className={styles.title}>Las fotos</h1>

        <p>
          Tus datos quedaron guardados. Elegí las fotos y las achicamos en tu teléfono antes de
          subirlas, así gastás menos datos.
        </p>

        <PhotoUploader />

        <dl>
          <dt>Título</dt>
          <dd>{values.title}</dd>
          <dt>Precio mensual</dt>
          <dd>{values.priceUsd} USD</dd>
          <dt>Habitaciones</dt>
          <dd>{values.rooms}</dd>
          <dt>Metros cuadrados</dt>
          <dd>{values.areaM2}</dd>
        </dl>

        <p>
          <a href="/publicar">Volver a los datos</a>
        </p>
      </main>
    </>
  );
}
