/**
 * Por dónde salen los dos correos del ciclo de vida (tasks.md 7.11).
 *
 * El puerto no sabe de plantillas ni de HTML: recibe un asunto y un cuerpo que
 * `composeNotice` ya compuso en el dominio. Un puerto que recibiera «el aviso
 * y el tipo de correo» pondría la redacción del lado del proveedor, y cambiar
 * de Resend a otra cosa se llevaría el texto puesto.
 *
 * `send` puede fallar y el caso de uso lo espera: cuenta la falla, devuelve la
 * reserva del libro y sigue con el resto de la tanda. Un correo caído no puede
 * dejar sin avisar a los otros doscientos.
 */
export interface LifecycleMessage {
  readonly to: string;
  readonly subject: string;
  readonly body: string;
}

export interface LifecycleMailerPort {
  send(message: LifecycleMessage): Promise<void>;
}
