CREATE TYPE "public"."character_creation_mode" AS ENUM('AUTOMATIC', 'GUIDED', 'MANUAL');--> statement-breakpoint
CREATE TYPE "public"."character_sheet_status" AS ENUM('DRAFT', 'READY', 'ARCHIVED');--> statement-breakpoint
CREATE TABLE "character_runtime_states" (
	"sheet_id" uuid PRIMARY KEY NOT NULL,
	"current_hit_points" integer DEFAULT 0 NOT NULL,
	"temporary_hit_points" integer DEFAULT 0 NOT NULL,
	"resources" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"spell_slots" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"conditions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"inspiration" boolean DEFAULT false NOT NULL,
	"death_save_successes" integer DEFAULT 0 NOT NULL,
	"death_save_failures" integer DEFAULT 0 NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "character_runtime_states_current_hp_range" CHECK ("character_runtime_states"."current_hit_points" between 0 and 999999),
	CONSTRAINT "character_runtime_states_temporary_hp_range" CHECK ("character_runtime_states"."temporary_hit_points" between 0 and 999999),
	CONSTRAINT "character_runtime_states_death_save_successes_range" CHECK ("character_runtime_states"."death_save_successes" between 0 and 3),
	CONSTRAINT "character_runtime_states_death_save_failures_range" CHECK ("character_runtime_states"."death_save_failures" between 0 and 3),
	CONSTRAINT "character_runtime_states_revision_nonnegative" CHECK ("character_runtime_states"."revision" >= 0),
	CONSTRAINT "character_runtime_states_resources_object" CHECK (jsonb_typeof("character_runtime_states"."resources") = 'object'),
	CONSTRAINT "character_runtime_states_spell_slots_object" CHECK (jsonb_typeof("character_runtime_states"."spell_slots") = 'object'),
	CONSTRAINT "character_runtime_states_conditions_array" CHECK (jsonb_typeof("character_runtime_states"."conditions") = 'array')
);
--> statement-breakpoint
ALTER TABLE "battle_combatants" ADD COLUMN "character_sheet_id" uuid;--> statement-breakpoint
ALTER TABLE "character_sheets" ADD COLUMN "ruleset_version" text DEFAULT '5.2.1' NOT NULL;--> statement-breakpoint
ALTER TABLE "character_sheets" ADD COLUMN "document_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "character_sheets" ADD COLUMN "creation_mode" character_creation_mode DEFAULT 'MANUAL' NOT NULL;--> statement-breakpoint
ALTER TABLE "character_sheets" ADD COLUMN "status" character_sheet_status DEFAULT 'DRAFT' NOT NULL;--> statement-breakpoint
ALTER TABLE "character_sheets" ADD COLUMN "portrait_asset_id" uuid;--> statement-breakpoint
ALTER TABLE "character_runtime_states" ADD CONSTRAINT "character_runtime_states_sheet_id_character_sheets_id_fk" FOREIGN KEY ("sheet_id") REFERENCES "public"."character_sheets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "battle_combatants" ADD CONSTRAINT "battle_combatants_character_sheet_id_character_sheets_id_fk" FOREIGN KEY ("character_sheet_id") REFERENCES "public"."character_sheets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_sheets" ADD CONSTRAINT "character_sheets_portrait_asset_id_lore_attachments_id_fk" FOREIGN KEY ("portrait_asset_id") REFERENCES "public"."lore_attachments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "battle_combatants_character_sheet_id_index" ON "battle_combatants" USING btree ("character_sheet_id");--> statement-breakpoint
ALTER TABLE "character_sheets" ADD CONSTRAINT "character_sheets_ruleset_version_supported" CHECK ("character_sheets"."ruleset_version" = '5.2.1');--> statement-breakpoint
ALTER TABLE "character_sheets" ADD CONSTRAINT "character_sheets_document_version_supported" CHECK ("character_sheets"."document_version" in (1, 2));
--> statement-breakpoint
INSERT INTO "character_runtime_states" ("sheet_id", "current_hit_points")
SELECT
	"id",
	CASE
		WHEN "data"->>'hitPoints' ~ '^[0-9]+$'
			THEN least(("data"->>'hitPoints')::integer, 999999)
		ELSE 0
	END
FROM "character_sheets"
ON CONFLICT ("sheet_id") DO NOTHING;
