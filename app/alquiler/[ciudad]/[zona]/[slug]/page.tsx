import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { AppLink } from "@/../components/atoms/AppLink";
import { PublisherBadge } from "@/../components/atoms/PublisherBadge";
import { Container } from "@/../components/layout/Container";
import { DetailSplit } from "@/../components/layout/DetailSplit";
import { ReadingWidth } from "@/../components/layout/ReadingWidth";
import { ContactBlock } from "@/../components/molecules/ContactBlock";
import { DeclaredFeatures } from "@/../components/molecules/DeclaredFeatures";
import { PhotoStrip } from "@/../components/molecules/PhotoStrip";
import { StatStrip } from "@/../components/molecules/StatStrip";
import { viewListingContact } from "@/modules/contact-reveal/application/view-listing-contact";
import {
  DrizzleContactRevealMetrics,
  DrizzleRevealableListing,
} from "@/modules/contact-reveal/infrastructure/drizzle-contact-reveal";
import { nextAuthSessionPort } from "@/modules/identity/infrastructure/session-port";
import { resolveListingRoute } from "@/modules/listing-discovery/domain/listing-detail-route";
import { listingIdFromSlug } from "@/modules/listing-discovery/domain/listing-url";
import {
  RETURN_PARAM,
  resultsLink,
  withResultsOrigin,
} from "@/modules/listing-discovery/domain/return-to-results";
import { DrizzleListingDetail } from "@/modules/listing-discovery/infrastructure/drizzle-listing-detail";
import { DrizzleListingPhotos } from "@/modules/listing-discovery/infrastructure/drizzle-listing-photos";
import { db } from "@/shared/db/client";
import styles from "./ficha.module.css";
import { revealListingContact } from "./reveal-actions";

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
  /**
   * La URL de la ficha es canónica y no lleva estado de búsqueda (11.1), así
   * que **de dónde vino quien mira sólo puede llegar acá** (16.9). Es entrada
   * de quien envía: nada de lo que trae se usa sin pasar por el dominio.
   */
  searchParams: Promise<Record<string, string | string[] | undefined>>;
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
export default async function FichaPage({ params, searchParams }: FichaProps) {
  const [{ ciudad, zona, slug }, query] = await Promise.all([params, searchParams]);

  // Sin resolver todavía: lo que llegó, tal cual. Quién decide si sirve y a
  // dónde lleva es el dominio, tres veces en esta página — la redirección
  // canónica, el enlace de vuelta y la vuelta desde la pantalla de entrar.
  const returnTo = query[RETURN_PARAM];

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
    // El origen no canonicaliza nada, pero sobrevive al salto: sin esto, quien
    // llega desde una búsqueda con el título viejo aterriza en la ficha
    // correcta y sin vuelta.
    returnTo,
  );
  if (route.kind === "redirect") redirect(route.to);

  // La misma ficha con el origen puesto. Es lo que la pantalla de entrar tiene
  // que devolver (F19): volver al aviso sin el origen deja el «← Resultados»
  // degradado al respaldo justo después de pedirle una cuenta a alguien.
  const listingHref = withResultsOrigin(listingPath, returnTo);

  // **A dónde vuelve una persona es una regla, y vive en el dominio.** El
  // destino y el texto salen juntos de ahí a propósito: sin origen no hay
  // vuelta que prometer, y una flecha «← Resultados» le mentiría a quien llegó
  // desde Google o desde el inicio.
  const back = resultsLink(returnTo, { cityName: detail.cityName, zoneName: detail.zoneName });

  // **Al revés de como se lee: sólo `active` habilita el contacto.** Escrito
  // como "vencido = expired", un cuarto estado que alguien agregue mañana
  // caería en la rama que MUESTRA el contacto, y ese descuido no falla en
  // ningún lado. Así, lo desconocido cae en la pantalla que no revela nada.
  const availability = detail.status === "active" ? "available" : "expired";

  // Los tres estados del bloque salen de acá, no de un `if` en esta página: si
  // quien mira ya reveló, el caso de uso lee el valor; si no, no lo lee — el
  // contacto no sale de Postgres para quien no lo reveló.
  const contact = await viewListingContact(
    { listingId: detail.id, method: detail.contactMethod, availability },
    {
      sessionPort: nextAuthSessionPort,
      listings: new DrizzleRevealableListing(db),
      reveals: new DrizzleContactRevealMetrics(db),
    },
  );

  return (
    <main className={styles.page}>
      <Container>
        <header className={styles.bar}>
          <AppLink className={styles.back} href={back.href}>
            {back.label}
          </AppLink>
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
                {/* Los tres estados — sin cuenta, con cuenta y vencido — los
                    dibuja el mismo bloque. Elegir acá cuál va sería decidir dos
                    veces lo que el dominio ya decidió, y las dos decisiones se
                    separan en el primer arreglo apurado. */}
                <ContactBlock
                  contact={contact}
                  publisherType={detail.publisherType}
                  publisherName={detail.publisherName}
                  listingId={detail.id}
                  listingTitle={detail.title}
                  revealAction={revealListingContact}
                  // `null` mientras `phone_verified_at` no exista (tasks.md
                  // 16.12): la verificación por WhatsApp es todavía un stub, y
                  // certificar un número que nadie comprobó sería peor que no
                  // decir nada.
                  verifiedAt={null}
                  expiresAt={detail.expiresAt}
                  zoneName={detail.zoneName}
                  zoneHref={`/alquiler/${ciudad}/${zona}`}
                  // `callbackUrl` es el unico parametro que app/(auth)/signin lee, y
                  // lo pasa a Auth.js como `redirectTo`. Con cualquier otro nombre se
                  // ignoraba EN SILENCIO -- la pantalla se dibujaba igual y quien
                  // entraba aterrizaba en `/` en vez de volver al aviso. Eso rompia la
                  // F19, en el paso que el propio documento llama el punto de fuga
                  // principal del producto.
                  //
                  // **No confundirlo con el parametro de la 16.9**, que viaja adentro
                  // de `listingHref`: aquel dice de que pantalla de resultados salio
                  // quien mira, y este dice a que aviso volver despues de entrar. Son
                  // dos vueltas distintas, anidadas una en la otra.
                  signInHref={`/signin?callbackUrl=${encodeURIComponent(listingHref)}`}
                />
              </div>
            </>
          }
        />

        <footer className={styles.footer}>
          <AppLink className={styles.report} href="#reportar">
            Reportar este aviso
          </AppLink>
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
