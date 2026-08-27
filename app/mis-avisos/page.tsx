import type { Metadata } from "next";
import { AppLink } from "../../components/atoms/AppLink";
import { Price } from "../../components/atoms/Price";
import { Container } from "../../components/layout/Container";
import type { SearchPillProps } from "../../components/molecules/SearchPill";
import { Nav } from "../../components/organisms/Nav";
import { DrizzleBulkImportAccounts } from "../../src/modules/broker-bulk-import/infrastructure/drizzle-bulk-import-account";
import {
  resolveNavAccount,
  resolveNavPublish,
} from "../../src/modules/identity/domain/nav-account";
import { nextAuthSessionPort } from "../../src/modules/identity/infrastructure/session-port";
import { homeSearchForm } from "../../src/modules/listing-catalogue/domain/search-destination";
import { listPublisherListings } from "../../src/modules/listing-publication/application/list-publisher-listings";
import type {
  PublisherListingCard,
  PublisherListingChip,
} from "../../src/modules/listing-publication/domain/publisher-listing-board";
import { DrizzlePublisherListings } from "../../src/modules/listing-publication/infrastructure/drizzle-publisher-listings";
import { db } from "../../src/shared/db/client";
import { requireSession } from "../_lib/require-session";
import { importRowReasonText } from "../importar/import-copy";
import { activarBorrador } from "./actions";
import { FotosDelBorrador } from "./FotosDelBorrador";
import styles from "./mis-avisos.module.css";

export const metadata: Metadata = {
  title: "Mis avisos — Rentas",
};

// La sesión se lee en cada pedido: quién está adentro, cuántos avisos tiene y
// si su cuenta importa cartera no puede quedar horneado en tiempo de
// compilación.
export const dynamic = "force-dynamic";

/**
 * `/mis-avisos` — láminas 14c y 14d (tasks.md 20.9 y 9.28).
 *
 * **Lo que esta porción cierra.** La pantalla existía como carcasa desde la
 * 20.9 y su propio comentario decía por qué: «la lista real de avisos
 * necesita una consulta que todavía no existe». Con esa consulta
 * (`PublisherListingsPort`) llegan además las dos llamadas que faltaban:
 * `attachPhotoToDraft` y `activateListing` llevaban una porción entera
 * probados sin que ninguna ruta los llamara, así que una inmobiliaria podía
 * importar cincuenta avisos y quedaban invisibles para siempre. Es lo que
 * convierte «se crearon 38 y ninguna se ve» en un camino que se puede
 * recorrer.
 *
 * **Acá no se decide nada** (AGENTS.md §1). Qué estado tiene cada aviso,
 * cuáles van arriba, cuántos hay de cada clase y cuántos esperan fotos lo
 * contesta `publisher-listing-board.ts`, bajo el piso de 90%; si un borrador
 * PUEDE activarse lo contesta `activateListing` cuando alguien lo pide, y
 * esta pantalla dibuja su respuesta. Ningún `if` de este archivo mira
 * `photoCount` para decidir un permiso.
 *
 * **La pastilla va vacía, por contrato** (diseño 14i: "sin búsqueda no hay
 * nada que filtrar. Es el estado de /mis-avisos e importar").
 */
export default async function MisAvisosPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | undefined>>;
}) {
  const [session, query] = await Promise.all([requireSession("/mis-avisos"), searchParams]);

  const [bulkImportAccount, board] = await Promise.all([
    new DrizzleBulkImportAccounts(db).findAccount(session.userId),
    listPublisherListings(
      { filter: query.estado },
      { sessionPort: nextAuthSessionPort, listings: new DrizzlePublisherListings(db) },
    ),
  ]);

  const account = resolveNavAccount(
    { name: session.name, email: session.email },
    bulkImportAccount ? { bulkImportEnabled: bulkImportAccount.bulkImportEnabled } : undefined,
  );
  const publish = resolveNavPublish(account);

  const form = homeSearchForm();
  const pill: SearchPillProps = {
    action: form.action,
    name: form.name,
    value: form.value,
    placeholder: form.label,
    submitLabel: form.submitLabel,
    state: { kind: "empty" },
  };

  const fallo = query.fallo ?? null;
  const motivos = (query.motivos ?? "").split(",").filter((motivo) => motivo !== "");

  return (
    <>
      <Nav
        account={account}
        publish={publish}
        pill={pill}
        signInHref="/signin?callbackUrl=%2Fmis-avisos"
      />
      <main>
        <Container>
          <h1 className={styles.titulo}>Mis avisos</h1>
          {/* «88 en total · 38 no se ven todavía» — el encabezado de 14d.
              Los dos números salen del dominio. */}
          <p className={styles.resumen}>
            {board.total} en total · {board.draftsAwaitingPhotos} no se ven todavía
          </p>

          {/*
            **«Importar vive acá, no en la navegación global»** — la anotación
            al pie de la lámina 14d. El menú de cuenta (14b) también la
            ofrece, pero ese panel sólo existe con JavaScript y su propia
            lámina aclara que "nada vive solo en el menú".

            La decisión ya viene tomada (`resolveNavAccount` ->
            `canImportListings`, con el piso de 90% encima).
          */}
          {account.kind === "authenticated" && account.canImportListings ? (
            <p className={styles.importar}>
              <AppLink href="/importar">Importar cartera</AppLink>
            </p>
          ) : null}

          {board.total === 0 ? (
            <p className={styles.vacio}>
              Todavía no publicaste ningún aviso. Cuando publiques uno —o importes tu cartera— lo
              vas a ver acá.
            </p>
          ) : (
            <>
              <Fichas chips={board.chips} activo={query.estado} />
              <ul className={styles.lista}>
                {board.cards.map((card) => (
                  <FichaDeAviso
                    key={card.id}
                    card={card}
                    motivos={fallo === card.id ? motivos : []}
                  />
                ))}
              </ul>
            </>
          )}
        </Container>
      </main>
    </>
  );
}

