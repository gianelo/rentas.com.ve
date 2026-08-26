import type { NavAccount, NavPublish } from "@/modules/identity/domain/nav-account";
import { AppLink } from "../atoms/AppLink";
import { SearchPill, type SearchPillProps } from "../molecules/SearchPill";
import { AccountMenu } from "./AccountMenu";
import styles from "./Nav.module.css";

export interface NavBackAction {
  readonly href: string;
  /** El texto visible del enlace. Lo compone el dominio, flecha incluida. */
  readonly label: string;
}

export interface NavProps {
  /** Ya resuelto por quien la usa (`resolveNavAccount`) — acá no se decide nada. */
  readonly account: NavAccount;
  /** Ya resuelto por quien la usa (`resolveNavPublish`). */
  readonly publish: NavPublish;
  readonly pill: SearchPillProps;
  /** A dónde manda "Entrar" — incluye el `callbackUrl`, si aplica. */
  readonly signInHref: string;
  /**
   * Cuando está presente, reemplaza la marca por el enlace de vuelta (14.38:
   * "la marca cede su lugar al ← en la ficha, porque en una ficha volver vale
   * más que ir al inicio"). Lo usa la ficha, con lo que decide `resultsLink`.
   */
  readonly back?: NavBackAction;
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
export function Nav({ account, publish, pill, signInHref, back }: NavProps) {
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
            rentas.
          </AppLink>
        )}

        <div className={styles.pillCol}>
          <SearchPill {...pill} />
        </div>

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
              items={[
                ...(publish.menu
                  ? [{ label: publish.menu.label, href: "/publicar", emphasis: "accent" as const }]
                  : []),
                { label: "Mis avisos", href: "/mis-avisos" },
              ]}
            />
          )}
        </div>
      </div>
    </header>
  );
}
