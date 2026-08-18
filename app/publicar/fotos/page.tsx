import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireSession } from "../../_lib/require-session";
import { DRAFT_COOKIE, parseDraft } from "../draft";
import styles from "../publish-page.module.css";

export const metadata: Metadata = {
  title: "Publicar · fotos — Rentas",
};

/**
 * SISTEMA.md screen 3, step 2 of 2 — **not built yet, and honest about it**.
 *
 * The upload itself is task 3.14: the presigned PUT, the on-device
 * compression that makes this the one screen allowed client JavaScript, and
 * the call to `publishListing`. Every piece it needs already exists and is
 * proven — the storage port and its R2 adapter, the upload guard, the
 * derivatives, the use case, the transactional repository. What is missing is
 * the wiring and the interface.
 *
 * This page ships anyway rather than leaving step 1 pointing at a 404,
 * because it does one useful thing: it reads the draft back and shows it. If
 * a value is wrong or missing here, the round trip through the cookie is
 * broken, and that is worth finding before the upload is built on top of it.
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
          Tus datos quedaron guardados. La subida de fotos es lo próximo que se construye — es el
          único paso que usa JavaScript, para comprimir en tu teléfono antes de subir.
        </p>

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
