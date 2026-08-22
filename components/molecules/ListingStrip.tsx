import { ListingCard, type ListingCardPhoto } from "./ListingCard";
import styles from "./ListingStrip.module.css";

export interface ListingStripCard {
  readonly id: string;
  readonly href: string;
  readonly priceUsd: number;
  readonly title: string;
  readonly zoneName: string;
  readonly rooms: number;
  readonly areaM2: number;
  readonly publisherType: "owner" | "broker";
  readonly photo: ListingCardPhoto;
}

export interface ListingStripLink {
  readonly href: string;
  /**
   * Compuesto en el dominio. Llega hecho y no se retoca: el número que dice
   * —"Ver los 23"— es el de la colección y no el de las tarjetas dibujadas, y
   * recomponerlo acá derogaría esa regla en silencio.
   */
  readonly label: string;
}

export interface ListingStripProps {
  /** La clave de la colección, que es lo que hace único el id del encabezado. */
  readonly stripKey: string;
  readonly title: string;
  readonly cards: readonly ListingStripCard[];
  /** `null` cuando la tira no promete nada más de lo que muestra. */
  readonly seeAll: ListingStripLink | null;
}

/**
 * La tira del inicio (14.26), que **cambia de mecanismo entre anchos**.
 *
 * En un teléfono es un riel que se arrastra en horizontal, con las cinco
 * tarjetas y la placa "Ver todos" al final. En escritorio es una fila fija de
 * cinco, y la salida sube al encabezado como total más flecha.
 *
 * **Un solo componente con puntos de quiebre, nunca dos.** La razón ya está
 * escrita en `SearchFilters`, que resolvió lo mismo del otro lado del
 * producto: dos implementaciones de la misma pantalla arrancan idénticas y se
 * separan en el primer arreglo apurado. Acá el costo sería peor — cada mitad
 * terminaría con su propia idea de cuántas tarjetas caben y de a dónde lleva la
 * salida, y la placa de una diría un número que la otra no.
 *
 * **Sin JavaScript.** El arrastre y el anclaje los resuelve el navegador con
 * `scroll-snap-type`, que es CSS. Un carrusel con script sería la primera línea
 * de cliente en toda la ruta de lectura, que es exactamente lo que el D13
 * mantiene vacío.
 *
 * **Ninguna regla de producto vive acá.** Si esta tira existe, cuántas tarjetas
 * trae, si lleva placa y qué dice esa placa lo decidió `home-collections.ts`.
 * Este archivo dibuja lo que le dan.
 */
export function ListingStrip({ stripKey, title, cards, seeAll }: ListingStripProps) {
  // El `:` de una clave como `ciudad:dc` es válido en un id de HTML pero hay
  // que escaparlo en cualquier selector; cambiarlo acá es formato, no regla.
  const headingId = `tira-${stripKey.replace(/[^a-zA-Z0-9-]/g, "-")}`;

  return (
    <section className={styles.strip} aria-labelledby={headingId}>
      <header className={styles.head}>
        <h2 className={styles.title} id={headingId}>
          {title}
        </h2>
        {/* El mecanismo de escritorio. Existe en el DOM en los dos anchos y el
            CSS lo oculta en el teléfono con `display: none`, que lo saca
            también del árbol de accesibilidad — escondiéndolo de otra forma,
            un lector de pantalla anunciaría dos veces la misma salida. */}
        {seeAll ? (
          <a className={styles.headLink} href={seeAll.href} data-testid="strip-head-link">
            {seeAll.label}
            {/* La flecha es decoración: el nombre accesible del enlace ya lo
                da el texto de al lado, y anunciar "flecha derecha" no agrega
                nada a quien no la ve. */}
            <span className={styles.arrow} aria-hidden="true">
              →
            </span>
          </a>
        ) : null}
      </header>

      {/* `<ol>` y no `<div>`: el orden importa — las colecciones llegan por
          fecha de publicación descendente — y un lector de pantalla anuncia
          cuántos elementos hay antes de recorrerlos. En el teléfono la placa
          es el último de esos elementos, y eso es cierto: es lo que sigue
          después del quinto aviso. */}
      <ol className={styles.rail}>
        {cards.map((card) => (
          <li className={styles.item} key={card.id}>
            <ListingCard
              href={card.href}
              priceUsd={card.priceUsd}
              title={card.title}
              zone={card.zoneName}
              rooms={card.rooms}
              areaM2={card.areaM2}
              publisherType={card.publisherType}
              photo={card.photo}
            />
          </li>
        ))}
        {seeAll ? (
          <li className={styles.item}>
            <a className={styles.plate} href={seeAll.href} data-testid="strip-plate">
              {seeAll.label}
            </a>
          </li>
        ) : null}
      </ol>
    </section>
  );
}
