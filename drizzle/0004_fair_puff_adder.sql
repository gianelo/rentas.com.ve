CREATE TABLE "listing_photo_hash" (
	"photo_id" text PRIMARY KEY NOT NULL,
	"hash" bit(64) NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "listing_photo_hash" ADD CONSTRAINT "listing_photo_hash_photo_id_listing_photo_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."listing_photo"("id") ON DELETE cascade ON UPDATE no action;