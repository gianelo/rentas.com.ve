import type { Metadata } from "next";
import { DrizzleCatalogue } from "@/modules/listing-catalogue/infrastructure/drizzle-catalogue";
import { buildHome, homeCollections } from "@/modules/listing-discovery/domain/home-collections";
import { DrizzleHomeCollections } from "@/modules/listing-discovery/infrastructure/drizzle-home-collections";
import { DrizzleListingPhotos } from "@/modules/listing-discovery/infrastructure/drizzle-listing-photos";
import { readPhotoPublicBaseUrl } from "@/modules/listing-discovery/infrastructure/photo-public-base-url";
import { db } from "@/shared/db/client";
import { Container } from "../components/layout/Container";
import { ListingStrip } from "../components/molecules/ListingStrip";
import styles from "./home.module.css";

export const metadata: Metadata = {
  title: "Alquileres de larga estancia en Venezuela — Rentas",
  description:
    "Alquileres de larga estancia en Distrito Capital y Maracaibo. Publicar y buscar es gratis, sin comisión.",
};

/**
 * **Se renderiza por petición, y hay que declararlo.** Cuando acá vivían los
 * resultados, el `searchParams` obligaba a Next a tratar esta ruta como
 * dinámica sin que nadie lo escribiera. El inicio no recibe ningún parámetro,
 * así que Next intenta exportarlo en tiempo de compilación — y el `build` corre
 * contra una `DATABASE_URL` deliberadamente inalcanzable, así que la compilación
 * se cae en `listCities()`. Se descubrió compilando, no en producción.
 *
 * Aparte de destrabar el build, es lo correcto: estas cuatro tiras cambian cada
 * vez que alguien publica, y una portada horneada en tiempo de compilación
 * mostraría el catálogo del día del despliegue hasta el siguiente.
 */
export const dynamic = "force-dynamic";

/**
 * El inicio (14.21), en `/`.
 *
 * **Esta página era los resultados de búsqueda, y ya no lo es.** El comentario
 * que estaba acá decía que no existía un inicio aparte "y eso es una decisión
 * antes que una omisión"; la 14.24 lo dejó falso al mover toda búsqueda a la
 * ruta de su lugar — `/alquiler/<ciudad>/<zona>` *es* la búsqueda de esa zona.
 * Con los resultados mudados, la dirección más fuerte del dominio quedó libre,
 * y la F1 dice qué va en ella: cuatro tiras de cinco avisos — recientes, una
 * por ciudad, y hasta $400.
 *
 * **Ni una regla de producto en este archivo, y es la regla permanente del
 * fundador.** Cuántas tiras hay, con qué criterio se arma cada una, si una tira
 * se dibuja o desaparece, si lleva placa y qué número dice esa placa: todo eso
 * vive en `listing-discovery/domain/home-collections.ts`, con su suelo de
 * cobertura del 90 % encima. Acá no hay un `.filter()`, ni un umbral, ni un
 * número escrito — esta página traduce una petición a dos llamadas y dibuja lo
 * que le devuelven.
 *
 * **Tres consultas, y ninguna crece con el catálogo**: el catálogo de ciudades,
 * las filas de todas las colecciones con el total de cada una, y las portadas de
 * todas las tarjetas de todas las tiras. Neon es HTTP, así que cada consulta es
 * un viaje de red — una quinta ciudad agrega una tira sin agregar un viaje.
 *
 * Son tres y no dos porque las colecciones dependen del catálogo: qué tiras hay
 * sale de las ciudades, así que esa lectura no puede ir en paralelo con la que
 * la usa. Las otras dos tampoco: las portadas se piden por los ids que devuelve
 * la consulta anterior.
 *
 * **Sin sesión y sin JavaScript de cliente.** Es el camino de lectura del D13:
 * un rastreador ve exactamente lo mismo que un visitante, y la tira se arrastra
 * con `scroll-snap` del navegador y no con un carrusel embarcado.
 */
export default async function InicioPage() {
  const cities = await new DrizzleCatalogue(db).listCities();

  // Qué colecciones existen lo decide el dominio, a partir del catálogo. Con
  // dos ciudades son las cuatro tiras de la F1; con tres, cinco.
  const specs = homeCollections(cities);

  const collections = await new DrizzleHomeCollections(db).collectionsFor(specs);

  // **UNA llamada para todas las portadas de todas las tiras.** Pedirlas por
  // tira serían cuatro viajes, y por aviso hasta veinte — el N+1 clásico
  // pagado en latencia real. La firma plural del puerto lo hace inexpresable.
  //
  // El `Set` es por la consulta y no por la pantalla: un aviso barato y
  // reciente aparece en tres colecciones (14.23) y ahí se queda, pero pedir su
  // portada tres veces sería pedirle a Postgres la misma fila tres veces.
  const listingIds = [
    ...new Set([...collections.values()].flatMap((page) => page.rows.map((row) => row.id))),
  ];
  const covers = await new DrizzleListingPhotos(db).coversFor(listingIds);

  const home = buildHome(specs, collections, covers, readPhotoPublicBaseUrl());

  return (
    <>
      {/* La barra que el producto entero comparte: la marca, y la única acción
          de la que depende todo el lado de la oferta. */}
      <header className={styles.bar}>
        <div className={styles.barInner}>
          <p className={styles.brand}>rentas.</p>
          <a className={styles.publish} href="/publicar">
            Publicar
          </a>
        </div>
      </header>

      <Container>
        {/* Un `<h1>` de verdad y visualmente oculto, igual que cuando acá
            vivían los resultados: la dirección más fuerte del dominio necesita
            un encabezado en el esquema del documento, y el diseño del inicio
            arranca directo con la primera tira. */}
        <h1 className={styles.srOnly}>Alquileres de larga estancia en Venezuela</h1>

        {home.invitesToPublish ? (
          // **Sin un solo aviso activo el problema no es la demanda, es la
          // oferta.** Una página que dijera "no hay resultados" le echaría la
          // culpa a quien llegó; ésta le ofrece lo único que hay para hacer.
          // Que este estado exista lo decidió el dominio, no esta línea.
          <section className={styles.invite}>
            <h2 className={styles.inviteTitle}>Todavía no hay avisos publicados</h2>
            <p className={styles.inviteText}>
              Publicar es gratis y no se cobra comisión. Tu aviso queda activo 30 días.
            </p>
            <a className={styles.inviteAction} href="/publicar">
              Publicar un aviso
            </a>
          </section>
        ) : (
          <div className={styles.strips}>
            {home.strips.map((strip) => (
              <ListingStrip
                key={strip.key}
                stripKey={strip.key}
                title={strip.title}
                cards={strip.cards}
                seeAll={strip.seeAll}
              />
            ))}
          </div>
        )}
      </Container>
    </>
  );
}
