"use client";

import { useState } from "react";
import { AppLink } from "../atoms/AppLink";
import styles from "./AccountMenu.module.css";

export interface AccountMenuItem {
  readonly label: string;
  readonly href: string;
  readonly emphasis?: "accent";
}

export interface AccountMenuProps {
  /** El piso: a dónde lleva el control sin JavaScript (diseño 14a/14b). */
  readonly href: string;
  /** Lo que se lee en la barra — "Mis avisos", nunca el nombre de la cuenta. */
  readonly triggerLabel: string;
  readonly initials: string;
  readonly imageUrl: string | null;
  /** Lo que se lee dentro del panel, cuando lo hay. */
  readonly panelTitle: string;
  readonly panelEmail: string | null;
  readonly items: readonly AccountMenuItem[];
}

/**
 * El control de cuenta (diseño 14a) y su menú desplegable (14b) — "mejora,
 * no camino único".
 *
 * **El enlace es el mismo, siempre.** El servidor dibuja un ancla real hacia
 * `/mis-avisos`, y esta pieza NO lo reemplaza — le agrega un
 * `onClick` que, sólo cuando corre, cancela la navegación y abre el panel
 * en su lugar. Sin JavaScript, `onClick` nunca se adjunta (React nunca lo
 * serializa a un atributo HTML) y el `<a>` navega como cualquier otro: es
 * exactamente el mecanismo que `SearchBar` ya demuestra para el formulario
 * de búsqueda, aplicado acá a un enlace.
 *
 * **Todo lo que vive en el panel vive también en `/mis-avisos`** (14b) —
 * este componente no inventa una función que sólo exista con JavaScript
 * encendido; sólo ofrece un atajo.
 */
export function AccountMenu({
  href,
  triggerLabel,
  initials,
  imageUrl,
  panelTitle,
  panelEmail,
  items,
}: AccountMenuProps) {
  const [open, setOpen] = useState(false);

  return (
    <span className={styles.wrap}>
      <AppLink
        href={href}
        className={styles.trigger}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(event) => {
          event.preventDefault();
          setOpen((current) => !current);
        }}
      >
        <span className={styles.triggerLabel}>{triggerLabel}</span>
        {imageUrl ? (
          // biome-ignore lint/performance/noImgElement: dominio externo (Google), 30x30 fijo — hoy inalcanzable en producción (schema.ts, user.image queda NULL a propósito).
          <img className={styles.avatar} src={imageUrl} alt="" width={30} height={30} />
        ) : (
          <span className={styles.avatarInitials} aria-hidden="true">
            {initials}
          </span>
        )}
      </AppLink>

      {open ? (
        <div className={styles.panel} role="menu">
          <div className={styles.panelHeader}>
            <span className={styles.panelName}>{panelTitle}</span>
            {panelEmail ? <span className={styles.panelEmail}>{panelEmail}</span> : null}
          </div>
          {items.map((item) => (
            <AppLink
              key={item.href + item.label}
              className={item.emphasis === "accent" ? styles.itemAccent : styles.item}
              href={item.href}
              role="menuitem"
            >
              {item.label}
            </AppLink>
          ))}
        </div>
      ) : null}
    </span>
  );
}
