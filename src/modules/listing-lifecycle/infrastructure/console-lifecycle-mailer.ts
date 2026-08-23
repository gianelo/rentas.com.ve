import type {
  LifecycleMailerPort,
  LifecycleMessage,
} from "../application/ports/lifecycle-mailer.port";

/**
 * El adaptador de correo que hay HOY, y no manda correo.
 *
 * **Está escrito así a propósito en vez de simulado como si funcionara.** La
 * tarea 7.11 pide una plantilla de Resend/React Email y el proyecto todavía no
 * tiene ni la dependencia ni la clave; un adaptador que devolviera `void` en
 * silencio dejaría al sistema entero pasando en verde mientras nadie recibe
 * nada, que es la peor forma de tener esto sin terminar.
 *
 * Lo que sí queda cerrado alrededor: el asunto y el cuerpo salen del dominio,
 * `job_run` cuenta los envíos, y el libro de reservas garantiza que cada
 * correo se intente una sola vez por ciclo. Cuando llegue Resend se reemplaza
 * esta clase y nada más — el caso de uso no la conoce.
 *
 * **Mientras esto siga acá, la purga de fotos no debería estar programada.**
 * 19.8 es explícito: lo que separa esta retención de un borrado silencioso es
 * el aviso, y sin proveedor de correo el aviso no llega.
 */
export class ConsoleLifecycleMailer implements LifecycleMailerPort {
  async send(message: LifecycleMessage): Promise<void> {
    console.warn(
      `[ciclo-de-vida] NO SE ENVIÓ ningún correo — falta el adaptador de Resend (7.11).\n` +
        `  para: ${message.to}\n  asunto: ${message.subject}`,
    );
  }
}
