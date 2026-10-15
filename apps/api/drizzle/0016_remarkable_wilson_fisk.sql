CREATE TABLE "battle_combatant_presets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" "battle_combatant_kind" NOT NULL,
	"initiative" integer DEFAULT 10 NOT NULL,
	"max_hp" integer DEFAULT 10 NOT NULL,
	"armor_class" integer,
	"speed" integer DEFAULT 6 NOT NULL,
	"class_name" text DEFAULT '' NOT NULL,
	"species" text DEFAULT '' NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL,
	"name_visibility" "battle_name_visibility" DEFAULT 'EXACT' NOT NULL,
	"hp_visibility" "battle_hp_visibility" DEFAULT 'STATE' NOT NULL,
	"show_armor_class" boolean DEFAULT false NOT NULL,
	"show_class_name" boolean DEFAULT false NOT NULL,
	"show_species" boolean DEFAULT false NOT NULL,
	"conditions_visibility" "battle_conditions_visibility" DEFAULT 'ALL' NOT NULL,
	"owner_user_id" uuid,
	"image_attachment_id" uuid,
	"size" integer DEFAULT 1 NOT NULL,
	"color" text DEFAULT '#7c5cff' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "battle_combatant_presets_name_length" CHECK (char_length("battle_combatant_presets"."name") between 1 and 120),
	CONSTRAINT "battle_combatant_presets_max_hp_range" CHECK ("battle_combatant_presets"."max_hp" between 1 and 999999),
	CONSTRAINT "battle_combatant_presets_speed_range" CHECK ("battle_combatant_presets"."speed" between 0 and 100),
	CONSTRAINT "battle_combatant_presets_class_length" CHECK (char_length("battle_combatant_presets"."class_name") <= 120),
	CONSTRAINT "battle_combatant_presets_species_length" CHECK (char_length("battle_combatant_presets"."species") <= 120),
	CONSTRAINT "battle_combatant_presets_size_range" CHECK ("battle_combatant_presets"."size" between 1 and 6),
	CONSTRAINT "battle_combatant_presets_color_format" CHECK ("battle_combatant_presets"."color" ~ '^#[0-9A-Fa-f]{6}$')
);
--> statement-breakpoint
ALTER TABLE "battle_combatant_presets" ADD CONSTRAINT "battle_combatant_presets_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "battle_combatant_presets" ADD CONSTRAINT "battle_combatant_presets_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "battle_combatant_presets" ADD CONSTRAINT "battle_combatant_presets_image_attachment_id_lore_attachments_id_fk" FOREIGN KEY ("image_attachment_id") REFERENCES "public"."lore_attachments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "battle_combatant_presets_campaign_id_index" ON "battle_combatant_presets" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "battle_combatant_presets_campaign_updated_index" ON "battle_combatant_presets" USING btree ("campaign_id","updated_at");