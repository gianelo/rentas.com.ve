/**
 * Por dónde sale el mensaje de "Escribinos" (tasks.md 23.7).
 *
 * **Puerto propio, no el de `identity` ni el de `listing-lifecycle`** — la
 * misma decisión que `identity/application/ports/mailer.port.ts` ya
 * documenta para el caso simétrico: la forma es casi idéntica, pero
 * importar el puerto ajeno acoplaría `site-contact` a un módulo que no le
 * pertenece.
 *
 * **Sin `to`, y no es un descuido.** El destino de "Escribinos" es una
 * dirección de configuración fija (`CONTACT_MAIL_TO`), no un dato que cada
 * mensaje trae — a diferencia de `LifecycleMessage.to`, que sí varía correo
 * a correo porque cada aviso vencido tiene su propio dueño. Que el puerto no
 * tenga dónde poner un `to` es la garantía en el tipo: nada que implemente
 * esta interfaz puede reenviar el mensaje a otro lado que no sea el que la
 * infraestructura ya fijó al construirse.
 */
export interface ContactMessage {
  readonly subject: string;
  readonly body: string;
  readonly replyTo: string;
}

export interface ContactMailerPort {
  send(message: ContactMessage): Promise<void>;
}
