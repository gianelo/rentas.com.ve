-- `publish_draft` — el borrador de los nueve pasos del lado del servidor
-- (tasks.md 18.29), la dependencia que `app/publicar/draft.ts` dejó anotada.
--
-- El comentario es a mano porque lo que importa es lo que esta migración NO hace.
-- **Sólo crea, y no toca una sola fila viva**: una tabla que hoy no existe y el alta
-- de su propia clave foránea, que se agrega SOBRE la tabla nueva y no sobre `user`.
-- No hay `DROP`, `TRUNCATE`, `DELETE`, `ALTER … TYPE` ni un `NOT NULL` sobre columna
-- existente, así que no lleva —ni necesita— el marcador `deploy-migrate:
-- allow-destructive`. Las razones de la forma están en `src/shared/db/schema.ts`.

CREATE TABLE "publish_draft" (
	"publisher_id" text PRIMARY KEY NOT NULL,
	"answers" jsonb NOT NULL,
	"photos" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "publish_draft" ADD CONSTRAINT "publish_draft_publisher_id_user_id_fk" FOREIGN KEY ("publisher_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;