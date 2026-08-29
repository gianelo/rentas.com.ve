import { AppLink } from "../../../components/atoms/AppLink";
import { Container } from "../../../components/layout/Container";
import type { SignInWayOut } from "../../../src/modules/identity/domain/sign-in-page";
import styles from "./signin.module.css";

/**
 * La barra de las cuatro láminas de entrar: la marca y **una salida visible**.
 *
 * **Una pieza y no dos copias** porque la puerta (8a/9a) y la espera (8c/9c)
 * la dibujan igual y sólo cambia a dónde lleva la salida — «← Volver a los
 * avisos», «← Volver al aviso» o «← Cambiar de correo». Qué dice y a dónde va
 * lo deciden `signInPageFor` y `magicLinkWaitFor`; acá no se elige nada.
 *
 * En el teléfono la salida va a la izquierda y la marca al centro; en
 * escritorio se invierte. Eso es una cuadrícula de tres columnas y un `order`,
 * no dos marcados (ver `signin.module.css`).
 */
export function DoorBar({ wayOut }: { readonly wayOut: SignInWayOut }) {
  return (
    <header className={styles.bar}>
      <Container>
        <div className={styles.barInner}>
          <AppLink className={styles.brand} href="/">
            rentas.
          </AppLink>
          <AppLink className={styles.back} href={wayOut.href}>
            {wayOut.label}
          </AppLink>
        </div>
      </Container>
    </header>
  );
}
