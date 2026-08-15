CREATE TABLE "battle_scene_saves" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"created_by_user_id" uuid,
	"name" text NOT NULL,
	"source_scene_name" text NOT NULL,
	"scene_status" "battle_scene_status" NOT NULL,
	"grid_columns" integer NOT NULL,
	"grid_rows" integer NOT NULL,
	"combatant_count" integer NOT NULL,
	"background_attachment_id" uuid,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "battle_scene_saves_name_length" CHECK (char_length("battle_scene_saves"."name") between 1 and 160),
	CONSTRAINT "battle_scene_saves_source_scene_name_length" CHECK (char_length("battle_scene_saves"."source_scene_name") between 1 and 160),
	CONSTRAINT "battle_scene_saves_scene_status_restorable" CHECK ("battle_scene_saves"."scene_status" in ('DRAFT', 'LIVE', 'PAUSED')),
	CONSTRAINT "battle_scene_saves_grid_columns_range" CHECK ("battle_scene_saves"."grid_columns" between 4 and 60),
	CONSTRAINT "battle_scene_saves_grid_rows_range" CHECK ("battle_scene_saves"."grid_rows" between 4 and 60),
	CONSTRAINT "battle_scene_saves_combatant_count_range" CHECK ("battle_scene_saves"."combatant_count" between 0 and 500),
	CONSTRAINT "battle_scene_saves_payload_size" CHECK (pg_column_size("battle_scene_saves"."payload") <= 524288)
);
--> statement-breakpoint
ALTER TABLE "battle_scene_saves" ADD CONSTRAINT "battle_scene_saves_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "battle_scene_saves" ADD CONSTRAINT "battle_scene_saves_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "battle_scene_saves" ADD CONSTRAINT "battle_scene_saves_background_attachment_id_lore_attachments_id_fk" FOREIGN KEY ("background_attachment_id") REFERENCES "public"."lore_attachments"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "battle_scene_saves_campaign_created_index" ON "battle_scene_saves" USING btree ("campaign_id", "created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "battle_scenes_campaign_active_unique" ON "battle_scenes" USING btree ("campaign_id") WHERE "battle_scenes"."status" <> 'ARCHIVED';
