import type { ContactDoorCopy } from "@/modules/contact-reveal/domain/sign-in-door";
import { AppLink } from "../atoms/AppLink";
import { ActionButton, NeutralButton } from "../atoms/buttons";
import { GoogleMark } from "../atoms/icons";
import { Label } from "../atoms/Label";
import styles from "./SignInDoor.module.css";

export interface SignInDoorProps {
  /** Ya resuelta por `contactDoorFor` — acá no se decide nada. */
  readonly copy: ContactDoorCopy;
  /** La salida: esta misma ficha sin el parámetro que abrió la puerta. */
  readonly stayHref: string;
  /** A dónde vuelve quien entra. Lo juzga `safeSignInReturn` al volver. */
  readonly callbackUrl: string;
  readonly signInAction: (formData: FormData) => Promise<void>;
  /** tasks.md 22.28 — la misma acción que la puerta de página ya usa. */
  readonly requestMagicLinkAction: (formData: FormData) => Promise<void>;
}

/**
 * La puerta que pide la cuenta **sin sacar al inquilino del aviso** (láminas 8b
 * y 9b, tasks.md 15.8, 22.28).
 *
 * **Sin `"use client"`, y ahí está todo**: la abre y la cierra la dirección, así
 * que sale entera en el HTML servido y las dos salidas son anclas de verdad.
 *
 * **`role="dialog"` sin `aria-modal`** no es un olvido: sin script no hay trampa
 * de foco, y afirmar lo contrario sería un dato falso en el árbol de
 * accesibilidad.
 */
export function SignInDoor({
  copy,
  stayHref,
  callbackUrl,
  signInAction,
  requestMagicLinkAction,
}: SignInDoorProps) {
  return (
    <div className={styles.door} data-testid="puerta" role="dialog" aria-labelledby="puerta-titulo">
      <div className={styles.veil} aria-hidden="true" />
      <section className={styles.panel} data-testid="puerta-panel">
        <div className={styles.head}>
          <h2 className={styles.title} id="puerta-titulo">
            {copy.title}
          </h2>
          <AppLink className={styles.close} href={stayHref} aria-label={copy.closeLabel}>
            <span aria-hidden="true">×</span>
          </AppLink>
        </div>
        <p className={styles.reason}>{copy.reason}</p>
        {/* tasks.md 22.39 — sólo cuando `isListingContactVerified` ya
            contestó que sí: sin fila viva no hay nada que afirmar, el mismo
            default en falso que el resto de este módulo usa. */}
        {copy.verifiedNotice ? (
          <p className={styles.verified} data-testid="puerta-verificado">
            {copy.verifiedNotice}
          </p>
        ) : null}
        <form className={styles.form} action={signInAction}>
          <input type="hidden" name="callbackUrl" value={callbackUrl} />
          {/* Nivel 3 y con la marca (tasks.md 22.20): igual que la puerta de
              página, no el nivel 1 que la 15.8 shipeó sin el logo. */}
          <NeutralButton type="submit">
            <GoogleMark />
            Continuar con Google
          </NeutralButton>
        </form>
        <p className={styles.separator}>
          <span>{copy.email.separator}</span>
        </p>
        <form className={styles.emailForm} action={requestMagicLinkAction}>
          <input type="hidden" name="callbackUrl" value={callbackUrl} />
          <Label htmlFor="puerta-correo">{copy.email.label}</Label>
          <div className={styles.emailRow}>
            <input
              autoComplete="email"
              className={styles.field}
              id="puerta-correo"
              name="correo"
              placeholder={copy.email.placeholder}
              required
              type="email"
            />
            <ActionButton type="submit">{copy.email.submit}</ActionButton>
          </div>
          <p className={styles.emailNote}>{copy.email.note}</p>
        </form>
        <AppLink className={styles.stay} href={stayHref}>
          {copy.stayLabel}
        </AppLink>
        <p className={styles.assurance}>{copy.assurance}</p>
      </section>
    </div>
  );
}
