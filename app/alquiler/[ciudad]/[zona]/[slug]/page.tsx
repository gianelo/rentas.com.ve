import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { PublisherBadge } from "@/../components/atoms/PublisherBadge";
import { Container } from "@/../components/layout/Container";
import { DetailSplit } from "@/../components/layout/DetailSplit";
import { ReadingWidth } from "@/../components/layout/ReadingWidth";
import { ContactBlock } from "@/../components/molecules/ContactBlock";
import { DeclaredFeatures } from "@/../components/molecules/DeclaredFeatures";
import { PhotoStrip } from "@/../components/molecules/PhotoStrip";
import { StatStrip } from "@/../components/molecules/StatStrip";
import { presentContact } from "@/modules/contact-reveal/domain/revealable-contact";
import { resolveListingRoute } from "@/modules/listing-discovery/domain/listing-detail-route";
import { listingIdFromSlug } from "@/modules/listing-discovery/domain/listing-url";
import { DrizzleListingDetail } from "@/modules/listing-discovery/infrastructure/drizzle-listing-detail";
import { DrizzleListingPhotos } from "@/modules/listing-discovery/infrastructure/drizzle-listing-photos";
import { db } from "@/shared/db/client";
import styles from "./ficha.module.css";

/**
 * **Una consulta por peticion, no dos.** `generateMetadata` y el componente
 * necesitan el mismo aviso, y sin esto cada ficha abierta costaba dos viajes
 * HTTP identicos a Neon -- en la pantalla mas visitada del sitio.
 *
 * `cache` de React deduplica dentro de una misma peticion, que es exactamente
 * el alcance del problema: dos llamadas, un render.
 */
const findDetail = cache(async (listingId: string) =>
  new DrizzleListingDetail(db).findForDetail(listingId),
);

interface FichaProps {
  params: Promise<{ ciudad: string; zona: string; slug: string }>;
}

/**
 * La ficha del aviso — la pantalla que cierra el ciclo del producto.
 *
 * Hasta acá se podía buscar y publicar, pero **no abrir un aviso**: nadie
 * llegaba nunca al WhatsApp de quien publica, que es la única razón por la que
 * el sitio existe.
 *
 * **Sin sesión y sin JavaScript de cliente.** Todo el contenido del aviso es
 * público e indexable; lo único detrás de la cuenta es el teléfono, y esa
 * puerta es un enlace a la pantalla de entrar, no un componente de cliente.
 *
 * **Una sola ficha con puntos de quiebre, no una móvil y una de escritorio.**
 * El orden de la columna única lo pone el CSS de esta página (`order`), y las
 * dos columnas de 640 + 420 las pone `DetailSplit`. Dos implementaciones de la
 * misma pantalla arrancan idénticas y se separan en el primer arreglo apurado.
 */
