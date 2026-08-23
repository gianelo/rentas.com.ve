import type { AnchorHTMLAttributes, ButtonHTMLAttributes } from "react";
import { AppLink } from "./AppLink";
import styles from "./Button.module.css";

type Props = ButtonHTMLAttributes<HTMLButtonElement>;

/**
 * Three distinct components, not variants of one component with a
 * free-form prop (tasks.md 1b.6, SISTEMA.md "Jerarquía de botones") — a
 * caller cannot pass an arbitrary `variant` and mix levels. They share an
 * unexported base implementation only as an internal implementation
 * detail; the public surface is three separate exports.
 */
export function ActionButton(props: Props) {
  return <button type="button" {...props} className={`${styles.base} ${styles.action}`} />;
}

export function SelectionButton(props: Props) {
  return <button type="button" {...props} className={`${styles.base} ${styles.selection}`} />;
}

export function NeutralButton(props: Props) {
  return <button type="button" {...props} className={`${styles.base} ${styles.neutral}`} />;
}

/**
 * El mismo nivel visual que `ActionButton`, pero es un enlace.
 *
 * **Un componente aparte y no una prop `as`**, por la misma razón por la que
 * los tres niveles son tres exports: una prop que cambia el elemento es una
 * prop que alguien puede pasar mal. Y la diferencia no es cosmética — un botón
 * hace algo, un enlace va a algún lado, y sin JavaScript un `<button>` no
 * navega. El bloque de contacto necesita ir a la pantalla de entrar, así que
 * necesita un enlace.
 */
export function ActionLink({
  href,
  ...rest
}: AnchorHTMLAttributes<HTMLAnchorElement> & { readonly href: string }) {
  // `href` pasa a ser obligatorio, y no es un requisito nuevo del tipo: un
  // enlace sin destino no navega a ninguna parte. `AppLink` lo necesita
  // presente para decidir si la ruta es nuestra —y por lo tanto si merece
  // navegación de cliente— o si abre otra aplicación.
  return <AppLink href={href} {...rest} className={`${styles.base} ${styles.action}`} />;
}
