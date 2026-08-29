import type { ReactNode } from "react";
import { AppLink } from "../atoms/AppLink";
import { ListingMeta } from "../atoms/ListingMeta";
import { ListingTitle } from "../atoms/ListingTitle";
import { Price } from "../atoms/Price";
import { PublisherBadge } from "../atoms/PublisherBadge";
import styles from "./ListingCard.module.css";

export interface ListingCardPhoto {
  /** La derivada `thumb` (160×120), que es la que pide un teléfono. */
  readonly thumbUrl: string;
  /** La derivada `card` (256×192), que es la que pide el escritorio. */
  readonly cardUrl: string;
  /**
   * Compuesto por `photoAltText` en el dominio. Llega hecho y no se retoca:
   * el orden de ese texto — la posición primero — es una regla de
   * accesibilidad probada, y recomponerlo acá la deroga en silencio.
   */
  readonly alt: string;
}

export interface ListingCardProps {
  readonly href: string;
  readonly priceUsd: number;
  readonly title: string;
  readonly zone: string;
  readonly rooms: number;
  readonly areaM2: number;
  readonly publisherType: "owner" | "broker";
  readonly photo: ListingCardPhoto;
}

/**
 * La tarjeta de la cuadrícula (14.25), que reemplaza a `ResultRow`.
 *
 * **Por qué la portada no es opcional.** La fila que esta tarjeta sustituye
 * dibujaba un rectángulo de CSS cuando no había foto; una tarjeta no puede.
 * Sin imagen se lee como *rota*, y quien la ve no culpa al aviso sino al
 * sitio. Por eso `photo` es obligatoria en el tipo: quién queda fuera es la
 * regla F9, y vive en `buildListingGrid` — acá la forma del prop es lo que
 * impide dibujar el caso que esa regla ya descartó.
 *
 * **Sin JavaScript.** El cambio de tamaño de la foto lo resuelve `<picture>`
 * con un `media`, que el navegador evalúa antes de pedir bytes.
 */
export function ListingCard({
  href,
  priceUsd,
  title,
  zone,
  rooms,
  areaM2,
  publisherType,
  photo,
}: ListingCardProps) {
  return (
    <article className={styles.card} data-testid="listing-card">
      {/* `thumb` en el teléfono y `card` en el escritorio. Mandar la imagen
          grande a un teléfono es gastar dos veces el presupuesto de 150 KB
          que la 14.27 dice que decide si esta cuadrícula sobrevive. */}
      <picture>
        <source media="(min-width: 768px)" srcSet={photo.cardUrl} />
        <img className={styles.photo} src={photo.thumbUrl} alt={photo.alt} loading="lazy" />
      </picture>

      <div className={styles.body}>
        <PublisherBadge publisherType={publisherType} />
        {/* El precio antes del título, en orden de documento (regla
            transversal 2). Un lector de pantalla lee este orden y no el
            visual, y en un alquiler el precio decide si el resto importa. */}
        <p className={styles.price}>
          <Price usd={priceUsd} />
        </p>
        <ListingTitle level={3} clamp>
          {/* Un solo enlace por tarjeta, y su nombre accesible es el título.
              La foto no lleva otro `<AppLink>` al mismo destino: serían dos paradas
              para un solo aviso al tabular. El área tocable la extiende
              `.link::after` sobre toda la tarjeta, porque dos líneas de texto
              no llegan a 44 px de forma confiable y errarle en una cuadrícula
              de dos columnas abre el aviso de al lado. */}
          <AppLink className={styles.link} href={href}>
            {title}
          </AppLink>
        </ListingTitle>
        <ListingMeta>
          {zone} · {rooms} hab · {areaM2} m²
        </ListingMeta>
      </div>
    </article>
  );
}

/**
 * La cuadrícula que las contiene.
 *
 * Vive con la tarjeta y no con la pantalla porque los anchos de 158 y 254 px
 * son geometría de la tarjeta: dejarlos en la hoja de una página los duplica
 * en la siguiente que dibuje avisos, y el inicio de la 14.21 ya es ésa.
 *
 * `<ol>` y no `<div>`: el orden importa — el adaptador devuelve los avisos por
 * fecha de publicación descendente — y un lector de pantalla anuncia cuántos
 * hay antes de recorrerlos.
 */
export function ListingGrid({ children }: { children: ReactNode }) {
  return <ol className={styles.grid}>{children}</ol>;
}