export default async function FichaPage({ params }: FichaProps) {
  const { ciudad, zona, slug } = await params;

  // **La guarda, no una comodidad.** Este valor se convierte en un
  // `WHERE id = $1`, así que un segmento que apenas parece plausible se
  // rechaza acá y nunca llega a la base como clave de búsqueda.
  const listingId = listingIdFromSlug(slug);
  if (!listingId) notFound();

  // Las dos consultas salen juntas y no una detrás de la otra: contra Neon
  // cada una es un viaje HTTP, y encadenarlas paga esa latencia dos veces.
  // Un id que no existe devuelve una lista de fotos vacía, no un error.
  const [detail, photos] = await Promise.all([
    // Cacheada: `generateMetadata` pide el mismo aviso, y sin esto cada ficha
    // abierta paga dos viajes HTTP identicos a Neon.
    findDetail(listingId),
    new DrizzleListingPhotos(db).allFor(listingId),
  ]);
  // `null` cubre inexistente, oculto y borrado por igual: quien sondea URLs no
  // puede distinguir un aviso dado de baja de uno que nunca existió.
  if (!detail) notFound();

  const listingPath = `/alquiler/${ciudad}/${zona}/${slug}`;

  // **La deuda que la tarea 11.1 dejó escrita, y acá se paga.** Toda ruta que
  // termine en este id resuelve a este aviso, así que servirlas todas
  // publicaría URLs duplicadas sin límite para un solo aviso.
  const route = resolveListingRoute(
    {
      id: detail.id,
      cityName: detail.cityName,
      zoneName: detail.zoneName,
      title: detail.title,
    },
    listingPath,
  );
  if (route.kind === "redirect") redirect(route.to);

  const expired = detail.status === "expired";
  // Sin sesión todavía: la revelación es su propio caso de uso y su propia
  // tarea. `null` es el visitante anónimo, que es lo que ve quien llega de
  // Google — y es el estado que el diseño dibuja por defecto.
  const contact = presentContact({ method: detail.contactMethod, value: "" }, null);

  return (
    <main className={styles.page}>
      <Container>
        <header className={styles.bar}>
          <a className={styles.back} href={`/alquiler/${ciudad}/${zona}`}>
            ← Resultados
          </a>
        </header>

        <DetailSplit
          media={
            <>
              <div className={styles.gallery}>
                <PhotoStrip
                  photos={photos}
                  // Se lee al servir y no al importar el módulo: `next build`
                  // evalúa el módulo sin las variables del despliegue, y una
                  // lectura arriba del archivo convierte una foto en un build
                  // roto.
                  publicBaseUrl={process.env.R2_BUCKET_PUBLIC_URL ?? ""}
                  title={detail.title}
                  zone={detail.zoneName}
                  href={listingPath}
                />
              </div>

              <div className={styles.body}>
                <StatStrip
                  rooms={detail.rooms}
                  bathrooms={detail.bathrooms}
                  areaM2={detail.areaM2}
                  parkingSpots={detail.parkingSpots}
                />

                <DeclaredFeatures
                  hasPowerPlant={detail.hasPowerPlant}
                  hasRegularWater={detail.hasRegularWater}
                  isFurnished={detail.isFurnished}
                  hasSecurity={detail.hasSecurity}
                  hasAppliances={detail.hasAppliances}
                />

                <section className={styles.description}>
                  <h2 className={styles.heading}>Descripción</h2>
                  <ReadingWidth>
                    <p className={styles.text}>{detail.description}</p>
                  </ReadingWidth>
                </section>
              </div>
            </>
          }
          data={
            <>
              <div className={styles.summary}>
                {/* Dueño con relleno, inmobiliaria con borde: la distinción
                    tiene que sobrevivir a la escala de grises, y eso es
                    estructura y no color. Va acá y no en la barra porque en
                    escritorio encabeza la columna de datos, y dibujarlo dos
                    veces sería tener dos fichas otra vez. */}
                <PublisherBadge publisherType={detail.publisherType} />

                <p className={styles.price}>
                  ${detail.priceUsd}
                  <span className={styles.perMonth}> / mes</span>
                </p>
                <h1 className={styles.title}>{detail.title}</h1>
                {/* El tipo va junto a la ubicación y no en la tira de cifras
                    (F23/R3): es una categoría, no un número. */}
                <p className={styles.location}>
                  {PROPERTY_LABEL[detail.propertyType]} · {detail.zoneName}
                  {detail.zoneParentName ? ` · ${detail.zoneParentName}` : ""} · {detail.cityName}
                </p>
              </div>

              <div className={styles.contact}>
                {expired ? (
                  <section className={styles.expired} data-testid="expired-notice">
                    <h2 className={styles.heading}>Aviso vencido</h2>
                    <p className={styles.text}>
                      Este aviso venció y no fue renovado. No mostramos el contacto de avisos
                      vencidos.
                    </p>
                    <a className={styles.exit} href={`/alquiler/${ciudad}/${zona}`}>
                      Ver avisos activos en {detail.zoneName}
                    </a>
                  </section>
                ) : (
                  <ContactBlock
                    contact={contact}
                    publisherType={detail.publisherType}
                    publisherName={detail.publisherName}
                    // `callbackUrl` y no `volver`: es el unico parametro que
                    // app/(auth)/signin lee, y lo pasa a Auth.js como `redirectTo`. Con
                    // el nombre equivocado se ignoraba EN SILENCIO -- la pantalla se
                    // dibujaba igual y quien entraba aterrizaba en `/` en vez de volver
                    // al aviso. Eso rompia la F19, en el paso que el propio documento
                    // llama el punto de fuga principal del producto.
                    signInHref={`/signin?callbackUrl=${encodeURIComponent(`/alquiler/${ciudad}/${zona}/${slug}`)}`}
                  />
                )}
              </div>
            </>
          }
        />

        <footer className={styles.footer}>
          <a className={styles.report} href="#reportar">
            Reportar este aviso
          </a>
          <span className={styles.meta}>
            ID {detail.id.slice(0, 8)} · vence {formatDate(detail.expiresAt)}
          </span>
        </footer>
      </Container>
    </main>
  );
}

const PROPERTY_LABEL = {
  apartamento: "Apartamento",
  casa: "Casa",
  quinta: "Quinta",
  anexo: "Anexo",
  habitacion: "Habitación",
} as const;

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("es-VE", { day: "numeric", month: "short" }).format(date);
}

export async function generateMetadata({ params }: FichaProps): Promise<Metadata> {
  const { slug } = await params;
  const listingId = listingIdFromSlug(slug);
  if (!listingId) return {};

  const detail = await findDetail(listingId);
  if (!detail) return {};

  return {
    title: `${detail.title} — ${detail.zoneName}, ${detail.cityName}`,
    description: detail.description.slice(0, 155),
  };
}
