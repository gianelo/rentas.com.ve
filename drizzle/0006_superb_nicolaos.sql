-- Hand-edited after generation, and the edit is the point.
--
-- drizzle-kit emits `ADD COLUMN ... text NOT NULL` with no default, which
-- Postgres refuses on a populated table:
--
--   ERROR: column "contact_method" of relation "listing" contains null values
--
-- Verified against the real test database rather than assumed. The three-step
-- form below is what an ALTER on a live table has to look like: add nullable,
-- give the existing rows a value, then tighten.
--
-- The backfill deliberately writes an UNUSABLE placeholder rather than a
-- plausible one. These rows are seed and demo listings; inventing a phone
-- number would put a contact into the product that nobody owns, and the
-- reveal button would hand a tenant something that goes nowhere.
-- `sin-contacto` is visibly not a contact, so it surfaces as a data problem
-- instead of as a silent dead end.
ALTER TABLE "listing" ADD COLUMN "contact_method" text;--> statement-breakpoint
ALTER TABLE "listing" ADD COLUMN "contact_value" text;--> statement-breakpoint

UPDATE "listing"
   SET "contact_method" = 'whatsapp',
       "contact_value"  = 'sin-contacto'
 WHERE "contact_method" IS NULL;--> statement-breakpoint

ALTER TABLE "listing" ALTER COLUMN "contact_method" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "listing" ALTER COLUMN "contact_value" SET NOT NULL;--> statement-breakpoint

-- Nullable on `user` by design: a fresh Google account has no contact, and
-- publishing is where it is first asked for.
ALTER TABLE "user" ADD COLUMN "contact_method" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "contact_value" text;
