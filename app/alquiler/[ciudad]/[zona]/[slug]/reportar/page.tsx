import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppLink } from "@/../components/atoms/AppLink";
import { ActionButton } from "@/../components/atoms/buttons";
import { Container } from "@/../components/layout/Container";
import { FormShell } from "@/../components/layout/FormShell";
import { Nav } from "@/../components/organisms/Nav";
import { resolveNavAccount, resolveNavPublish } from "@/modules/identity/domain/nav-account";
import { listingIdFromSlug } from "@/modules/listing-discovery/domain/listing-url";
import {
  REPORT_SENT_PARAM,
  resolveReportScreen,
} from "@/modules/listing-trust/domain/report-screen";
import { readSession } from "../../../../../_lib/session";
import { reportarAviso } from "./actions";
import styles from "./reportar.module.css";

/**
 * Reportar un aviso (F31, especificación de la ficha §2 paso 10 — «formulario
 * de reporte») — **la pantalla que le faltaba a `reportListing`** (tasks.md
 * 8.7).
 *
 * **Una pantalla propia y no un bloque al pie de la ficha.** Sin JavaScript el
 * acuse sólo puede llegar por una URL, así que reportar termina en una
 * redirección; hacerla contra la ficha significaría publicar variantes con
 * parámetro de la página más indexada del sitio, para decir «gracias». Acá el
 * `noindex` es honesto: esto no es contenido.
 *
 * **No lleva el origen de la búsqueda.** La ficha arrastra `desde` para poder
 * prometer «← Resultados»; esta pantalla es un desvío sin salida cuya única
 * puerta es volver al aviso, y el botón de atrás del navegador devuelve la URL
 * de la ficha con su origen intacto. Enhebrarlo además por el POST habría sido
 * llevar estado a través de una redirección para un enlace al que se llega
 * apretando atrás.
 */
export const metadata: Metadata = {
  title: "Reportar un aviso — Rentas",
  // No es contenido y no tiene por qué competir con la ficha en el índice.
  robots: { index: false, follow: false },
};

interface ReportarProps {
  params: Promise<{ ciudad: string; zona: string; slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Una sola situación y una sola etiqueta, así que es una constante y no una
 * decisión del dominio: `resultsLink` compone la vuelta de la ficha porque
 * ahí hay DOS respuestas —«← Resultados» o «Ver avisos en Chacao»— y elegir
 * entre ellas es la regla. Acá no hay nada que elegir.
 */
const VOLVER = "← Volver al aviso";

export default async function ReportarPage({ params, searchParams }: ReportarProps) {
  const [{ ciudad, zona, slug }, query] = await Promise.all([params, searchParams]);

  // **La guarda, no una comodidad**, y la misma que la ficha pone primero: este
  // valor termina en un `WHERE id = $1`, así que un segmento apenas plausible
  // se rechaza acá — antes de dibujar un formulario que reportaría un aviso que
  // no existe.
  const listingId = listingIdFromSlug(slug);
  if (!listingId) notFound();

  const listingPath = `/alquiler/${ciudad}/${zona}/${slug}`;
  const reportPath = `${listingPath}/reportar`;

  // Qué se dibuja y qué se dice lo decide el dominio. El acuse que devuelve NO
  // TIENE dónde poner si el aviso quedó oculto, que es la mitad interesante:
  // decirlo le entregaría a quien ataca el dato exacto que le falta.
  const screen = resolveReportScreen(query[REPORT_SENT_PARAM]);

  const session = await readSession();
  const account = resolveNavAccount(session);
  const publish = resolveNavPublish(account);

  return (
    <>
      <Nav
        account={account}
        publish={publish}
        // Volver acá y no a la ficha: quien entra para reportar sigue queriendo
        // reportar. Es el mismo destino que la acción arma cuando el POST llega
        // sin sesión.
        signInHref={`/signin?callbackUrl=${encodeURIComponent(reportPath)}`}
      />

      <main className={styles.page}>
        <Container>
          {/* **La vuelta, adentro del contenido** (14.54). Estaba en la barra, y
              con la ficha era una de las dos únicas pantallas que le pasaban
              `back` al `Nav`; con las dos adentro el encabezado quedó con una
              sola forma. No es un sitio nuevo: `/importar` y
              `/mis-avisos/[id]/editar` ya dibujan su «← Mis avisos» acá arriba.

              Es la única salida de esta pantalla —un desvío sin retorno propio—,
              así que va antes del formulario y no debajo de él. */}
          <AppLink className={styles.volver} href={listingPath}>
            {VOLVER}
          </AppLink>

          <FormShell>
            <h1 className={styles.title}>{screen.heading}</h1>
            <p className={styles.text}>{screen.body}</p>

            {screen.state === "form" ? (
              // **Un POST nativo, y ésa es la garantía, no un detalle.** Un
              // `GET` lo dispara el antivirus del proveedor, el previsualizador
              // de WhatsApp y el prefetch del navegador; un reporte que se
              // ejecutara al abrir gastaría uno de los tres asientos que hacen
              // falta para ocultar un aviso sin que nadie tocara nada. Y sigue
              // andando con el script apagado, como el resto del camino de
              // lectura.
              <form className={styles.form} action={reportarAviso}>
                <input type="hidden" name="listingId" value={listingId} />
                {/* La acción no conoce los segmentos de la ruta, así que la
                    vuelta viaja acá. Llega del navegador, así que la acción la
                    pasa por `safeReturnPath` antes de redirigir a ella. */}
                <input type="hidden" name="listingPath" value={listingPath} />
                <ActionButton type="submit">{screen.submitLabel}</ActionButton>
              </form>
            ) : (
              <p className={styles.text}>
                <AppLink className={styles.back} href={listingPath}>
                  {VOLVER}
                </AppLink>
              </p>
            )}
          </FormShell>
        </Container>
      </main>
    </>
  );
}
