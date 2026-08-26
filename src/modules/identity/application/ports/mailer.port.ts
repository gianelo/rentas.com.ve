/**
 * Por dónde sale el enlace mágico (tasks.md 15.2).
 *
 * **Decisión: `identity` tiene su propio puerto, no el de
 * `listing-lifecycle`.** `LifecycleMailerPort` existe y es estructuralmente
 * casi idéntico — `send({to, subject, body})` — pero importarlo desde acá
 * acoplaría dos capacidades por un accidente de forma: `identity` pasaría a
 * depender de un módulo que no le pertenece y cuyo puerto está pensado para
 * los avisos del ciclo de vida, no para un enlace de acceso.
 *
 * AGENTS.md ya deja el idioma escrito para el caso simétrico —lectura vs.
 * escritura—: «cuando necesites leer de una tabla cuyo puerto de escritura es
 * deliberadamente angosto, agregá un puerto de lectura al lado; no ensanches
 * el de escritura». Acá el eje es capacidad, no lectura/escritura, pero la
 * regla es la misma: no ensanchar un puerto ajeno para que sirva a un dueño
 * distinto. Un puerto propio, angosto, al lado.
 *
 * La duplicación de forma (`to`/`subject`/`body`) es el costo aceptado por
 * esa independencia: si algún día ambos módulos necesitan de verdad
 * compartir el mecanismo de envío, promoverlo a `src/shared/` es un
 * refactor mecánico. Deshacer el acoplamiento inverso —una vez que otro
 * módulo ya depende de él— no lo es.
 */
export interface MailMessage {
  readonly to: string;
  readonly subject: string;
  readonly body: string;
}

export interface MailerPort {
  send(message: MailMessage): Promise<void>;
}
