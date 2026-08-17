CREATE TABLE "listing_photo" (
	"id" text PRIMARY KEY NOT NULL,
	"listing_id" text NOT NULL,
	"position" integer NOT NULL,
	"thumbnail_key" text NOT NULL,
	"detail_key" text NOT NULL,
	"thumbnail_bytes" integer NOT NULL,
	"detail_bytes" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "listing_photo_position_unique" UNIQUE("listing_id","position")
);
--> statement-breakpoint
ALTER TABLE "listing_photo" ADD CONSTRAINT "listing_photo_listing_id_listing_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listing"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "listing_photo_listing_idx" ON "listing_photo" USING btree ("listing_id");