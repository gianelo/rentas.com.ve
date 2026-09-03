import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AppLink } from "@/../components/atoms/AppLink";
import type { SearchPillProps } from "@/../components/molecules/SearchPill";
import { Nav } from "@/../components/organisms/Nav";
import { resolveNavAccount, resolveNavPublish } from "@/modules/identity/domain/nav-account";
import { nextAuthSessionPort } from "@/modules/identity/infrastructure/session-port";
import { boundedVocabularyOf } from "@/modules/listing-catalogue/domain/bounded-vocabulary";
import {
  HOME_SEARCH_PARAM,
  HOME_SEARCH_RESULTS_LABEL,
  homeSearchForm,
  noMatchMessage,
  resolveSearchDestination,
  type SearchDestination,
} from "@/modules/listing-catalogue/domain/search-destination";
import { DrizzleCatalogue } from "@/modules/listing-catalogue/infrastructure/drizzle-catalogue";
import { DrizzleSearchVocabulary } from "@/modules/listing-catalogue/infrastructure/drizzle-search-vocabulary";
import {
  buildHome,
  HOME_CITY_PARAM,
  homeCityChips,
  homeCollections,
  resolveHomeCity,
} from "@/modules/listing-discovery/domain/home-collections";
import { DrizzleActiveZones } from "@/modules/listing-discovery/infrastructure/drizzle-active-zones";
import { DrizzleHomeCollections } from "@/modules/listing-discovery/infrastructure/drizzle-home-collections";
import { DrizzleListingPhotos } from "@/modules/listing-discovery/infrastructure/drizzle-listing-photos";
import { readPhotoPublicBaseUrl } from "@/modules/listing-discovery/infrastructure/photo-public-base-url";
import { db } from "@/shared/db/client";
import { Container } from "../components/layout/Container";
import { ListingStrip } from "../components/molecules/ListingStrip";
import { readNavAccountFlags } from "./_lib/nav-account";
import styles from "./home.module.css";

export const metadata: Metadata = {
  title: "Alquileres de larga estancia en Venezuela — Rentas",
  description:
    "Alquileres de larga estancia en Distrito Capital y Maracaibo. Publicar y buscar es gratis, sin comisión.",
};

/**
 * **Se renderiza por petición, y hay que declararlo.** Cuando acá vivían los
 * resultados, el `searchParams` obligaba a Next a tratar esta ruta como
 * dinámica sin que nadie lo escribiera. El inicio volvió a recibir uno
 * —`?ciudad=`, el de las fichas de la F2— pero la declaración se queda igual:
 * sin ella Next intenta exportar la página en tiempo de compilación, y el
 * `build` corre contra una `DATABASE_URL` deliberadamente inalcanzable, así que
 * la compilación se cae en `listCities()`. Se descubrió compilando, no en
 * producción.
 *
 * Aparte de destrabar el build, es lo correcto: estas cuatro tiras cambian cada
 * vez que alguien publica, y una portada horneada en tiempo de compilación
 * mostraría el catálogo del día del despliegue hasta el siguiente.
 */
export const dynamic = "force-dynamic";

interface InicioProps {
  searchParams: Promise<Record<string, string | undefined>>;
}

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
 * se dibuja o desaparece, si lleva placa y qué número dice esa placa; qué
 * ciudad nombra `?ciudad=`, qué le pasa a las colecciones cuando hay una
 * elegida, cuál ficha está activa y a dónde lleva; qué dice la barra de
 * búsqueda, a dónde apunta y qué frase de conteo lleva cada tira: **todo** eso
 * vive en `listing-discovery/domain/home-collections.ts`, con su suelo de
 * cobertura del 90 % encima. Acá no hay un `.filter()`, ni un umbral, ni un
 * número escrito — esta página traduce una petición a cuatro llamadas y dibuja lo
 * que le devuelven.
 *
 * **El aislamiento de ciudad se cumple en el dominio y no acá.** Con una ciudad
 * elegida, las tres colecciones que quedan la llevan puesta, así que esta
 * página no tiene ningún lugar donde pudiera dejar entrar un aviso de la otra:
 * no filtra nada, sólo dibuja lo que el adaptador trajo con los criterios que
 * el dominio compuso.
 *
 * **Cuatro consultas en TRES tandas, y ninguna crece con el catálogo**: el
 * catálogo de ciudades y las zonas con avisos activos —juntas, en la misma
 * espera—, después las filas de todas las colecciones con el total de cada una,
 * y por último las portadas de todas las tarjetas de todas las tiras. Neon es
 * HTTP, así que lo que se paga es el viaje de red: una quinta ciudad agrega una
 * tira sin agregar un viaje, y la consulta que la 14.52 trae no agrega una
 * tanda porque no depende de nada.
 *
 * Con `?q=` hay una quinta, la del vocabulario del servidor, y va **antes** que
 * todas: cuando lo escrito nombra un solo lugar la respuesta es una redirección
 * y todo lo demás se descartaría sin dibujarse.
 *
 * Son tres tandas y no dos porque las colecciones dependen del catálogo: qué
 * tiras hay sale de las ciudades, así que esa lectura no puede ir en paralelo
 * con la que la usa. Las portadas tampoco: se piden por los ids que devuelve la
 * consulta anterior.
 *
 * **Sin sesión y sin JavaScript de cliente.** Es el camino de lectura del D13:
 * un rastreador ve exactamente lo mismo que un visitante, y la tira se arrastra
 * con `scroll-snap` del navegador y no con un carrusel embarcado.
 */
