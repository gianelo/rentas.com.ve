ALTER TABLE "city" ADD COLUMN "slug" text;--> statement-breakpoint
ALTER TABLE "zone" ADD COLUMN "slug" text;--> statement-breakpoint
CREATE INDEX "city_slug_idx" ON "city" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "zone_slug_idx" ON "zone" USING btree ("slug");