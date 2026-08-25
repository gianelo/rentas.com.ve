CREATE TABLE "listing_report" (
	"id" text PRIMARY KEY NOT NULL,
	"listing_id" text NOT NULL,
	"reporter_id" text NOT NULL,
	"reported_at" timestamp with time zone NOT NULL,
	CONSTRAINT "listing_report_listing_reporter_unique" UNIQUE("listing_id","reporter_id")
);
--> statement-breakpoint
CREATE TABLE "moderation_action" (
	"id" text PRIMARY KEY NOT NULL,
	"listing_id" text NOT NULL,
	"action" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "listing_report" ADD CONSTRAINT "listing_report_listing_id_listing_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listing"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_report" ADD CONSTRAINT "listing_report_reporter_id_user_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_action" ADD CONSTRAINT "moderation_action_listing_id_listing_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listing"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "moderation_action_listing_idx" ON "moderation_action" USING btree ("listing_id","created_at");