/**
 * Las seis fichas de 14d. **Enlaces, nunca botones**: son direcciones, tienen
 * que poder abrirse en otra pestaña y funcionar con el script apagado — la
 * misma razón que `FilterChips` ya documenta para las suyas.
 */
function Fichas({
  chips,
  activo,
}: {
  readonly chips: readonly PublisherListingChip[];
  readonly activo: string | undefined;
}) {
  return (
    <ul className={styles.fichas} aria-label="Filtrar por estado">
      {chips.map((chip) => (
        <li key={chip.filter}>
          <AppLink
            className={styles.ficha}
            href={chip.filter === "todos" ? "/mis-avisos" : `/mis-avisos?estado=${chip.filter}`}
            aria-current={
              (activo ?? "todos") === chip.filter ||
              (activo === undefined && chip.filter === "todos")
                ? "page"
                : undefined
            }
          >
            {chip.label} <span className={styles.fichaCuenta}>{chip.count}</span>
          </AppLink>
        </li>
      ))}
    </ul>
  );
}

/**
 * La frase de estado de cada ficha, tal como 14c y 14d las escriben. **Copia,
 * no regla**: el estado ya lo decidió el dominio; acá sólo se pone en
 * castellano, que es el mismo reparto que `app/publicar/violation-copy.ts`
 * establece para el formulario de publicar.
 */
function etiquetaDeEstado(card: PublisherListingCard): string {
  switch (card.state) {
    case "draft":
      return card.photoCount === 0 ? "Borrador · faltan fotos" : "Borrador";
    case "expiringSoon":
      return `Vence en ${plural(card.daysToExpiry ?? 0)}`;
    case "hidden":
      return "Oculta por reportes";
    case "expired":
      return `Vencida el ${fecha(card.expiresAt)}`;
    default:
      return `Activa · vence en ${plural(card.daysToExpiry ?? 0)}`;
  }
}

function plural(days: number): string {
  return days === 1 ? "1 día" : `${days} días`;
}

/** Igual que `lifecycle-notice.ts`: sin abreviar, y en UTC para no mentir. */
function fecha(date: Date): string {
  return new Intl.DateTimeFormat("es-VE", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(date);
}

function FichaDeAviso({
  card,
  motivos,
}: {
  readonly card: PublisherListingCard;
  readonly motivos: readonly string[];
}) {
  return (
    <li className={styles.aviso} data-estado={card.state}>
      {/* Sin miniatura para un borrador: «borrador es el quinto estado: borde
          punteado y marcador de foto punteado, sin color» (14d, al pie). */}
      <div className={styles.miniatura} aria-hidden="true">
        {card.photoCount === 0 ? <span className={styles.sinFotos}>sin fotos</span> : null}
      </div>
      <div className={styles.cuerpo}>
        <Price usd={card.priceUsd} />
        <h2 className={styles.avisoTitulo}>{card.title}</h2>
        <p className={styles.meta}>
          {card.zoneName} · {card.rooms} hab · {card.areaM2} m²
          {card.externalReference === null ? null : ` · ref. ${card.externalReference}`}
        </p>
        <p className={styles.estado}>{etiquetaDeEstado(card)}</p>

        {card.state === "draft" ? (
          <>
            <FotosDelBorrador listingId={card.id} photoCount={card.photoCount} />
            {/*
              **El disparador que faltaba.** Un `<form>` de verdad: sin
              JavaScript también activa. La pantalla no comprueba si el
              borrador tiene fotos — `activateListing` re-valida las veinte
              reglas en etapa `"activation"` y contesta, y su respuesta es lo
              que se dibuja debajo.
            */}
            <form action={activarBorrador} className={styles.activar}>
              <input type="hidden" name="listingId" value={card.id} />
              <button type="submit" className={styles.activarBoton}>
                Activar
              </button>
            </form>
          </>
        ) : null}

        {motivos.length === 0 ? null : (
          <p className={styles.negativa} role="alert">
            No se pudo activar: {motivos.map((motivo) => importRowReasonText(motivo)).join(" · ")}
          </p>
        )}
      </div>
    </li>
  );
}