export default async function InicioPage({ searchParams }: InicioProps) {
  const query = await searchParams;

  // **El buscador, y el mecanismo entero pasa acá — en el servidor.** El
  // formulario es un `GET` que vuelve a esta misma dirección con `?q=`; el
  // dominio traduce lo escrito a filtros y dice a dónde lleva. Con un solo
  // lugar se redirige y nadie ve esta página; con varios se dibujan los
  // enlaces más abajo. Ninguna de las dos ramas necesita JavaScript (F14).
  //
  // Va ANTES del catálogo, del vocabulario acotado y de las dos consultas de
  // las tiras: en el camino de redirección todo eso se descarta, y son cuatro
  // viajes de red a Neon.
  const typed = (query[HOME_SEARCH_PARAM] ?? "").trim();
  let searched: SearchDestination | null = null;
  if (typed !== "") {
    const vocabulary = await new DrizzleSearchVocabulary(db).lookup(typed);
    searched = resolveSearchDestination(typed, vocabulary);
    // `redirect` lanza; tiene que quedar fuera de cualquier `try`.
    if (searched.kind === "route") redirect(searched.href);
  }

  // **Las dos lecturas que no dependen una de otra, en la misma espera.** El
  // catálogo decide qué tiras hay; las zonas con avisos son el vocabulario
  // acotado de la pastilla (14.52). Ninguna necesita a la otra, y Neon es HTTP:
  // con dos `await` seguidos el inicio pagaría un viaje entero de latencia de
  // más sin que nada se ponga rojo.
  //
  // **Un puerto de lectura al lado del que ya existe** (AGENTS.md §3), y no un
  // `HomeCollectionsPort` ensanchado: aquél contesta colecciones —cuatro tiras
  // con su total— y esto es otra pregunta. Va sin ciudad a propósito: en `/` no
  // hay ninguna elegida, y las dos del producto conviven en la misma lista con
  // su ámbito puesto por el dominio.
  const [cities, activeZones] = await Promise.all([
    new DrizzleCatalogue(db).listCities(),
    new DrizzleActiveZones(db).listActiveZones(),
  ]);

  // Qué ciudad nombra `?ciudad=maracaibo` lo traduce el dominio, contra el
  // catálogo. `null` es "ninguna", nunca la primera: una desconocida deja el
  // inicio completo en vez de dibujar una ficha marcada que nadie tocó.
  const selectedCity = resolveHomeCity(cities, query[HOME_CITY_PARAM]);

  // Qué colecciones existen lo decide el dominio, a partir del catálogo y de
  // la ciudad elegida. Sin ciudad son las cuatro tiras de la F1; con una, las
  // tres que quedan — y las tres atadas a ella, que es el aislamiento de
  // ciudad y no una consecuencia de que la tira de la otra haya desaparecido.
  const specs = homeCollections(cities, selectedCity?.id ?? null);

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

  // Qué pregunta la caja, cómo se llama su parámetro y a dónde vuelve, y cuál
  // ficha de ciudad está activa: son decisiones de producto y llegan resueltas.
  const searchForm = homeSearchForm(typed);
  const cityChips = homeCityChips(cities, selectedCity?.id ?? null);

  // **La sesión, y lo que cuesta.** Auth.js está en estrategia `database`, así
  // que una lectura CON cookie es un viaje a Postgres. **Sin cookie no cuesta
  // nada**: `@auth/core` corta en `if (!sessionToken) return response` antes de
  // llamar al adaptador, así que el visitante anónimo —que es casi todo el
  // tráfico de esta dirección— sigue pagando las mismas tres consultas de
  // siempre. Tampoco se pide la cartera del importador que `/mis-avisos`
  // consulta: la barra no la mira.
  //
  // No cambia el modo de render: esta página ya se sirve por petición
  // (`dynamic = "force-dynamic"`, arriba, con su propia razón escrita).
  const session = await nextAuthSessionPort.getSession();
  // **El viaje que la 14.56 agrega, y sólo para quien tiene sesión**: si esta
  // cuenta publicó algo se le pregunta a `listing` con un `EXISTS`. Sin cookie
  // no hay sesión y no hay consulta, que es casi todo el tráfico de esta
  // pantalla.
  const account = resolveNavAccount(session, await readNavAccountFlags(session));
  const publish = resolveNavPublish(account);

  // La pastilla del inicio es el estado "vacía" (14i): sin zona elegida el
  // filtro no existe como pieza — "sin búsqueda no hay nada que filtrar".
  //
  // **Se alimenta del MISMO `homeSearchForm` que el servidor traduce arriba**,
  // y ahí está todo el mecanismo: la pastilla es un `<form method="get">` que
  // vuelve acá con `?q=`, y `resolveSearchDestination` redirige. Escribir el
  // `action` o el `name` acá sería una segunda copia del contrato de la URL.
  const pill: SearchPillProps = {
    action: searchForm.action,
    name: searchForm.name,
    value: searchForm.value,
    placeholder: searchForm.label,
    submitLabel: searchForm.submitLabel,
    state: { kind: "empty" },
    // **El vocabulario acotado, que es lo que la 14.51 no pudo traer a la
    // portada** (14.52). Cuáles zonas entran y con qué campos viajan lo decide
    // el dominio: acá no hay un `.filter()` ni un `Record` compuesto a mano, que
    // es la regla permanente del fundador.
    //
    // El JavaScript ya está pago desde la 14.51 —el `Nav` importa la isla, +2,5
    // KB gzip en ocho rutas—, así que lo único nuevo que `/` paga son estos
    // datos en el marcado servido.
    suggestions: boundedVocabularyOf(cities, activeZones),
  };

  return (
    <>
      {/* **La misma barra que el resto del producto** (14a/14i), en lugar del
          encabezado propio que el inicio tenía. Ése dibujaba marca + caja +
          "Publicar" con su propio CSS: dos encabezados arrancan idénticos y se
          separan en el primer arreglo apurado, que es lo que `SearchFilters` y
          `ListingStrip` ya dejaron escrito.

          Acá no se decide nada: los tres estados de la barra y qué dice
          "Publicar" salen de `identity/domain/nav-account.ts`, y el estado de
          la pastilla de `listing-catalogue/domain/search-pill.ts`.

          `signInHref` va pelado a propósito: `app/(auth)/signin` vuelve a `/`
          cuando no hay `callbackUrl`, así que agregarlo sería escribir el
          destino que ya es el respaldo. */}
      <Nav account={account} publish={publish} pill={pill} signInHref="/signin" />

      {/* Las fichas de ciudad (F2). Enlaces y no controles: el camino de
          lectura no tiene JavaScript (D13), así que elegir una ciudad es
          navegar — y el estado queda en la URL, que se comparte y se marca.

          Acá no se decide nada: cuál está activa, a dónde lleva cada una y qué
          pasa con lo que ya estaba elegido salen de `homeCityChips`. */}
      {cityChips.length === 0 ? null : (
        <nav className={styles.cities} aria-label="Ciudades">
          <ul className={styles.chips}>
            {cityChips.map((chip) => (
              <li key={chip.cityId}>
                <AppLink
                  className={chip.selected ? styles.chipSelected : styles.chip}
                  href={chip.href}
                  // `true` y no `page`: la ficha activa es el elemento elegido
                  // del conjunto, pero su enlace **quita** la ciudad y por lo
                  // tanto no lleva a la página en la que estás. Anunciarla como
                  // "página actual" prometería lo contrario de lo que hace.
                  aria-current={chip.selected ? "true" : undefined}
                >
                  {chip.label}
                </AppLink>
              </li>
            ))}
          </ul>
        </nav>
      )}

      {/* Lo que el buscador contestó cuando no pudo elegir por su cuenta.

          **Cada opción es un par (filtro, valor), nunca una palabra.** `Centro`
          existe en Maracaibo y en Distrito Capital: ofrecer sólo «Centro»
          aplicaría el filtro de la ciudad equivocada y devolvería cero avisos
          sin que nadie entienda por qué. El `scope` lleva la ciudad adentro por
          eso, y quién lo compone es el dominio.

          Acá no se decide nada: cuántas opciones hay, en qué orden y a qué
          dirección lleva cada una salen de `resolveSearchDestination`. */}
      {searched === null ? null : (
        <Container>
          {searched.kind === "choices" ? (
            <nav className={styles.results} aria-label={HOME_SEARCH_RESULTS_LABEL}>
              <ul className={styles.options}>
                {searched.options.map((option) => (
                  <li key={option.href}>
                    <a className={styles.option} href={option.href}>
                      <span className={styles.optionLabel}>{option.label}</span>
                      <span className={styles.optionScope}>{option.scope}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          ) : (
            // El texto lo compone el dominio: es lo que el producto le contesta
            // a quien llega, no una cadena de maquetado. Y dice «no entendí»,
            // nunca «no hay avisos» — acá no se mira la oferta.
            <p className={styles.noMatch}>{noMatchMessage(typed)}</p>
          )}
        </Container>
      )}

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
            <AppLink className={styles.inviteAction} href="/publicar">
              Publicar un aviso
            </AppLink>
          </section>
        ) : (
          <div className={styles.strips}>
            {home.strips.map((strip) => (
              <ListingStrip
                key={strip.key}
                stripKey={strip.key}
                title={strip.title}
                subtitle={strip.subtitle}
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
