/**
 * Por dónde sale el aviso del latido (tasks.md 27.5).
 *
 * Mismo puerto mínimo que `LifecycleMailerPort`: recibe un asunto y un
 * cuerpo que el dominio ya compuso, y no sabe nada de HTML ni de plantillas.
 */
export interface HeartbeatMessage {
  readonly to: string;
  readonly subject: string;
  readonly body: string;
}

export interface HeartbeatMailerPort {
  send(message: HeartbeatMessage): Promise<void>;
}
