-- El ciclo de vida del aviso: vencimiento, recordatorios y purga de fotos
-- (tasks.md fase 7 y 19c).
--
-- **NO lleva el marcador `allow-destructive`, y eso es una afirmación y no un
-- olvido.** Esta migración sólo agrega: dos tablas nuevas, una columna nulable
-- y dos índices. No hay `DROP`, `TRUNCATE` ni `DELETE FROM`. Si alguien agrega
-- uno acá después, `scripts/deploy-migrate.mjs` tumba el despliegue — que es
-- exactamente lo que tiene que pasar, y por lo que el marcador se escribe a
-- mano con su razón cuando de verdad hace falta.
--
-- **`last_renewed_at` no necesita los tres pasos de la 0008** (nulable,
-- rellenar, exigir). Ese patrón es para columnas que terminan en NOT NULL sobre
-- filas vivas; ésta queda nulable para siempre porque «nunca se renovó» es un
-- hecho verdadero de todo aviso publicado hasta hoy. Rellenarla con
-- `published_at` inventaría una renovación que nadie hizo, y las suposiciones
-- escritas sobre filas reales son justo lo que la 0008 dejó anotado como su
-- parte incómoda.
--
-- **Las filas vivas no quedan sin vencimiento**: `listing.expires_at` ya existe
-- y ya es NOT NULL desde la 0000. Esta migración no lo toca.
--
-- La unicidad de `listing_reminder` lleva TRES columnas y no dos. El porqué
-- está entero en `src/shared/db/schema.ts`, arriba de la tabla: con dos, el
-- segundo correo —el que avisa que las fotos se borran— chocaría contra el
-- primero del mismo ciclo y no saldría nunca.

CREATE TABLE "job_run" (
	"id" text PRIMARY KEY NOT NULL,
	"job" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone NOT NULL,
	"selected" integer NOT NULL,
	"succeeded" integer NOT NULL,
	"skipped" integer DEFAULT 0 NOT NULL,
	"failed" integer NOT NULL,
	"failure_detail" text
);
--> statement-breakpoint
CREATE TABLE "listing_reminder" (
	"id" text PRIMARY KEY NOT NULL,
	"listing_id" text NOT NULL,
	"kind" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"sent_at" timestamp with time zone NOT NULL,
	CONSTRAINT "listing_reminder_cycle_unique" UNIQUE("listing_id","kind","expires_at")
);
--> statement-breakpoint
ALTER TABLE "listing" ADD COLUMN "last_renewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "listing_reminder" ADD CONSTRAINT "listing_reminder_listing_id_listing_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listing"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "job_run_job_started_idx" ON "job_run" USING btree ("job","started_at");--> statement-breakpoint
CREATE INDEX "listing_expires_at_idx" ON "listing" USING btree ("expires_at");