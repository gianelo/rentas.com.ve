import type { ListingPhotoView } from "@/modules/listing-discovery/application/ports/listing-photos.port";
import { photoAltText, photoUrl } from "@/modules/listing-discovery/domain/listing-photo-view";
import { photoNumberOf, photoViewerPath } from "@/modules/listing-discovery/domain/photo-viewer";
import { MAX_PHOTOS_PER_LISTING } from "@/modules/listing-publication/domain/publishable-listing";
import styles from "./PhotoStrip.module.css";

export interface PhotoStripProps {
  /** En el orden que eligió quien publica. La portada es la primera. */
  readonly photos: readonly ListingPhotoView[];
  /** `R2_BUCKET_PUBLIC_URL`. Vacío significa que el bucket no está configurado. */
  readonly publicBaseUrl: string;
  readonly title: string;
  readonly zone: string;
  /**
   * La ruta de la ficha. **Cada foto no lleva acá: lleva a su visor**,
   * `…/foto/<n>` (tarea 16.5), que cuelga de esta ruta. Una URL por foto,
   * compartible e indexable — y ésta es la única entrada al visor, así que un
   * `href` que apuntara todas las fotos al mismo lugar lo dejaría inalcanzable.
   */
  readonly href: string;
}

/** Las tres derivadas que la tira dibuja, ya resueltas a claves presentes. */
interface Frame {
  readonly strip: string;
  readonly detail: string;
  readonly thumb: string;
}

/**
 * La tira de fotos de la ficha (F26).
 *
 * **Es scroll nativo, no un carrusel.** Un carrusel de JavaScript deja cinco de
 * las seis fotos inalcanzables en cuanto el script no llega — y en las
 * conexiones para las que este producto está hecho, no llegar es normal.
 * `scroll-snap` es del navegador, así que la tira se arrastra igual con el
 * script apagado.
 *
 * **Una sola foto en el camino crítico.** La ficha tiene un techo de 500 KB, y
 * seis descargas simultáneas lo perforan solas: la primera se pide con la
 * página y las otras cinco quedan diferidas. Ése es el motivo del reparto
 * `eager` / `lazy`, no una preferencia.
 *
 * **Un componente con puntos de quiebre, NUNCA dos.** El escritorio no
 * redibuja la tira; la misma marca pide otra derivada con `<picture>`, y el
 * navegador baja exactamente una imagen por foto. Dos implementaciones de lo
 * mismo empiezan idénticas y se separan en el primer arreglo apurado.
 */
export function PhotoStrip({ photos, publicBaseUrl, title, zone, href }: PhotoStripProps) {
  // Sin base pública toda URL quedaría relativa a este sitio y la tira sería
  // seis íconos rotos. `photoUrl` sólo protege la clave, no la base.
  if (publicBaseUrl.trim() === "") return null;

  const frames = resolveFrames(photos);
  if (frames.length === 0) return null;

  return (
    <figure className={styles.gallery} data-testid="photo-strip">
      <ul className={styles.track}>
        {frames.map((frame, index) => {
          const lead = index === 0;
          return (
            <li className={styles.item} key={frame.strip}>
              {/* El número sale del dominio y no de un `index + 1` escrito
                  acá: la traducción entre el `<n>` de la URL (base uno) y
                  `listing_photo.position` (base cero) es una regla, y una
                  regla copiada en un componente es la que termina corrida en
                  uno. Se numera sobre lo que se DIBUJA — igual que el
                  alternativo — para que "/foto/2" y "Foto 2 de 5" hablen de la
                  misma fotografía cuando una fila rota quedó salteada. */}
              <a className={styles.frame} href={photoViewerPath(href, photoNumberOf(index))}>
                <picture>
                  {/* La derivada de escritorio, elegida por el navegador antes
                      de pedir nada: la principal es la de 640×360 y las demás
                      son miniaturas de 120×90. */}
                  <source
                    media="(min-width: 768px)"
                    srcSet={photoUrl(publicBaseUrl, lead ? frame.detail : frame.thumb)}
                  />
                  <img
                    className={styles.image}
                    src={photoUrl(publicBaseUrl, frame.strip)}
                    alt={photoAltText({ position: index, total: frames.length, title, zone })}
                    loading={lead ? "eager" : "lazy"}
                  />
                </picture>
              </a>
            </li>
          );
        })}
      </ul>

      {/* Los puntos dicen cuántas fotos hay, y ninguno se dibuja encendido.
          Sin JavaScript nada puede seguir el scroll, así que un primer punto
          iluminado sería cierto al cargar y mentira apenas se arrastra el
          dedo. Quien lee con lector de pantalla ya recibe la posición en cada
          alternativo ("Foto 3 de 6"), que es donde ese dato sí es verdad. */}
      {frames.length > 1 ? (
        <div className={styles.dots} aria-hidden="true">
          {frames.map((frame) => (
            <span className={styles.dot} data-testid="photo-dot" key={frame.strip} />
          ))}
        </div>
      ) : null}
    </figure>
  );
}

/**
 * Una fila sin sus derivadas es un registro roto — la derivación produce las
 * cinco o falla — y una `<img>` rota se lee como una ficha rota, no como una
 * foto que falta. Se saltea.
 *
 * El total del alternativo se cuenta **sobre lo que queda**: "Foto 2 de 5"
 * sobre cinco fotos es verdad, y "Foto 2 de 6" no lo sería.
 */
function resolveFrames(photos: readonly ListingPhotoView[]): readonly Frame[] {
  return photos
    .flatMap(({ keys }) =>
      keys.strip && keys.detail && keys.thumb
        ? [{ strip: keys.strip, detail: keys.detail, thumb: keys.thumb }]
        : [],
    )
    .slice(0, MAX_PHOTOS_PER_LISTING);
}
