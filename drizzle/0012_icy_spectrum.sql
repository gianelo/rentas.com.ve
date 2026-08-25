ALTER TABLE "contact_reveal_event" ADD COLUMN "message" text;
--> statement-breakpoint
-- HAND-APPENDED, and it must stay hand-appended (design.md D6 consequence,
-- tasks.md 6.11). drizzle-kit generates plain CHECK constraints only; it does
-- not emit NOT VALID, so this half of the migration cannot come from
-- `drizzle-kit generate` and any future regeneration will not reproduce it.
--
-- NOT VALID is deliberate and permanent, not a to-do. Rows already exist from
-- PR #81 with no message. A plain NOT NULL fails outright against them;
-- NOT NULL DEFAULT '' would succeed by writing a fact that never happened —
-- recording that those tenants submitted an empty message when the product
-- had not yet asked them for one. NOT VALID leaves history unchecked while
-- enforcing the rule on every insert and update from this migration forward.
--
-- DO NOT run VALIDATE CONSTRAINT on this constraint. Validating it would fail
-- against the historical NULL rows on purpose; passing would mean someone
-- backfilled them, which is exactly the fabricated fact this migration
-- refuses to write. NULL means one thing only: this reveal predates the
-- requirement. `btrim` keeps a blank or whitespace-only submission from ever
-- being confused with that historical NULL.
ALTER TABLE "contact_reveal_event"
  ADD CONSTRAINT "contact_reveal_event_message_present"
  CHECK (message IS NOT NULL AND length(btrim(message)) > 0) NOT VALID;