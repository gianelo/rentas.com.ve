-- Escrita a mano sobre lo que genero drizzle-kit.
-- deploy-migrate: allow-destructive — los cuatro DROP COLUMN de abajo corren
-- DESPUES del INSERT ... SELECT que copia toda clave de R2 y todo tamano a
-- listing_photo_derivative. Ninguna fila se pierde: cambian de tabla. Sin
-- este marcador el guardia aborta el deploy, que es lo que paso el 22 de
-- agosto entre las 15:36 y las 18:30.
--
--
-- El generador emitio los cuatro DROP COLUMN directo. Eso BORRA las claves de
-- R2 de toda foto ya subida: las derivadas seguirian existiendo en el bucket y
-- la base ya no sabria donde estan. Objetos huerfanos que nadie puede
-- referenciar ni limpiar, y fotos que ninguna pantalla puede dibujar.
--
-- Es exactamente lo que la regla del fundador prohibe -- "no podemos borrar
-- data real", tasks.md 11b.6 -- y lo que el gate de scripts/deploy-migrate.mjs
-- esta puesto para frenar.
--
-- La forma segura es copiar primero. Las dos derivadas viejas se convierten en
-- dos de las cinco nuevas: `thumbnail` era de 128x96, que es lo mas cerca de
-- `thumb`; y `detail` era la de 1280, que es lo que ahora se llama `full`. Las
-- otras tres -- card, strip y detail -- NO existen para esas fotos y hay que
-- re-derivarlas desde la de 1280, que es su propia tarea (19.3). Hasta que
-- corra, una foto vieja tiene dos de sus cinco tamanos.

CREATE TABLE "listing_photo_derivative" (
	"photo_id" text NOT NULL,
	"name" text NOT NULL,
	"key" text NOT NULL,
	"bytes" integer NOT NULL,
	CONSTRAINT "listing_photo_derivative_photo_id_name_pk" PRIMARY KEY("photo_id","name")
);
--> statement-breakpoint
ALTER TABLE "listing_photo_derivative" ADD CONSTRAINT "listing_photo_derivative_photo_id_listing_photo_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."listing_photo"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

-- Copiar ANTES de borrar. Sin esto, las lineas de abajo pierden el dato.
INSERT INTO "listing_photo_derivative" ("photo_id", "name", "key", "bytes")
SELECT "id", 'thumb', "thumbnail_key", "thumbnail_bytes" FROM "listing_photo"
ON CONFLICT DO NOTHING;--> statement-breakpoint

INSERT INTO "listing_photo_derivative" ("photo_id", "name", "key", "bytes")
SELECT "id", 'full', "detail_key", "detail_bytes" FROM "listing_photo"
ON CONFLICT DO NOTHING;--> statement-breakpoint

-- Recien ahora, y solo porque el dato ya vive en la tabla nueva.
ALTER TABLE "listing_photo" DROP COLUMN "thumbnail_key";--> statement-breakpoint
ALTER TABLE "listing_photo" DROP COLUMN "detail_key";--> statement-breakpoint
ALTER TABLE "listing_photo" DROP COLUMN "thumbnail_bytes";--> statement-breakpoint
ALTER TABLE "listing_photo" DROP COLUMN "detail_bytes";
