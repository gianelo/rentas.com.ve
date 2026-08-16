import type { ButtonHTMLAttributes } from "react";
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
