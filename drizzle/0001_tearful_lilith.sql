CREATE TABLE "city" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "city_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "zone" (
	"id" text PRIMARY KEY NOT NULL,
	"city_id" text NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "zone_id_city_id_unique" UNIQUE("id","city_id"),
	CONSTRAINT "zone_city_id_name_unique" UNIQUE("city_id","name")
);
--> statement-breakpoint
ALTER TABLE "zone" ADD CONSTRAINT "zone_city_id_city_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."city"("id") ON DELETE cascade ON UPDATE no action;