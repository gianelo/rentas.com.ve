import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ActionButton, NeutralButton } from "../../../../components/atoms/buttons";
import { Container } from "../../../../components/layout/Container";
import {
  magicLinkTicketOf,
  magicLinkWaitFor,
} from "../../../../src/modules/identity/domain/magic-link-request";
import {
  SIGN_IN_FALLBACK,
  SIGN_IN_POLL_PATH,
  safeSignInReturn,
} from "../../../../src/modules/identity/domain/safe-return-destination";
import { signIn } from "../../../../src/modules/identity/infrastructure/auth";
import { requestMagicLink } from "../actions";
import { DoorBar } from "../DoorBar";
import { TICKET_COOKIE } from "../enlace";
import styles from "./espera.module.css";

export const metadata: Metadata = {
  title: "Revisá tu correo — Rentas",
};

/**
 * **La pantalla que el enlace por correo obliga a tener** (F18, 15.9, láminas
 * 8c/9c): entre pedir el enlace y volver, la persona sale del sitio. Sin una
 * pantalla que lo explique, parece que se rompió.
 *
 * **Acá no se decide nada.** Qué dice, cuánto falta para reenviar y a dónde se
 * sale lo contesta `magicLinkWaitFor`. Esta función lee el comprobante, mira el
 * reloj una vez y dibuja.
 *
 * **La cuenta regresiva la calcula el servidor, que es quien sabe cuándo salió
 * el enlace.** Con el script apagado el número es una foto del instante en que
 * se sirvió la página: no se mueve solo, y eso es todo lo que se pierde.
 *
 * **El sondeo (15.12/15.14) es una mejora y nunca el mecanismo.** Va en línea
 * —veinte líneas, sin React y sin peso en el paquete de las pantallas que
 * importan— y lo único que hace es descubrir un aviso que ya salió servido.
 * Cada cuánto pregunta, hasta cuándo y qué dice el aviso salen de
 * `magicLinkWaitFor`: acá no se decide nada, tampoco del lado del navegador.
 * Sin JavaScript la pantalla queda exactamente como estaba.
 *
 * **Sin `"use client"` y sin la marca de Google**, igual que las otras dos
 * puertas: los dos controles son formularios con Server Action, y el disco de
 * cuatro colores sería el tercer SVG del sistema (22.20). El sobre sí se
 * dibuja, porque `✉` es un carácter de texto y eso el sistema lo admite.
 */
export default async function VerifyRequestPage() {
  const store = await cookies();
  const ticket = magicLinkTicketOf(store.get(TICKET_COOKIE)?.value);

  // **Falla cerrado** (§7): la dirección tecleada sólo vive en el comprobante,
  // así que sin él no hay nada que mostrar. Es también lo que le pasa a quien
  // llegue por la redirección de `pages.verifyRequest` sin haber pasado por el
  // formulario — vuelve a la puerta en vez de ver una espera vacía en inglés.
  if (ticket === null) redirect(SIGN_IN_FALLBACK);

  const wait = magicLinkWaitFor({ ticket, nowMs: Date.now() });

  async function continueWithGoogle(formData: FormData) {
    "use server";
    // El destino llega en un campo y se vuelve a juzgar acá, igual que en la
    // hoja de la ficha: un formulario es entrada de quien envía.
    const back = safeSignInReturn(String(formData.get("callbackUrl") ?? ""));
    await signIn("google", { redirectTo: back ?? "/" });
  }

  return (
    <div className={styles.screen}>
      <DoorBar wayOut={wait.wayOut} />

      <main>
        <Container>
          <div className={styles.column} data-testid="espera-columna">
            <span className={styles.mark} aria-hidden="true">
              ✉
            </span>
            <h1 className={styles.title}>{wait.title}</h1>
            <p className={styles.lead}>
              {wait.leadBefore}
              <b className={styles.address}>{wait.address}</b>
              {wait.leadAfter}
            </p>

            <section className={styles.troubles}>
              <h2 className={styles.troublesTitle}>{wait.troublesTitle}</h2>
              <ul className={styles.troubleList}>
                {wait.troubles.map((trouble) => (
                  <li key={trouble}>{trouble}</li>
                ))}
              </ul>
            </section>

            {/* **Servido y escondido, no inyectado.** El texto sale del
                dominio y viaja en el HTML; el guion sólo le quita el `hidden`.
                Escribirlo desde el guion metería copia de producto en el
                frente, que es la regla permanente del fundador. */}
            <p className={styles.entered} data-testid="espera-entro" role="status" hidden>
              {wait.signedInNotice}
            </p>

            <div className={styles.actions} data-testid="espera-acciones">
              {wait.resend.allowed ? (
                <form action={requestMagicLink}>
                  {/* La dirección y el destino vuelven a viajar por el
                      formulario, y la acción los vuelve a juzgar los dos. */}
                  <input type="hidden" name="correo" value={wait.address} />
                  <input type="hidden" name="callbackUrl" value={wait.returnTo ?? ""} />
                  <ActionButton type="submit">{wait.resend.label}</ActionButton>
                </form>
              ) : (
                /* **No es un botón muerto: es la cuenta** (nota de la 8c,
                   «reenviar con cuenta regresiva, no deshabilitado sin
                   explicación»). Mientras la ventana corre no hay nada que
                   apretar, y el número dice cuándo lo habrá. La negativa no
                   vive en este marcado: `magicLinkRequestFor` rechaza el mismo
                   POST aunque alguien lo arme sin pantalla. */
                <span className={styles.waiting}>{wait.resend.label}</span>
              )}

              <form action={continueWithGoogle}>
                <input type="hidden" name="callbackUrl" value={wait.returnTo ?? ""} />
                <NeutralButton type="submit">{wait.googleLabel}</NeutralButton>
              </form>
            </div>
          </div>
        </Container>
      </main>

      {wait.poll === null ? null : (
        <script
          // biome-ignore lint/security/noDangerouslySetInnerHtml: el guion va en línea a propósito — así no pesa en el paquete de las pantallas del camino de lectura — y su contenido lo arma este servidor, sin un solo dato de quien pide.
          dangerouslySetInnerHTML={{
            __html: guionDelSondeo(wait.poll.everySeconds, wait.poll.forSeconds),
          }}
        />
      )}
    </div>
  );
}

/**
 * El sondeo, en el navegador. **Ninguna regla acá**: cada cuánto, hasta cuándo
 * y qué se lee los decidió el dominio; esto pregunta y descubre un párrafo.
 *
 * Se detiene solo en tres casos —se acabó la vida del enlace, el servidor no
 * contestó (204: sin comprobante no hay nada que saber) o la red falló—, así
 * que una pestaña olvidada no queda preguntando para siempre.
 */
function guionDelSondeo(everySeconds: number, forSeconds: number): string {
  return `(function(){
var a=document.querySelector('[data-testid="espera-entro"]');
if(!a||!window.fetch)return;
var fin=Date.now()+${forSeconds * 1000};
var t=setInterval(function(){
if(Date.now()>fin){clearInterval(t);return;}
fetch(${JSON.stringify(SIGN_IN_POLL_PATH)},{headers:{accept:'application/json'}}).then(function(r){
return r.status===200?r.json():null;
}).then(function(d){
if(d===null){clearInterval(t);return;}
if(d.entro){clearInterval(t);a.hidden=false;}
}).catch(function(){clearInterval(t);});
},${everySeconds * 1000});
})();`;
}
