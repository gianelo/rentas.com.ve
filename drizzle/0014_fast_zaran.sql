CREATE TABLE "bulk_import_batch" (
	"id" text PRIMARY KEY NOT NULL,
	"publisher_id" text NOT NULL,
	"uploaded_at" timestamp with time zone NOT NULL,
	"total_rows" integer NOT NULL,
	"valid_rows" integer NOT NULL,
	"created_drafts" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "listing" ADD COLUMN "external_reference" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "bulk_import_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "bulk_import_batch" ADD CONSTRAINT "bulk_import_batch_publisher_id_user_id_fk" FOREIGN KEY ("publisher_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bulk_import_batch_publisher_idx" ON "bulk_import_batch" USING btree ("publisher_id","uploaded_at");--> statement-breakpoint
ALTER TABLE "listing" ADD CONSTRAINT "listing_publisher_external_reference_unique" UNIQUE("publisher_id","external_reference");