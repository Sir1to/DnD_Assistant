CREATE TYPE "public"."battle_scene_shape" AS ENUM('RECTANGLE', 'CIRCLE', 'HEXAGON', 'OCTAGON');
--> statement-breakpoint
ALTER TABLE "battle_scenes" ADD COLUMN "shape" "battle_scene_shape" DEFAULT 'RECTANGLE' NOT NULL;
