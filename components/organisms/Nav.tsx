import {
  type NavAccount,
  type NavPublish,
  resolveAccountMenuItems,
} from "@/modules/identity/domain/nav-account";
import { AppLink } from "../atoms/AppLink";
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

/**
 * **Una sola forma** (tasks.md 14.54). Tuvo tres —pastilla, vuelta y
 * publicador— y las dos últimas se fueron con la decisión del fundador:
 *
 * - **La vuelta se dibuja adentro del contenido**, no en la barra. La ficha era
 *   la única pantalla del camino de lectura que la tenía acá; las dos de
 *   resultados la dibujan como miga de pan desde siempre, y `/importar` y
 *   `/mis-avisos/[id]/editar` ponen su «← Mis avisos» arriba del contenido. El
 *   empujón de más: `resultsLink` compone «Ver avisos en Chacao» cuando no hay
 *   origen, veinte caracteres que no entran en una barra de 60 px.
 * - **La placa del publicador la dice la ficha adentro.**
 *   `ContactBlock` ya dibuja «publica como dueño / como inmobiliaria» al lado
 *   del nombre y del teléfono, que es donde el inquilino la lee justo antes de
 *   escribir. La 14.43 la había subido acá y esta tarea la revierte entera.
 *
 * `pill` queda opcional y sigue distinguiendo algo real: una ficha no es una
 * búsqueda, y ninguna de sus dos láminas dibuja la pastilla.
 */
export interface NavProps {
  /** Ya resuelto por quien la usa (`resolveNavAccount`) — acá no se decide nada. */
  readonly account: NavAccount;
  /** Ya resuelto por quien la usa (`resolveNavPublish`). */
  readonly publish: NavPublish;
  /** A dónde manda "Entrar" — incluye el `callbackUrl`, si aplica. */
  readonly signInHref: string;
  /** El inicio, las dos pantallas de resultados y `/mis-avisos`; la ficha no. */
  readonly pill?: SearchPillProps;
}

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
export function Nav({ account, publish, pill, signInHref }: NavProps) {
  const publishClass =
    publish.bar.emphasis === "accent" ? styles.publishAccent : styles.publishOutline;

  return (
    <header className={styles.bar}>
      <div className={styles.inner}>
        {/* **La marca, en el primer slot y una sola vez** (14.54). Había una
            segunda copia corrida al centro (`.brandCentre`) porque en la ficha
            el primer slot se lo llevaba `← Resultados`; sin la vuelta, esa
            segunda copia dibujaría «rentas.» dos veces en toda pantalla sin
            pastilla. Sigue siendo un enlace y no el `<span>` que la lámina
            exporta: el `.dc.html` es una referencia, no código a copiar
            (AGENTS.md §2), y una marca sin destino le quita a la ficha su
            camino al inicio. */}
        <AppLink className={styles.brand} href="/">
          {WORDMARK}
        </AppLink>

        {pill ? (
          <div className={styles.pillCol}>
            <SearchPill {...pill} />
          </div>
        ) : null}

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
              // **Ya decidido** (`resolveNavAccount` -> `hasListings`, 14.56):
              // acá no hay un `if` sobre datos, se pasa el estado tal cual.
              // Prometerle «Mis avisos» a quien no publicó ninguno lo manda a
              // una página vacía; el nombre accesible no se pierde, y el enlace
              // a `/mis-avisos` tampoco.
              triggerLabelVisible={account.hasListings}
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
