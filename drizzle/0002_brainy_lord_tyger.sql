CREATE TABLE "listing" (
	"id" text PRIMARY KEY NOT NULL,
	"publisher_id" text NOT NULL,
	"publisher_type" text NOT NULL,
	"city_id" text NOT NULL,
	"zone_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"price_usd" integer NOT NULL,
	"rooms" integer NOT NULL,
	"area_m2" integer NOT NULL,
	"status" text NOT NULL,
	"published_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "listing" ADD CONSTRAINT "listing_publisher_id_user_id_fk" FOREIGN KEY ("publisher_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing" ADD CONSTRAINT "listing_city_id_city_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."city"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing" ADD CONSTRAINT "listing_zone_city_fk" FOREIGN KEY ("zone_id","city_id") REFERENCES "public"."zone"("id","city_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "listing_city_status_idx" ON "listing" USING btree ("city_id","status");