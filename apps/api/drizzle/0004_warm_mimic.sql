CREATE TABLE "character_sheets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"ruleset" text DEFAULT 'dnd5e-srd-5.2.1' NOT NULL,
	"data" jsonb NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "character_sheets_name_length" CHECK (char_length("character_sheets"."name") between 1 and 160),
	CONSTRAINT "character_sheets_ruleset_supported" CHECK ("character_sheets"."ruleset" = 'dnd5e-srd-5.2.1'),
	CONSTRAINT "character_sheets_revision_nonnegative" CHECK ("character_sheets"."revision" >= 0),
	CONSTRAINT "character_sheets_data_size" CHECK (pg_column_size("character_sheets"."data") <= 262144)
);
--> statement-breakpoint
ALTER TABLE "character_sheets" ADD CONSTRAINT "character_sheets_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_sheets" ADD CONSTRAINT "character_sheets_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_sheets" ADD CONSTRAINT "character_sheets_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "character_sheets_campaign_id_index" ON "character_sheets" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "character_sheets_owner_user_id_index" ON "character_sheets" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "character_sheets_campaign_owner_index" ON "character_sheets" USING btree ("campaign_id","owner_user_id");