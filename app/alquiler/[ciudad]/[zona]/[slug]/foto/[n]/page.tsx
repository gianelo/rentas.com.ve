import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { AppLink } from "@/../components/atoms/AppLink";
import type { ListingPhotoView } from "@/modules/listing-discovery/application/ports/listing-photos.port";
import { photoAltText, photoUrl } from "@/modules/listing-discovery/domain/listing-photo-view";
import { listingIdFromSlug } from "@/modules/listing-discovery/domain/listing-url";
import { resolvePhotoViewer } from "@/modules/listing-discovery/domain/photo-viewer";
import { DrizzleListingDetail } from "@/modules/listing-discovery/infrastructure/drizzle-listing-detail";
import { DrizzleListingPhotos } from "@/modules/listing-discovery/infrastructure/drizzle-listing-photos";
import { readPhotoPublicBaseUrl } from "@/modules/listing-discovery/infrastructure/photo-public-base-url";
import { MAX_PHOTOS_PER_LISTING } from "@/modules/listing-publication/domain/publishable-listing";
import { db } from "@/shared/db/client";
import { PhotoViewerKeys } from "./PhotoViewerKeys";
import styles from "./visor.module.css";

/**
 * **Una consulta por petición, no dos.** `generateMetadata` y el componente
 * necesitan el mismo aviso y las mismas fotos, y sin esto cada foto abierta
 * costaría dos pares de viajes HTTP idénticos a Neon. Es el error que ya se
 * cometió en la ficha y hubo que arreglar.
 *
 * Las dos consultas salen juntas y no una detrás de la otra: contra Neon cada
 * una es un viaje HTTP, y encadenarlas paga esa latencia dos veces.
 */
const findViewerData = cache(async (listingId: string) =>
  Promise.all([
    new DrizzleListingDetail(db).findForDetail(listingId),
    new DrizzleListingPhotos(db).allFor(listingId),
  ]),
);

interface VisorProps {
  params: Promise<{ ciudad: string; zona: string; slug: string; n: string }>;
}

/**
 * El visor de fotos (F27, tareas 16.5 / 16.7 / 16.27 / 16.33).
 *
 * **Una foto, una URL.** El visor es navegación y no un estado de la ficha:
 * cada fotografía tiene su propia dirección, así que se indexa, se manda por
 * WhatsApp la foto de la cocina y no "el aviso", y el botón "atrás" del
 * navegador retrocede una foto en vez de salir. Un visor de JavaScript sobre
 * la misma página es más suave al deslizar y rompe las tres cosas.
 *
 * **Esta página no decide nada.** Qué foto pide la URL, cuál es la anterior,
 * si el visor da la vuelta y a dónde lleva la salida son reglas, y viven en
 * `src/modules/listing-discovery/domain/photo-viewer.ts`. Acá se leen
 * parámetros, se consulta y se dibuja.
 *
 * **Un aviso vencido SÍ se muestra**, igual que en la ficha y por la misma
 * razón: devolver 404 sobre una URL que Google ya indexó convierte un aviso
 * que caducó en un enlace roto. Y no hay nada que proteger — el visor no
 * dibuja el contacto, que es lo único que la ficha esconde cuando venció. Un
 * aviso oculto o borrado, en cambio, no llega hasta acá: `findForDetail`
 * devuelve `null` y eso ya es el 404.
 */
