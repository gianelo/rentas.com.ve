CREATE TABLE "verified_contact" (
	"user_id" text NOT NULL,
	"method" text NOT NULL,
	"value" text NOT NULL,
	"verified_at" timestamp with time zone NOT NULL,
	CONSTRAINT "verified_contact_user_id_method_value_pk" PRIMARY KEY("user_id","method","value")
);
--> statement-breakpoint
ALTER TABLE "verified_contact" ADD CONSTRAINT "verified_contact_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;