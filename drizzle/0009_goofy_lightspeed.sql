CREATE TABLE "zone_alias" (
	"zone_id" text NOT NULL,
	"alias" text NOT NULL,
	CONSTRAINT "zone_alias_zone_id_alias_pk" PRIMARY KEY("zone_id","alias")
);
--> statement-breakpoint
ALTER TABLE "zone_alias" ADD CONSTRAINT "zone_alias_zone_id_zone_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."zone"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "zone_alias_alias_idx" ON "zone_alias" USING btree ("alias");