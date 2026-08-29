import { type SignInDoor, safeSignInReturn, signInDoorOf } from "./safe-return-destination";

/**
 * **La pantalla de entrar, que es una página y no una hoja** (15.7, láminas
 * 8a/9a): tiene su propia dirección, y por eso es la única que sirve de destino
 * de vuelta desde Google y desde un cliente de correo.
 *
 * **Qué dice depende de por qué puerta se entró**, y eso es producto: la misma
 * ruta atiende `/publicar`, `/mis-avisos`, `/importar` y la vuelta a un aviso,
 * y prometerle los pasos de publicar a quien viene de `/mis-avisos` es copia
 * falsa — lo que esta tarea corrige. **La puerta la nombra `signInDoorOf`**,
 * que comparte lista con `safeSignInReturn`: no hay una segunda regla.
 */

export interface SignInWayOut {
  readonly href: string;
  readonly label: string;
}

export interface SignInPage {
  /** Dice para qué, no «Iniciar sesión» (nota de la lámina 8a). */
  readonly title: string;
  readonly reason: string;
  /** Vacío salvo en publicar: las otras puertas no recorren ese camino. */
  readonly steps: readonly string[];
  /** La nota al pie de los pasos (lámina 9a), o nada. */
  readonly aside: string | null;
  /** La promesa de la F19, sólo cuando hay un aviso al que volver. */
  readonly assurance: string | null;
  readonly legal: string;
  /** La salida visible: entrar nunca es obligatorio para mirar (F20). */
  readonly wayOut: SignInWayOut;
  /** Ya juzgado por `safeSignInReturn`. `null` es «sin destino», no «al inicio». */
  readonly returnTo: string | null;
}

/**
 * La misma frase que la hoja de la ficha (`contactDoorFor`), pineada por valor
 * en `sign-in-page.test.ts`: son dos formas de una sola puerta. La línea legal
 * va **sin enlaces** porque `/terminos` y `/privacidad` no existen, y un enlace
 * que contesta 404 es peor que una frase sin enlace (22.24).
 */
const ACCOUNT_REASON = "Pedimos la cuenta para frenar avisos falsos. Es gratis y es un toque.";
const RETURN_ASSURANCE = "Volvés a este mismo aviso al terminar.";
const LEGAL =
  "Al entrar aceptás los términos y la privacidad. Rentas no participa en el trato: no cobramos comisión, no retenemos pagos y no redactamos contratos.";
const LISTINGS_WAY_OUT: SignInWayOut = { href: "/", label: "← Volver a los avisos" };

type DoorCopy = Pick<SignInPage, "title" | "reason" | "steps" | "aside" | "assurance">;

const ACCOUNT_DOOR: DoorCopy = {
  title: "Entrá a tu cuenta",
  reason:
    "Con tu cuenta editás tus avisos, los renovás cuando vencen y los das de baja. Es gratis y no cobramos comisión.",
  steps: [],
  aside: null,
  assurance: null,
};

const DOORS: Record<SignInDoor, DoorCopy> = {
  "/publicar": {
    title: "Entrá para publicar tu propiedad",
    reason:
      "Publicar es gratis y no cobramos comisión. Necesitamos una cuenta para que puedas editar tu aviso y renovarlo cuando venza.",
    // Donde 8a y 9a difieren se toma la de 9a —«en tu navegador» y no «en tu
    // teléfono»— porque la copia sale del dominio y no puede cambiar con el
    // ancho, y «en tu teléfono» es falso en una computadora (ver 22.26).
    steps: [
      "Llenás los datos de la propiedad: zona, precio, habitaciones.",
      "Subís las fotos, que comprimimos en tu navegador antes de mandarlas.",
      "Verificás tu teléfono por WhatsApp y el aviso queda activo 30 días.",
    ],
    aside: "Si ya tenés cuenta, el mismo botón te lleva a tus publicaciones.",
    assurance: null,
  },
  "/alquiler/": {
    title: "Entrá y volvés a este aviso",
    reason: ACCOUNT_REASON,
    steps: [],
    aside: null,
    assurance: RETURN_ASSURANCE,
  },
  "/mis-avisos": ACCOUNT_DOOR,
  "/importar": ACCOUNT_DOOR,
};

/**
 * **Nunca devuelve `null`**: la pantalla siempre se dibuja, porque es una ruta
 * que alguien puede escribir. Lo que falla cerrado es el destino — el que
 * `safeSignInReturn` no admite deja `returnTo` en `null` y la puerta de
 * cuenta, en vez de reemitirse en un formulario que se ve nuestro.
 */
export function signInPageFor(raw: string | readonly string[] | undefined): SignInPage {
  const returnTo = safeSignInReturn(typeof raw === "string" ? raw : "");
  const door = returnTo === null ? null : signInDoorOf(returnTo);

  return {
    ...(door === null ? ACCOUNT_DOOR : DOORS[door]),
    legal: LEGAL,
    wayOut:
      door === "/alquiler/" && returnTo !== null
        ? { href: returnTo, label: "← Volver al aviso" }
        : LISTINGS_WAY_OUT,
    returnTo,
  };
}
