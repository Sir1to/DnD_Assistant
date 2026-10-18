CREATE TABLE "character_share_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sheet_id" uuid NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"sections" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "character_share_grants_token_hash_format" CHECK ("character_share_grants"."token_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "character_share_grants_sections_array" CHECK (jsonb_typeof("character_share_grants"."sections") = 'array'),
	CONSTRAINT "character_share_grants_sections_nonempty" CHECK (jsonb_array_length("character_share_grants"."sections") between 1 and 8),
	CONSTRAINT "character_share_grants_expiry_after_creation" CHECK ("character_share_grants"."expires_at" > "character_share_grants"."created_at")
);
--> statement-breakpoint
ALTER TABLE "character_share_grants" ADD CONSTRAINT "character_share_grants_sheet_id_character_sheets_id_fk" FOREIGN KEY ("sheet_id") REFERENCES "public"."character_sheets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_share_grants" ADD CONSTRAINT "character_share_grants_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "character_share_grants_token_hash_unique" ON "character_share_grants" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "character_share_grants_sheet_created_index" ON "character_share_grants" USING btree ("sheet_id","created_at");