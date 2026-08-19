CREATE TABLE "contact_reveal_event" (
	"id" text PRIMARY KEY NOT NULL,
	"listing_id" text NOT NULL,
	"publisher_id" text NOT NULL,
	"tenant_user_id" text NOT NULL,
	"city_id" text NOT NULL,
	"revealed_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contact_reveal_event" ADD CONSTRAINT "contact_reveal_event_listing_id_listing_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listing"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_reveal_event" ADD CONSTRAINT "contact_reveal_event_publisher_id_user_id_fk" FOREIGN KEY ("publisher_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_reveal_event" ADD CONSTRAINT "contact_reveal_event_tenant_user_id_user_id_fk" FOREIGN KEY ("tenant_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_reveal_event" ADD CONSTRAINT "contact_reveal_event_city_id_city_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."city"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contact_reveal_pair_idx" ON "contact_reveal_event" USING btree ("tenant_user_id","listing_id","revealed_at","id");--> statement-breakpoint
CREATE INDEX "contact_reveal_city_idx" ON "contact_reveal_event" USING btree ("city_id","revealed_at");--> statement-breakpoint
CREATE INDEX "contact_reveal_listing_idx" ON "contact_reveal_event" USING btree ("listing_id","revealed_at");--> statement-breakpoint
-- HAND-WRITTEN, and it must stay hand-written (design.md D6, tasks.md 6.1).
-- drizzle-kit does not generate this view and will not diff it: re-running
-- `drizzle-kit generate` produces the table above and nothing below. Any
-- change to the view is a new migration written by hand.
--
-- DISTINCT ON keeps the EARLIEST row per (tenant, listing) — that is what
-- makes first_revealed_at, publisher_id and city_id first-reveal values —
-- while the window count(*) over the same partition carries the repeat count.
-- Exactly one row per pair, by construction. The ORDER BY is not cosmetic:
-- DISTINCT ON picks whichever row sorts first, so dropping revealed_at from
-- it silently turns "first reveal" into "an arbitrary reveal".
CREATE VIEW "contact_reveal_unique_pair" AS
SELECT DISTINCT ON (tenant_user_id, listing_id)
       tenant_user_id,
       listing_id,
       publisher_id,
       city_id,
       revealed_at AS first_revealed_at,
       count(*) OVER (PARTITION BY tenant_user_id, listing_id) AS reveal_count
FROM "contact_reveal_event"
ORDER BY tenant_user_id, listing_id, revealed_at, id;