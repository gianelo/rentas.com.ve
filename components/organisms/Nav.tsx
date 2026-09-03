import {
  type NavAccount,
  type NavPublish,
  resolveAccountMenuItems,
} from "@/modules/identity/domain/nav-account";
import { AppLink } from "../atoms/AppLink";
import { PublisherBadge } from "../atoms/PublisherBadge";
import { SearchPill, type SearchPillProps } from "../molecules/SearchPill";
import { AccountMenu } from "./AccountMenu";
import styles from "./Nav.module.css";

/**
 * Una sola copia. SISTEMA.md lo fija —"no hay logotipo: la marca es la palabra
 * «rentas.»"— y con el punto; tres láminas lo exportan sin él y la de Sistema,
 * que es la que manda, lo escribe con punto nueve veces. Escrito dos veces acá,
 * una de las dos se retipea de memoria y queda «Rentas».
 */
const WORDMARK = "rentas.";

export interface NavBackAction {
  readonly href: string;
  /** El texto visible del enlace. Lo compone el dominio, flecha incluida. */
  readonly label: string;
}

interface NavCommon {
  /** Ya resuelto por quien la usa (`resolveNavAccount`) — acá no se decide nada. */
  readonly account: NavAccount;
  /** Ya resuelto por quien la usa (`resolveNavPublish`). */
  readonly publish: NavPublish;
  /** A dónde manda "Entrar" — incluye el `callbackUrl`, si aplica. */
  readonly signInHref: string;
}

/** El inicio, las dos pantallas de resultados y `/mis-avisos`. */
export interface NavWithSearch extends NavCommon {
  readonly pill: SearchPillProps;
  readonly back?: never;
  /**
   * **Inexpresable a propósito** (14.43). El publicador es un dato de UN aviso,
   * y estas cuatro pantallas no están mirando ninguno: una placa en la barra
   * del inicio sería la de nadie. Un opcional acá lo habría dejado pasar en
   * silencio.
   */
  readonly publisher?: never;
}

/**
 * Vuelta sin aviso: `/reportar`, que vuelve a la ficha que se está reportando.
 *
 * **El comentario que estaba acá decía «la ficha, y por ahora sólo ella», y era
 * falso desde que existe `/reportar`.** Lo destapó `tsc`, no una lectura: al
 * volver obligatorio el publicador, esa pantalla dejó de compilar.
 */
export interface NavWithReturn extends NavCommon {
  readonly back: NavBackAction;
  readonly pill?: never;
  /** `/reportar` no muestra ningún aviso: no tiene publicador que anunciar. */
  readonly publisher?: never;
}

/**
 * La ficha: vuelta **y** el publicador del aviso que está mostrando (14.43).
 *
 * **Una tercera forma de la unión, y la tarea lo había previsto bien.** El
 * primer intento puso `publisher` obligatorio en `NavWithReturn` con la razón
 * escrita de que «`back` tiene exactamente una pantalla»; `pnpm typecheck` lo
 * contradijo en la primera corrida —`/reportar` también vuelve— y por eso la
 * distinción es de forma y no de campo opcional.
 *
 * **Obligatorio acá, y no es celo**: la lámina de móvil dibuja ese encabezado
 * con dos hijos, `← Resultados` y la placa, así que una ficha sin publicador es
 * la mitad de la lámina. Y **fuera de acá es inexpresable**, que es lo que
 * responde la duda que la 14.43 dejó abierta: el publicador es un dato de UN
 * aviso, y la barra del inicio o la de `/reportar` no están mirando ninguno.
 */
export interface NavWithListing extends NavCommon {
  readonly back: NavBackAction;
  readonly publisher: "owner" | "broker";
  readonly pill?: never;
}

/**
 * **Dos formas, no cinco opcionales.** O hay pastilla en el centro, o hay un
 * enlace de vuelta en el primer slot y la marca se corre al medio; nunca las
 * dos, porque ninguna lámina dibuja las dos y el fundador lo cerró
 * explícitamente ("seguí el diseño, que fue lo que se decidió acá").
 *
 * `back` ya estuvo mal una vez y sólo lo destapó su primer llamador real. Con
 * las dos opcionales, una ficha con pastilla y una pantalla de resultados con
 * flecha de vuelta compilarían en silencio; así ninguna de las dos compila. Es
 * la misma forma que `ListingSearchPort` ya usa acá — "no hay `searchAll` ni
 * un valor comodín" — y lo que AGENTS.md §7 llama preferir la forma en la que
 * el modo de fallo es el rechazo.
 */
export type NavProps = NavWithSearch | NavWithReturn | NavWithListing;

