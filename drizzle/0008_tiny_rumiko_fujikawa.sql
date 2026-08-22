-- Escrita a mano sobre lo que generó drizzle-kit, y la diferencia importa.
--
-- El generador emitió `ADD COLUMN … text NOT NULL` sin valor por defecto para
-- `listing.property_type`, `zone.kind` y `zone.source`. Sobre una tabla con
-- filas vivas eso ABORTA: Postgres no tiene con qué llenar la columna en las
-- filas existentes. La forma segura son tres pasos — agregar nulable, rellenar,
-- recién ahí exigir NOT NULL — y es la misma que exige la regla del fundador de
-- 2026-08-20: "no podemos borrar data real" (tasks.md 11b.6).
--
-- **Los rellenos de abajo son SUPOSICIONES, y quedan escritas como tales.**
-- Nadie declaró el tipo de las propiedades ya publicadas, así que reciben
-- `apartamento`, que es el caso más común. Es un dato inventado sobre filas
-- reales; la alternativa era dejar la columna nulable para siempre, que anula
-- la garantía por la que existe. Si hay avisos reales publicados antes de esta
-- migración, hay que revisarlos a mano.

--> statement-breakpoint
-- 1. listing.property_type — nulable, rellenar, exigir.
ALTER TABLE "listing" ADD COLUMN "property_type" text;--> statement-breakpoint
UPDATE "listing" SET "property_type" = 'apartamento' WHERE "property_type" IS NULL;--> statement-breakpoint
ALTER TABLE "listing" ALTER COLUMN "property_type" SET NOT NULL;--> statement-breakpoint

-- 2. Los cinco atributos. Estos SÍ pueden ir directo: llevan DEFAULT false, y
--    `false` es la respuesta correcta para una fila existente — significa "no
--    lo declaró", que es exactamente lo que pasó.
ALTER TABLE "listing" ADD COLUMN "has_power_plant" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "listing" ADD COLUMN "has_regular_water" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "listing" ADD COLUMN "is_furnished" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "listing" ADD COLUMN "has_security" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "listing" ADD COLUMN "has_appliances" boolean DEFAULT false NOT NULL;--> statement-breakpoint

-- 3. zone se vuelve un árbol.
ALTER TABLE "zone" ADD COLUMN "parent_id" text;--> statement-breakpoint
ALTER TABLE "zone" ADD COLUMN "category" text;--> statement-breakpoint
ALTER TABLE "zone" ADD COLUMN "ubigeo" text;--> statement-breakpoint
ALTER TABLE "zone" ADD COLUMN "postal_code" text;--> statement-breakpoint

-- Las filas de `zone` que ya existen son las diez de la taxonomía provisional:
-- Chacao, Altamira, Tierra Negra y compañía. Sin padre y sin nivel declarado,
-- lo honesto es `parroquia` — el nivel intermedio — y procedencia `INE`, que es
-- de donde salía esa lista. NO se borran: el aviso sembrado que las referencia
-- todavía apunta ahí, y borrarlas rompería la clave foránea compuesta que es la
-- garantía de D5.
ALTER TABLE "zone" ADD COLUMN "kind" text;--> statement-breakpoint
UPDATE "zone" SET "kind" = 'parroquia' WHERE "kind" IS NULL;--> statement-breakpoint
ALTER TABLE "zone" ALTER COLUMN "kind" SET NOT NULL;--> statement-breakpoint

ALTER TABLE "zone" ADD COLUMN "source" text;--> statement-breakpoint
UPDATE "zone" SET "source" = 'INE' WHERE "source" IS NULL;--> statement-breakpoint
ALTER TABLE "zone" ALTER COLUMN "source" SET NOT NULL;--> statement-breakpoint

-- 4. La unicidad baja un nivel, porque los datos la bajaron. `Buena Vista`
--    aparece 12 veces en la taxonomía real, `San José` 11, `El Carmen` 10. Un
--    barrio es único dentro de su parroquia, nunca dentro de una ciudad.
--    NULLS NOT DISTINCT porque los tres niveles oficiales tienen `category`
--    NULL, y sin eso la restricción no diría nada sobre ellos.
ALTER TABLE "zone" DROP CONSTRAINT "zone_city_id_name_unique";--> statement-breakpoint
ALTER TABLE "zone" ADD CONSTRAINT "zone_city_parent_category_name_unique" UNIQUE NULLS NOT DISTINCT("city_id","parent_id","category","name");--> statement-breakpoint

-- `zone_id_city_id_unique` NO se toca: es la restricción sobre la que descansa
-- `listing_zone_city_fk`, y por lo tanto D5 entero.
ALTER TABLE "zone" ADD CONSTRAINT "zone_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."zone"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "zone_city_kind_idx" ON "zone" USING btree ("city_id","kind");--> statement-breakpoint
CREATE INDEX "zone_parent_idx" ON "zone" USING btree ("parent_id");
