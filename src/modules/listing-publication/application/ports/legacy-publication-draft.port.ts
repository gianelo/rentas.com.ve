import type { StoredPublicationDraft } from "../../domain/publication-steps";

/**
 * tasks.md 18.30 — **el puente de una sola entrega**, y por eso lleva "legacy"
 * en el nombre: quien está a mitad de publicar el día del despliegue tiene el
 * borrador entero en dos cookies de treinta minutos y la tabla vacía.
 *
 * Dos preguntas y ninguna más, porque el puente sólo necesita dos: qué había, y
 * borrarlo. **No hay `write`**, y la ausencia es la mitad que importa — un puerto
 * capaz de volver a escribir la cookie es un puerto capaz de recrear la segunda
 * fuente que este puente existe para cerrar.
 *
 * El adaptador vive en `app/publicar`, donde vive la cookie. Se saca entero con
 * la 18.33, junto con `app/publicar/draft.ts`.
 */
export interface LegacyPublicationDraftPort {
  read(): Promise<StoredPublicationDraft | null>;
  /** **Las DOS**, y con su `path`. Media cookie borrada es una cookie viva. */
  clear(): Promise<void>;
}