/**
 * La navegación (tasks.md 20.4; diseño §14a — "tres estados").
 *
 * **Sesión y agencia dibujan la MISMA barra.** El único dato que distingue
 * una cuenta de agencia — `canImportListings` — no cambia una sola clase ni
 * un solo texto acá; sólo llega hasta el menú de cuenta (14b), que decide
 * por su cuenta si ofrece "Importar cartera". Esta pieza ni siquiera lo
 * mira: mismo `publish`, mismo control de cuenta, mismo marcado.
 *
 * **Dónde NO va este componente.** El flujo de publicar tiene su propio
 * cromo (Publicar - Especificacion.md §7: barra de progreso o riel de
 * pasos) y ningún artboard le pone un nav — un buscador en medio de un
 * embudo de nueve pasos es una salida justo donde menos conviene. Tampoco
 * `/renovar/[token]`, deliberadamente sin estilo.
 */
export function Nav({ account, publish, pill, signInHref, back, publisher }: NavProps) {
  const publishClass =
    publish.bar.emphasis === "accent" ? styles.publishAccent : styles.publishOutline;

  return (
    <header className={styles.bar}>
      <div className={styles.inner}>
        {back ? (
          // **El texto se dibuja, no se esconde detrás de un `aria-label`.**
          // `resultsLink` devuelve dos etiquetas para dos acciones distintas
          // —«← Resultados» cuando hay búsqueda a la que volver, «Ver avisos
          // en Chacao» cuando no la hay—, y su propio comentario dice que la
          // segunda "no dice volver". Un `←` pelado dibuja las dos iguales y
          // le promete una vuelta a quien llegó desde Google. La flecha, donde
          // corresponde, viene dentro de la etiqueta que compone el dominio.
          <AppLink className={styles.back} href={back.href}>
            {back.label}
          </AppLink>
        ) : (
          <AppLink className={styles.brand} href="/">
            {WORDMARK}
          </AppLink>
        )}

        {/* **La placa del publicador, y sólo en la ficha** (14.43; lámina
            `Rentas - Ficha - Mobile.dc.html`, líneas 93-95: el encabezado de 56
            px con `← Resultados` y la placa `Dueño`).

            **No se dibuja dos veces: se MUEVE.** La lámina de móvil la pone
            acá y la de escritorio en la columna de datos, y el mismo elemento
            cambia de sitio con el ancho. Como **el servidor no sabe el ancho de
            la pantalla** —no hay ancho en una petición HTTP, y husmear el
            `User-Agent` rompería una sola respuesta cacheable para todos los
            anchos—, la mudanza se resuelve en la hoja de estilos: ésta se
            esconde a partir de 768 px y la de la ficha aparece ahí. Es el mismo
            argumento que la 14.53 dejó escrito para las fichas quitables.

            Es el MISMO átomo, sin repintar: la garantía de la 14.25 —relleno
            contra borde, distinguible en escala de grises— es suya y sigue
            siéndolo. Acá no se decide nada: `publisherType` llega del aviso. */}
        {publisher ? (
          <span className={styles.publisher}>
            <PublisherBadge publisherType={publisher} />
          </span>
        ) : null}

        {pill ? (
          <div className={styles.pillCol}>
            <SearchPill {...pill} />
          </div>
        ) : (
          // **La ficha: la marca NO cede, se corre al centro** (lámina 11, el
          // encabezado de tres hijos `← Resultados · rentas · Publicar
          // gratis`). Que a 360 px no se vea lo resuelve la hoja de estilos y
          // no una segunda rama acá: la lámina 10 dibuja dos hijos porque no
          // caben tres, y "dónde cabe" es geometría, no una decisión distinta.
          //
          // Sigue siendo un enlace y no el `<span>` que la lámina exporta: el
          // `.dc.html` es una referencia, no código a copiar (AGENTS.md §2), y
          // una marca sin destino le quita a la ficha su único camino al
          // inicio.
          <AppLink className={`${styles.brand} ${styles.brandCentre}`} href="/">
            {WORDMARK}
          </AppLink>
        )}

        <div className={styles.actions}>
          <AppLink
            className={
              account.kind === "authenticated"
                ? `${publishClass} ${styles.publishAuth}`
                : publishClass
            }
            href="/publicar"
          >
            {publish.bar.label}
          </AppLink>

          {account.kind === "anonymous" ? (
            <AppLink className={styles.enter} href={signInHref}>
              Entrar
            </AppLink>
          ) : (
            <AccountMenu
              href="/mis-avisos"
              triggerLabel="Mis avisos"
              initials={account.initials}
              imageUrl={account.imageUrl}
              panelTitle={account.displayName}
              panelEmail={account.email}
              // Ya decididas (`resolveAccountMenuItems`). Escritas a mano acá,
              // «Importar cartera» era una fila que ningún dominio podía
              // encender: `canImportListings` se calculaba y no lo leía nadie.
              items={resolveAccountMenuItems(account, publish)}
            />
          )}
        </div>
      </div>
    </header>
  );
}
