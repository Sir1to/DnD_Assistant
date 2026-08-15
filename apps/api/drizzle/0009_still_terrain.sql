CREATE TYPE "public"."battle_obstacle_kind" AS ENUM('WALL', 'OBSTACLE', 'DIFFICULT_TERRAIN');
--> statement-breakpoint
CREATE TABLE "battle_scene_obstacles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scene_id" uuid NOT NULL,
	"kind" "battle_obstacle_kind" NOT NULL,
	"x" integer NOT NULL,
	"y" integer NOT NULL,
	"width" integer DEFAULT 1 NOT NULL,
	"height" integer DEFAULT 1 NOT NULL,
	"movement_cost" integer DEFAULT 2 NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "battle_scene_obstacles_x_nonnegative" CHECK ("battle_scene_obstacles"."x" >= 0),
	CONSTRAINT "battle_scene_obstacles_y_nonnegative" CHECK ("battle_scene_obstacles"."y" >= 0),
	CONSTRAINT "battle_scene_obstacles_width_range" CHECK ("battle_scene_obstacles"."width" between 1 and 60),
	CONSTRAINT "battle_scene_obstacles_height_range" CHECK ("battle_scene_obstacles"."height" between 1 and 60),
	CONSTRAINT "battle_scene_obstacles_cost_range" CHECK ("battle_scene_obstacles"."movement_cost" between 1 and 5),
	CONSTRAINT "battle_scene_obstacles_revision_nonnegative" CHECK ("battle_scene_obstacles"."revision" >= 0)
);
--> statement-breakpoint
ALTER TABLE "battle_scene_obstacles" ADD CONSTRAINT "battle_scene_obstacles_scene_id_battle_scenes_id_fk" FOREIGN KEY ("scene_id") REFERENCES "public"."battle_scenes"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "battle_scene_obstacles_scene_id_index" ON "battle_scene_obstacles" USING btree ("scene_id");
