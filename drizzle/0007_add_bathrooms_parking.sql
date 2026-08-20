-- Artboard 2b's stat strip: `2 HAB | 2 BAÑOS | 78 M² | 1 PUESTO`. Two of the
-- four cells had no column behind them.
--
-- **Hand-edited, and the same edit 0006 needed.** drizzle-kit emitted
--   ALTER TABLE "listing" ADD COLUMN "bathrooms" integer NOT NULL;
-- which Postgres refuses on a populated table: there is no value to put in
-- the existing rows. Verified against 10 rows before writing this.
--
-- `parking_spots` needs none of that ceremony -- it carries DEFAULT 0, and 0
-- is the right answer for a row nobody has told us about, because zero
-- parking is a FACT rather than a gap.
--
-- `bathrooms` has no such honest default, so the backfill below picks one.
-- Checked before writing it rather than assumed: all 10 rows in the database
-- are the demo listings from src/shared/db/seed.ts, which this change gives
-- real per-listing values in the same commit. So `1` is a placeholder that
-- survives only until the next re-seed, not a number invented over anything
-- a publisher wrote.
--
-- It still has to be here. The migration must stand on its own against any
-- database this repository has produced, including one whose rows did not
-- come from the seed -- and `1` is the conservative floor, since a home has
-- at least one bathroom.

ALTER TABLE "listing" ADD COLUMN "bathrooms" integer;--> statement-breakpoint
UPDATE "listing" SET "bathrooms" = 1 WHERE "bathrooms" IS NULL;--> statement-breakpoint
ALTER TABLE "listing" ALTER COLUMN "bathrooms" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "listing" ADD COLUMN "parking_spots" integer DEFAULT 0 NOT NULL;
