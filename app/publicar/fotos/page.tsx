import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ActionButton } from "../../../components/atoms/buttons";
import { requireSession } from "../../_lib/require-session";
import { DRAFT_COOKIE, parseDraft } from "../draft";
import styles from "../publish-page.module.css";
import { publishFromDraft } from "./actions";
import { PhotoUploader } from "./PhotoUploader";

export const metadata: Metadata = {
  title: "Publicar · fotos — Rentas",
};

/**
 * SISTEMA.md screen 3, step 2 of 2 — the photos.
 *
 * Compress on the device, request a signature for the exact compressed size,
 * PUT straight to R2 — then submit, and `publishFromDraft` runs
 * `processUploadedPhoto` over every uploaded key before `publishListing`
 * writes the listing and its photo rows in one transaction.
 *
 * The draft summary stays on this page on purpose. It is the last moment
 * anyone can check what they wrote before it becomes an advert, and step 1
 * is one link away.
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

        {/* A real form around the uploader: the hidden `photoKey` inputs it
            renders are what this action receives, so the browser carries them
            without any client code marshalling a request. */}
        <form action={publishFromDraft} className={styles.column}>
          <PhotoUploader />
          <ActionButton type="submit">Publicar el aviso</ActionButton>
        </form>

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
