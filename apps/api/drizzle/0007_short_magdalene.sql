CREATE TYPE "public"."battle_combatant_kind" AS ENUM('PLAYER', 'ALLY', 'NPC', 'MONSTER', 'OBJECT');--> statement-breakpoint
CREATE TYPE "public"."battle_conditions_visibility" AS ENUM('ALL', 'HIDDEN');--> statement-breakpoint
CREATE TYPE "public"."battle_hp_visibility" AS ENUM('EXACT', 'BAR', 'STATE', 'HIDDEN');--> statement-breakpoint
CREATE TYPE "public"."battle_name_visibility" AS ENUM('EXACT', 'GENERIC', 'HIDDEN');--> statement-breakpoint
CREATE TYPE "public"."battle_scene_status" AS ENUM('DRAFT', 'LIVE', 'PAUSED', 'ARCHIVED');--> statement-breakpoint
CREATE TABLE "battle_combatants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scene_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" "battle_combatant_kind" NOT NULL,
	"initiative" integer DEFAULT 10 NOT NULL,
	"current_hp" integer DEFAULT 10 NOT NULL,
	"max_hp" integer DEFAULT 10 NOT NULL,
	"temporary_hp" integer DEFAULT 0 NOT NULL,
	"armor_class" integer,
	"speed" integer DEFAULT 6 NOT NULL,
	"movement_spent" integer DEFAULT 0 NOT NULL,
	"class_name" text DEFAULT '' NOT NULL,
	"species" text DEFAULT '' NOT NULL,
	"conditions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL,
	"name_visibility" "battle_name_visibility" DEFAULT 'EXACT' NOT NULL,
	"hp_visibility" "battle_hp_visibility" DEFAULT 'STATE' NOT NULL,
	"show_armor_class" boolean DEFAULT false NOT NULL,
	"show_class_name" boolean DEFAULT false NOT NULL,
	"show_species" boolean DEFAULT false NOT NULL,
	"conditions_visibility" "battle_conditions_visibility" DEFAULT 'ALL' NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "battle_combatants_name_length" CHECK (char_length("battle_combatants"."name") between 1 and 120),
	CONSTRAINT "battle_combatants_current_hp_range" CHECK ("battle_combatants"."current_hp" between 0 and 999999),
	CONSTRAINT "battle_combatants_max_hp_range" CHECK ("battle_combatants"."max_hp" between 1 and 999999),
	CONSTRAINT "battle_combatants_temporary_hp_range" CHECK ("battle_combatants"."temporary_hp" between 0 and 999999),
	CONSTRAINT "battle_combatants_speed_range" CHECK ("battle_combatants"."speed" between 0 and 100),
	CONSTRAINT "battle_combatants_movement_spent_range" CHECK ("battle_combatants"."movement_spent" between 0 and 100),
	CONSTRAINT "battle_combatants_class_length" CHECK (char_length("battle_combatants"."class_name") <= 120),
	CONSTRAINT "battle_combatants_species_length" CHECK (char_length("battle_combatants"."species") <= 120),
	CONSTRAINT "battle_combatants_note_length" CHECK (char_length("battle_combatants"."note") <= 2000),
	CONSTRAINT "battle_combatants_revision_nonnegative" CHECK ("battle_combatants"."revision" >= 0)
);
--> statement-breakpoint
CREATE TABLE "battle_scenes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"name" text NOT NULL,
	"status" "battle_scene_status" DEFAULT 'DRAFT' NOT NULL,
	"grid_columns" integer DEFAULT 16 NOT NULL,
	"grid_rows" integer DEFAULT 10 NOT NULL,
	"background_attachment_id" uuid,
	"active_combatant_id" uuid,
	"round" integer DEFAULT 1 NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "battle_scenes_name_length" CHECK (char_length("battle_scenes"."name") between 1 and 160),
	CONSTRAINT "battle_scenes_grid_columns_range" CHECK ("battle_scenes"."grid_columns" between 4 and 60),
	CONSTRAINT "battle_scenes_grid_rows_range" CHECK ("battle_scenes"."grid_rows" between 4 and 60),
	CONSTRAINT "battle_scenes_round_positive" CHECK ("battle_scenes"."round" > 0),
	CONSTRAINT "battle_scenes_revision_nonnegative" CHECK ("battle_scenes"."revision" >= 0)
);
--> statement-breakpoint
CREATE TABLE "battle_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scene_id" uuid NOT NULL,
	"combatant_id" uuid NOT NULL,
	"owner_user_id" uuid,
	"x" integer DEFAULT 0 NOT NULL,
	"y" integer DEFAULT 0 NOT NULL,
	"size" integer DEFAULT 1 NOT NULL,
	"color" text DEFAULT '#7c5cff' NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "battle_tokens_x_nonnegative" CHECK ("battle_tokens"."x" >= 0),
	CONSTRAINT "battle_tokens_y_nonnegative" CHECK ("battle_tokens"."y" >= 0),
	CONSTRAINT "battle_tokens_size_range" CHECK ("battle_tokens"."size" between 1 and 6),
	CONSTRAINT "battle_tokens_color_format" CHECK ("battle_tokens"."color" ~ '^#[0-9A-Fa-f]{6}$'),
	CONSTRAINT "battle_tokens_revision_nonnegative" CHECK ("battle_tokens"."revision" >= 0)
);
--> statement-breakpoint
ALTER TABLE "battle_combatants" ADD CONSTRAINT "battle_combatants_scene_id_battle_scenes_id_fk" FOREIGN KEY ("scene_id") REFERENCES "public"."battle_scenes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "battle_scenes" ADD CONSTRAINT "battle_scenes_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "battle_scenes" ADD CONSTRAINT "battle_scenes_background_attachment_id_lore_attachments_id_fk" FOREIGN KEY ("background_attachment_id") REFERENCES "public"."lore_attachments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "battle_tokens" ADD CONSTRAINT "battle_tokens_scene_id_battle_scenes_id_fk" FOREIGN KEY ("scene_id") REFERENCES "public"."battle_scenes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "battle_tokens" ADD CONSTRAINT "battle_tokens_combatant_id_battle_combatants_id_fk" FOREIGN KEY ("combatant_id") REFERENCES "public"."battle_combatants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "battle_tokens" ADD CONSTRAINT "battle_tokens_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "battle_combatants_scene_id_index" ON "battle_combatants" USING btree ("scene_id");--> statement-breakpoint
CREATE INDEX "battle_combatants_scene_initiative_index" ON "battle_combatants" USING btree ("scene_id","initiative");--> statement-breakpoint
CREATE INDEX "battle_scenes_campaign_id_index" ON "battle_scenes" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "battle_scenes_campaign_status_index" ON "battle_scenes" USING btree ("campaign_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "battle_tokens_combatant_unique" ON "battle_tokens" USING btree ("combatant_id");--> statement-breakpoint
CREATE INDEX "battle_tokens_scene_id_index" ON "battle_tokens" USING btree ("scene_id");--> statement-breakpoint
CREATE INDEX "battle_tokens_owner_user_id_index" ON "battle_tokens" USING btree ("owner_user_id");