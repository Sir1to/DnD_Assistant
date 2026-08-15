CREATE TYPE "public"."battle_scene_object_kind" AS ENUM('PROP', 'CLUE');
--> statement-breakpoint
CREATE TABLE "battle_scene_objects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scene_id" uuid NOT NULL,
	"kind" "battle_scene_object_kind" NOT NULL,
	"name" text NOT NULL,
	"x" integer NOT NULL,
	"y" integer NOT NULL,
	"width" integer DEFAULT 1 NOT NULL,
	"height" integer DEFAULT 1 NOT NULL,
	"blocks_movement" boolean DEFAULT true NOT NULL,
	"visible_to_players" boolean DEFAULT true NOT NULL,
	"current_hp" integer,
	"max_hp" integer,
	"revision" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "battle_scene_objects_name_length" CHECK (char_length("battle_scene_objects"."name") between 1 and 120),
	CONSTRAINT "battle_scene_objects_x_nonnegative" CHECK ("battle_scene_objects"."x" >= 0),
	CONSTRAINT "battle_scene_objects_y_nonnegative" CHECK ("battle_scene_objects"."y" >= 0),
	CONSTRAINT "battle_scene_objects_width_range" CHECK ("battle_scene_objects"."width" between 1 and 60),
	CONSTRAINT "battle_scene_objects_height_range" CHECK ("battle_scene_objects"."height" between 1 and 60),
	CONSTRAINT "battle_scene_objects_hp_pair" CHECK (("battle_scene_objects"."current_hp" is null and "battle_scene_objects"."max_hp" is null) or ("battle_scene_objects"."current_hp" between 0 and 999999 and "battle_scene_objects"."max_hp" between 1 and 999999 and "battle_scene_objects"."current_hp" <= "battle_scene_objects"."max_hp")),
	CONSTRAINT "battle_scene_objects_revision_nonnegative" CHECK ("battle_scene_objects"."revision" >= 0)
);
--> statement-breakpoint
ALTER TABLE "battle_scene_objects" ADD CONSTRAINT "battle_scene_objects_scene_id_battle_scenes_id_fk" FOREIGN KEY ("scene_id") REFERENCES "public"."battle_scenes"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "battle_scene_objects_scene_id_index" ON "battle_scene_objects" USING btree ("scene_id");
