import type { Metadata } from "next";
import { requireSession } from "../../_lib/require-session";
import styles from "../publish-page.module.css";

export const metadata: Metadata = {
  title: "Aviso publicado — Rentas",
};

interface DonePageProps {
  searchParams: Promise<{ id?: string }>;
}

/**
 * The end of the publish flow.
 *
 * It is deliberately small and deliberately honest: the listing detail page
 * does not exist yet (task 3.15 / PR5), so this cannot link to the advert it
 * just created. Sending someone to a 404 to make the flow feel finished
 * would be worse than telling them where things stand.
 *
 * What it does confirm is the part that matters and that nothing else on
 * screen can show: the listing is written, it is active, and it expires in
 * thirty days — the promise step 1 made.
 */
export default async function PublishDonePage({ searchParams }: DonePageProps) {
  await requireSession("/publicar");
  const { id } = await searchParams;

  return (
    <>
      <header className={styles.bar}>
        <div className={styles.barInner}>
          <p className={styles.brand}>rentas.</p>
          <span className={styles.step}>Listo</span>
        </div>
      </header>

      <main className={styles.column}>
        <h1 className={styles.title}>Tu aviso está publicado</h1>

        <p>Queda activo 30 días. Te avisamos antes de que venza.</p>

        {id ? <p>Referencia: {id}</p> : null}

        <p>
          La página del aviso todavía se está construyendo, así que por ahora no podemos
          mostrártela. Tu aviso ya existe y está activo.
        </p>

        <p>
          <a href="/publicar">Publicar otro</a>
        </p>
      </main>
    </>
  );
}