export default async function VisorPage({ params }: VisorProps) {
  const { ciudad, zona, slug, n } = await params;

  // **La guarda, no una comodidad.** Este valor se convierte en un
  // `WHERE id = $1`, así que un segmento que apenas parece plausible se
  // rechaza acá y nunca llega a la base como clave de búsqueda.
  const listingId = listingIdFromSlug(slug);
  if (!listingId) notFound();

  const [detail, photos] = await findViewerData(listingId);
  // `null` cubre inexistente, oculto y borrado por igual: quien sondea URLs no
  // puede distinguir un aviso dado de baja de uno que nunca existió.
  if (!detail) notFound();

  const frames = drawableFrames(photos);

  const resolution = resolvePhotoViewer({
    listing: {
      id: detail.id,
      cityName: detail.cityName,
      zoneName: detail.zoneName,
      title: detail.title,
    },
    segment: n,
    requestedPath: `/alquiler/${ciudad}/${zona}/${slug}/foto/${n}`,
    total: frames.length,
  });

  // Fuera de rango, un segmento que no es número y un aviso sin fotos
  // dibujables caen todos acá: no hay foto que mostrar.
  if (resolution.kind === "notFound") notFound();
  // **La deuda que la tarea 11.1 dejó escrita, multiplicada por foto.** Toda
  // ruta que termine en este id resuelve a este aviso; con seis fotos y tres
  // formas de escribir la zona serían dieciocho URLs para seis fotografías.
  if (resolution.kind === "redirect") redirect(resolution.to);

  const view = resolution.view;
  const frame = frames[view.position];
  // Inalcanzable — el dominio ya acotó `position` contra este mismo total —,
  // pero es lo que convierte el índice en un valor y no en un `undefined`
  // silencioso si algún día las dos cuentas se separan.
  if (!frame) notFound();

  // Ruidoso a propósito, y más que en la ficha: allá la tira ausente deja una
  // ficha legible, acá la foto ES la página. Sin base pública el visor sería
  // una pantalla oscura y vacía sin una línea en el log diciendo por qué.
  const publicBaseUrl = readPhotoPublicBaseUrl();

  return (
    <main className={styles.page}>
      <header className={styles.bar}>
        {/* El nombre va como texto y el glifo queda decorativo: "×" leído en
            voz alta es "signo de multiplicación", no "cerrar". */}
        <AppLink className={styles.close} href={view.exitHref} data-viewer-key="exit">
          <span aria-hidden="true">×</span>
          <span className={styles.srOnly}>Cerrar el visor y volver al aviso</span>
        </AppLink>
        {/* El contador va en base uno porque es el número de la URL: quien
            comparte "/foto/2" y lee "2 / 6" está mirando el mismo dato. */}
        <span className={styles.counter}>
          {view.number} / {view.total}
        </span>
        {/* Equilibra la barra para que el contador quede centrado sin
            posicionarlo: es una ausencia, no un control. */}
        <span className={styles.balance} aria-hidden="true" />
      </header>

      <div className={styles.stage}>
        <img
          className={styles.photo}
          src={photoUrl(publicBaseUrl, frame.full)}
          // El alternativo sale del dominio y lleva la posición adelante
          // ("Foto 2 de 6 — …", F28): quien usa lector de pantalla necesita
          // saber dónde está antes que qué mira.
          alt={photoAltText({
            position: view.position,
            total: view.total,
            title: detail.title,
            zone: detail.zoneName,
          })}
        />

        {/* Enlaces reales, no estado de cliente. De ahí sale, sin programar
            nada, que "atrás" retroceda una foto. En la primera y en la última
            NO se dibuja un enlace apagado: un `<AppLink>` sin `href` no es un
            control deshabilitado, es uno que el teclado no alcanza y que el
            lector de pantalla anuncia igual. */}
        {view.previousHref ? (
          <AppLink
            className={styles.previous}
            href={view.previousHref}
            rel="prev"
            data-viewer-key="previous"
          >
            <span className={styles.arrow} aria-hidden="true">
              ‹
            </span>
            <span className={styles.srOnly}>Foto anterior</span>
          </AppLink>
        ) : null}
        {view.nextHref ? (
          <AppLink className={styles.next} href={view.nextHref} rel="next" data-viewer-key="next">
            <span className={styles.arrow} aria-hidden="true">
              ›
            </span>
            <span className={styles.srOnly}>Foto siguiente</span>
          </AppLink>
        ) : null}
      </div>

      <div className={styles.caption}>
        <span className={styles.title}>{detail.title}</span>
        <span className={styles.place}>
          {detail.zoneName} · {detail.cityName}
        </span>
      </div>

      {/* La tira dice dónde estás dentro de las seis, y cada miniatura es un
          enlace: la navegación completa está disponible sin una sola tecla. */}
      <nav className={styles.thumbs} aria-label="Fotos del aviso">
        {view.photos.map((item) => {
          const thumb = frames[item.position];
          if (!thumb) return null;
          return (
            <AppLink
              className={item.current ? styles.thumbCurrent : styles.thumb}
              href={item.href}
              key={item.number}
              aria-current={item.current ? "true" : undefined}
            >
              <img
                className={styles.thumbImage}
                src={photoUrl(publicBaseUrl, thumb.thumb)}
                // Vacío a propósito: el enlace ya se anuncia con el texto de
                // abajo, y repetir la posición en la imagen de adentro lo
                // haría decir todo dos veces.
                alt=""
                loading="lazy"
              />
              <span className={styles.srOnly}>{`Ver la foto ${item.number} de ${view.total}`}</span>
            </AppLink>
          );
        })}
      </nav>

      <footer className={styles.footer}>
        {/* El precio no desaparece: se sigue decidiendo mientras se mira. */}
        <span className={styles.priceBlock}>
          <span className={styles.price}>${detail.priceUsd}</span>
          <span className={styles.perMonth}>al mes</span>
        </span>
        <AppLink className={styles.exit} href={view.exitHref}>
          Ver el aviso
        </AppLink>
      </footer>

      {/* El teclado, encima de todo lo anterior. Si no llega, la pantalla que
          está arriba ya funciona entera. */}
      <PhotoViewerKeys />
    </main>
  );
}

