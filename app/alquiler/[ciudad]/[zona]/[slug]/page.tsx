import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { cache } from "react";
import { AppLink } from "@/../components/atoms/AppLink";
import { PublisherBadge } from "@/../components/atoms/PublisherBadge";
import { Container } from "@/../components/layout/Container";
import { DetailSplit } from "@/../components/layout/DetailSplit";
import { ReadingWidth } from "@/../components/layout/ReadingWidth";
import { ContactBlock } from "@/../components/molecules/ContactBlock";
import { DeclaredFeatures } from "@/../components/molecules/DeclaredFeatures";
import { ListingCard, ListingGrid } from "@/../components/molecules/ListingCard";
import { PhotoStrip } from "@/../components/molecules/PhotoStrip";
import { StatStrip } from "@/../components/molecules/StatStrip";
import { Nav } from "@/../components/organisms/Nav";
import { SignInDoor } from "@/../components/organisms/SignInDoor";
import { viewListingContact } from "@/modules/contact-reveal/application/view-listing-contact";
import {
  contactDoorFor,
  DOOR_QUERY_NAME,
  doorHrefFor,
} from "@/modules/contact-reveal/domain/sign-in-door";
import {
  DrizzleContactRevealEvents,
  DrizzleContactRevealMetrics,
  DrizzleRevealableListing,
} from "@/modules/contact-reveal/infrastructure/drizzle-contact-reveal";
import { resolveNavAccount, resolveNavPublish } from "@/modules/identity/domain/nav-account";
import { DrizzleContactVerificationEvidence } from "@/modules/identity/infrastructure/drizzle-verified-contact";
import { DrizzleCatalogue } from "@/modules/listing-catalogue/infrastructure/drizzle-catalogue";
import { suggestActiveListings } from "@/modules/listing-discovery/application/suggest-active-listings";
import { resolveListingAvailability } from "@/modules/listing-discovery/domain/listing-availability";
import { resolveListingRoute } from "@/modules/listing-discovery/domain/listing-detail-route";
import { buildListingGrid } from "@/modules/listing-discovery/domain/listing-grid";
import { photoUrl } from "@/modules/listing-discovery/domain/listing-photo-view";
import {
  buildListingStructuredData,
  resolveListingIndexing,
  serializeStructuredData,
} from "@/modules/listing-discovery/domain/listing-structured-data";
import { suggestionHeading } from "@/modules/listing-discovery/domain/listing-suggestions";
import { listingIdFromSlug } from "@/modules/listing-discovery/domain/listing-url";
import {
  RETURN_PARAM,
  resultsLink,
  withResultsOrigin,
} from "@/modules/listing-discovery/domain/return-to-results";
import { DrizzleListingDetail } from "@/modules/listing-discovery/infrastructure/drizzle-listing-detail";
import { DrizzleListingPhotos } from "@/modules/listing-discovery/infrastructure/drizzle-listing-photos";
import { readSiteBaseUrl } from "@/modules/listing-discovery/infrastructure/site-base-url";
import { DrizzleListingSearch } from "@/modules/listing-search/infrastructure/drizzle-listing-search";
import { db } from "@/shared/db/client";
import { shortSpanishDate } from "@/shared/format/spanish-date";
import { readSession, requestSessionPort } from "../../../../_lib/session";
import styles from "./ficha.module.css";
import { continueWithGoogle, revealListingContact } from "./reveal-actions";

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
  // **308 y no 307**, que es la pregunta que la 11.21 dejo abierta. Un 307 es
  // temporal: le pide al rastreador que CONSERVE la direccion vieja en el
  // indice, que es exactamente el problema que esta redireccion existe para
  // resolver -- un aviso con dos direcciones vivas reparte su autoridad entre
  // las dos. El 308 mueve el indice al camino canonico y lo deja ahi.
  if (route.kind === "redirect") permanentRedirect(route.to);

  // La misma ficha con el origen puesto. Es lo que la pantalla de entrar tiene
  // que devolver (F19): volver al aviso sin el origen deja el «← Resultados»
  // degradado al respaldo justo después de pedirle una cuenta a alguien.
  const listingHref = withResultsOrigin(listingPath, returnTo);

  // **A dónde vuelve una persona es una regla, y vive en el dominio.** El
  // destino y el texto salen juntos de ahí a propósito: sin origen no hay
  // vuelta que prometer, y una flecha «← Resultados» le mentiría a quien llegó
  // desde Google o desde el inicio.
  const back = resultsLink(returnTo, { cityName: detail.cityName, zoneName: detail.zoneName });

  // La misma ficha con la puerta abierta encima (15.8): un estado de la
  // dirección, así que sale en el HTML servido y se cierra volviendo acá.
  const doorHref = doorHrefFor(listingHref);

  // **Un solo reloj para toda la respuesta.** Leerlo dos veces dejaría al
  // cuerpo y al `<head>` mirando instantes distintos, que es exactamente la
  // contradicción que esta página venía teniendo por otro motivo.
  const now = new Date();

  // **Del reloj, no del rótulo** (11.23). Acá había un ternario que miraba sólo
  // `detail.status`, mientras `resolveListingIndexing` —a dos pantallas de
  // distancia, en el mismo render— ya leía las DOS condiciones. En la ventana
  // en que el trabajo diario todavía no corrió, el `<head>` pedía `noindex` por
  // vencido y el cuerpo ofrecía revelar el contacto. La regla vive en el
  // dominio, que es lo único que el piso del 90% alcanza.
  const availability = resolveListingAvailability(detail, now);

  // Los tres estados del bloque salen de acá, no de un `if` en esta página: si
  // quien mira ya reveló, el caso de uso lee el valor; si no, no lo lee — el
  // contacto no sale de Postgres para quien no lo reveló.
  const { contact, verificationNotice } = await viewListingContact(
    { listingId: detail.id, method: detail.contactMethod, availability },
    {
      // Memoizado por petición: la barra de arriba necesita la misma sesión, y
      // con estrategia `database` dos lecturas son dos viajes a Neon.
      sessionPort: requestSessionPort,
      listings: new DrizzleRevealableListing(db),
      reveals: new DrizzleContactRevealMetrics(db),
      // tasks.md 6.14 — el mensaje del inquilino, para que el enlace revelado
      // abra ya escrito y no con la plantilla genérica.
      messages: new DrizzleContactRevealEvents(db),
      // tasks.md 16.12 — «desde cuándo está verificado» sale de
      // `verified_contact`, con la consulta que la 19.9 dejó montada. Sólo se
      // paga en el render de quien ya reveló.
      verification: new DrizzleContactVerificationEvidence(db),
    },
  );

  // **Si hay puerta y qué dice lo decide el dominio**: el token lo escribe
  // cualquiera, y sobre un contacto ya revelado sería un muro delante de algo
  // que está abierto.
  const door = contactDoorFor(
    contact,
    { type: detail.publisherType, name: detail.publisherName },
    query[DOOR_QUERY_NAME],
  );

  // La barra del producto (14a). La sesión sale del MISMO puerto memoizado que
  // acaba de usar el bloque de contacto, así que esto no agrega una consulta:
  // dentro de una petición es la misma lectura. Y sin cookie no hubo ninguna.
  const session = await readSession();
  const account = resolveNavAccount(session);
  const publish = resolveNavPublish(account);

  // Se lee al servir y no al importar el módulo: `next build` evalúa el módulo
  // sin las variables del despliegue, y una lectura arriba del archivo
  // convierte una foto en un build roto.
  const photoBase = process.env.R2_BUCKET_PUBLIC_URL ?? "";

  // **Qué es esta página, dicho para una máquina** (11.14). El documento lo
  // arma el dominio: qué tipo de schema.org corresponde, qué se declara y qué
  // no es una regla, y esta página sólo la imprime. Recibe el aviso y las
  // fotos; el contacto no viaja acá ni podría — `detail` no lo trae.
  const structuredData = buildListingStructuredData(readSiteBaseUrl(), detail, now, {
    // Sin base pública las direcciones salen relativas, y el dominio las
    // descarta: una imagen relativa en un JSON-LD es una imagen rota declarada
    // como buena.
    images: photos.flatMap(({ keys }) => (keys.full ? [photoUrl(photoBase, keys.full)] : [])),
  });

  // **La otra mitad de la pantalla vencida** (11.8, 11.10, 11.11). El bloque de
  // contacto ya decía que venció y ya llevaba un enlace a la zona; lo que la
  // tarea pide —y lo que `design.md` llama la conversión que rescata al
  // visitante más valioso que el sitio recibe— son los avisos vivos dibujados
  // acá mismo. Un enlace a otra pantalla le pide un toque más justo a quien
  // acaba de encontrarse con un apartamento que ya no está.
  //
  // **Sólo en la rama vencida.** En la ficha activa —la más visitada del
  // sitio— esto no cuesta ni una consulta: la expresión no se evalúa.
  //
  // Qué se ofrece, hasta dónde se amplía y dónde para lo decide el caso de uso;
  // acá no hay ni un `if` de producto.
  const suggestions =
    availability === "expired"
      ? await suggestActiveListings(
          {
            listingId: detail.id,
            cityId: detail.cityId,
            cityName: detail.cityName,
            zoneId: detail.zoneId,
            zoneName: detail.zoneName,
          },
          { search: new DrizzleListingSearch(db), catalogue: new DrizzleCatalogue(db) },
        )
      : { scope: "none" as const, listings: [] };

  // Las portadas de las cuatro en UNA llamada, por la misma razón que la
  // cuadrícula de resultados: contra Neon, de a una son cuatro viajes HTTP.
  const suggestionCovers =
    suggestions.listings.length > 0
      ? await new DrizzleListingPhotos(db).coversFor(suggestions.listings.map((row) => row.id))
      : new Map();

  // La misma regla F9 que la cuadrícula de resultados: un aviso sin portada no
  // entra. Media tarjeta con un ícono roto encima de un aviso vencido es la
  // segunda mala noticia de la misma pantalla.
  const suggestionCards = buildListingGrid(suggestions.listings, suggestionCovers, photoBase);

  // El encabezado lo escribe el dominio porque tiene que decir el alcance real
  // de lo que hay debajo: ampliado a la ciudad, «Otros avisos en <zona>» sería
  // mentira encima de cuatro tarjetas de otra zona.
  const suggestionsTitle = suggestionHeading(suggestions.scope, {
    zoneName: detail.zoneName,
    cityName: detail.cityName,
  });

  return (
    <>
      {/* **El encabezado de la ficha, en la forma que fijan sus dos láminas**
          (RESUELTO por el fundador: "seguí el diseño, que fue lo que se decidió
          acá"). La 11 dibuja tres hijos a 1280 —`← Resultados` · `rentas` ·
          `Publicar gratis`—, o sea que la marca NO cede: se corre al centro. La
          10 dibuja dos a 360, sin marca, porque no caben tres. Las dos tienen
          razón: describen anchos distintos, y eso lo resuelve la hoja de
          estilos del `Nav`, no una segunda rama acá.

          **Sin pastilla**, que es lo otro que las dos láminas dicen: una ficha
          no es una búsqueda, y el slot del medio se lo lleva la marca. El tipo
          lo hace inexpresable — `NavProps` no admite `pill` junto con `back`.

          El destino y el texto de la vuelta llegan decididos por `resultsLink`:
          con origen dice «← Resultados», sin origen dice «Ver avisos en
          <zona>», y esa diferencia es la regla entera de la 16.9.

          `signInHref` vuelve a ESTA ficha, con el origen puesto (F19): pedirle
          una cuenta a alguien y devolverlo al inicio pierde el aviso que estaba
          mirando y la búsqueda que venía armando.

          Fuera del `<main>`, que es donde va el encabezado del sitio: dentro
          sería una cabecera de la región de contenido y no del documento. */}
      <Nav
        account={account}
        publish={publish}
        signInHref={`/signin?callbackUrl=${encodeURIComponent(listingHref)}`}
        back={{ href: back.href, label: back.label }}
      />

      <main className={styles.page}>
        {/* Adentro del cuerpo y no en `generateMetadata`: el `<head>` de Next no
          admite un script, y este documento describe lo que la página dibuja.
          Va escapado desde el dominio — la descripción la escribe quien
          publica, y un `</script>` en ese texto cerraría la etiqueta. */}
        <script
          type="application/ld+json"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: es la única forma de emitir JSON-LD, y `serializeStructuredData` escapa el `<` antes de llegar acá.
          dangerouslySetInnerHTML={{ __html: serializeStructuredData(structuredData) }}
        />
        <Container>
          <DetailSplit
            media={
              <>
                <div className={styles.gallery}>
                  <PhotoStrip
                    photos={photos}
                    publicBaseUrl={photoBase}
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
                  {/* La seña del paso 2 (18.7). Va pegada a la ubicación
                    porque es lo que la completa —«a dos calles de la plaza
                    Altamira»— y NO en el documento estructurado: emitirla ahí
                    la entregaría a un buscador como un dato de ubicación al
                    lado de la zona, que es indexar por texto libre justo lo
                    que se rechazó a Google Places para evitar.
                    Sin seña no hay párrafo: uno vacío se lee como un dato que
                    falta y no como uno que no existe. */}
                  {detail.reference ? <p className={styles.reference}>{detail.reference}</p> : null}
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
                    // **Ya no es un `null` escrito acá** (tasks.md 16.12). La
                    // frase la trae el caso de uso junto al contacto, así que
                    // esta página no puede volver a certificar —ni a callar—
                    // por su cuenta lo que `verified_contact` dice.
                    verificationNotice={verificationNotice}
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
                    doorHref={doorHref}
                  />
                </div>
              </>
            }
          />

          {/* **Las salidas de la ficha vencida** (11.8). No se dibuja nada
              cuando no hay nada: una ciudad sin avisos activos no ofrece los de
              la otra ciudad, y una cuadrícula vacía bajo un título sería peor
              que el silencio. Los dos lados de la condición vienen decididos —
              `suggestionsTitle` es `null` en el alcance `none`, y las tarjetas
              ya pasaron por la regla F9. */}
          {suggestionsTitle !== null && suggestionCards.length > 0 ? (
            <section className={styles.suggestions} aria-labelledby="sugerencias">
              <h2 className={styles.suggestionsTitle} id="sugerencias">
                {suggestionsTitle}
              </h2>
              <ListingGrid>
                {suggestionCards.map((card) => (
                  <li key={card.id}>
                    {/* La misma tarjeta que la búsqueda dibuja, y a propósito:
                        una segunda tarjeta «de sugerencia» arrancaría idéntica y
                        se separaría en el primer arreglo apurado. Y no lleva
                        contacto porque `GridCard` no tiene dónde llevarlo. */}
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
              </ListingGrid>
            </section>
          ) : null}

          <footer className={styles.footer}>
            {/* **Tenía destino y no llevaba a ningún lado** (tasks.md 8.7):
                `#reportar` era un ancla a una sección que esta página nunca
                dibujó, así que tocarlo no hacía nada — y `reportListing`,
                completo desde la Fase 8, no lo llamaba ninguna ruta. */}
            <AppLink className={styles.report} href={`${listingPath}/reportar`}>
              Reportar este aviso
            </AppLink>
            <span className={styles.meta}>
              ID {detail.id.slice(0, 8)} · vence {shortSpanishDate(detail.expiresAt)}
            </span>
          </footer>
        </Container>
      </main>

      {/* **Encima del aviso y no en su lugar** (15.8). Si hay puerta ya lo
          decidió `contactDoorFor`. */}
      {door !== null ? (
        <SignInDoor
          copy={door}
          stayHref={listingHref}
          callbackUrl={listingHref}
          signInAction={continueWithGoogle}
        />
      ) : null}
    </>
  );
}

const PROPERTY_LABEL = {
  apartamento: "Apartamento",
  casa: "Casa",
  quinta: "Quinta",
  anexo: "Anexo",
  habitacion: "Habitación",
} as const;

export async function generateMetadata({ params }: FichaProps): Promise<Metadata> {
  const { slug } = await params;
  const listingId = listingIdFromSlug(slug);
  if (!listingId) return {};

  const detail = await findDetail(listingId);
  if (!detail) return {};

  // **Qué se le pide a Google es una regla, y la decide el dominio** (11.9 y
  // 11.15): un aviso vencido y uno de contenido delgado salen del índice. Acá
  // no se vuelve a mirar el estado ni a medir la descripción — escrito dos
  // veces, se separa en el primer arreglo apurado.
  const indexing = resolveListingIndexing(detail, new Date());

  return {
    title: `${detail.title} — ${detail.zoneName}, ${detail.cityName}`,
    description: detail.description.slice(0, 155),
    // `undefined` cuando se indexa, igual que la página de zona: no emitir la
    // etiqueta es la respuesta por defecto, y `index: true` no dice nada más.
    robots: indexing.index ? undefined : { index: false, follow: indexing.follow },
  };
}