/** Las dos derivadas que el visor dibuja, ya resueltas a claves presentes. */
interface Frame {
  readonly full: string;
  readonly thumb: string;
}

/**
 * Una fila sin sus derivadas es un registro roto — la derivación produce las
 * cinco o falla —, y en el visor una `<img>` rota no es una foto que falta:
 * es la página entera vacía. Se saltea.
 *
 * **Y por eso el total se cuenta sobre lo que queda.** `/foto/2` es la segunda
 * foto DIBUJABLE, la misma que la tira de la ficha enlazó como `/foto/2`: las
 * dos superficies saltean por el mismo motivo y sobre las mismas filas, porque
 * `DerivedPhotoSet` tiene cinco miembros o no existe.
 */
function drawableFrames(photos: readonly ListingPhotoView[]): readonly Frame[] {
  return photos
    .flatMap(({ keys }) =>
      keys.full && keys.thumb ? [{ full: keys.full, thumb: keys.thumb }] : [],
    )
    .slice(0, MAX_PHOTOS_PER_LISTING);
}

export async function generateMetadata({ params }: VisorProps): Promise<Metadata> {
  const { ciudad, zona, slug, n } = await params;
  const listingId = listingIdFromSlug(slug);
  if (!listingId) return {};

  // Cacheada: el componente pide exactamente esto, y sin `cache` cada foto
  // abierta pagaría dos veces los mismos dos viajes a Neon.
  const [detail, photos] = await findViewerData(listingId);
  if (!detail) return {};

  const resolution = resolvePhotoViewer({
    listing: {
      id: detail.id,
      cityName: detail.cityName,
      zoneName: detail.zoneName,
      title: detail.title,
    },
    segment: n,
    requestedPath: `/alquiler/${ciudad}/${zona}/${slug}/foto/${n}`,
    total: drawableFrames(photos).length,
  });
  // Sin título para lo que no se va a servir: una ruta no canónica redirige y
  // una foto inexistente es un 404, y titular ninguna de las dos tiene sentido.
  if (resolution.kind !== "view") return {};

  return {
    // El mismo orden que el alternativo: la posición primero. Es lo que se lee
    // en la pestaña y en la vista previa de WhatsApp, donde el título compite
    // con la miniatura de la propia foto.
    title: `Foto ${resolution.view.number} de ${resolution.view.total} — ${detail.title}, ${detail.zoneName}`,
    description: detail.description.slice(0, 155),
  };
}
