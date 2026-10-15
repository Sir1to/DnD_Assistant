ALTER TABLE "battle_tokens" ADD COLUMN "system_asset_id" text;--> statement-breakpoint
ALTER TABLE "battle_combatant_presets" ADD COLUMN "system_asset_id" text;--> statement-breakpoint
ALTER TABLE "battle_scene_obstacles" ADD COLUMN "system_asset_id" text;--> statement-breakpoint
ALTER TABLE "battle_scene_objects" ADD COLUMN "system_asset_id" text;--> statement-breakpoint
ALTER TABLE "battle_tokens" ADD CONSTRAINT "battle_tokens_system_asset_id_format" CHECK ("battle_tokens"."system_asset_id" is null or "battle_tokens"."system_asset_id" ~ '^[a-z0-9]+([.-][a-z0-9]+)*$');--> statement-breakpoint
ALTER TABLE "battle_tokens" ADD CONSTRAINT "battle_tokens_visual_source" CHECK ("battle_tokens"."image_attachment_id" is null or "battle_tokens"."system_asset_id" is null);--> statement-breakpoint
ALTER TABLE "battle_combatant_presets" ADD CONSTRAINT "battle_combatant_presets_system_asset_id_format" CHECK ("battle_combatant_presets"."system_asset_id" is null or "battle_combatant_presets"."system_asset_id" ~ '^[a-z0-9]+([.-][a-z0-9]+)*$');--> statement-breakpoint
ALTER TABLE "battle_combatant_presets" ADD CONSTRAINT "battle_combatant_presets_visual_source" CHECK ("battle_combatant_presets"."image_attachment_id" is null or "battle_combatant_presets"."system_asset_id" is null);--> statement-breakpoint
ALTER TABLE "battle_scene_obstacles" ADD CONSTRAINT "battle_scene_obstacles_system_asset_id_format" CHECK ("battle_scene_obstacles"."system_asset_id" is null or "battle_scene_obstacles"."system_asset_id" ~ '^[a-z0-9]+([.-][a-z0-9]+)*$');--> statement-breakpoint
ALTER TABLE "battle_scene_objects" ADD CONSTRAINT "battle_scene_objects_system_asset_id_format" CHECK ("battle_scene_objects"."system_asset_id" is null or "battle_scene_objects"."system_asset_id" ~ '^[a-z0-9]+([.-][a-z0-9]+)*$');--> statement-breakpoint
ALTER TABLE "battle_scene_objects" ADD CONSTRAINT "battle_scene_objects_visual_source" CHECK ("battle_scene_objects"."image_attachment_id" is null or "battle_scene_objects"."system_asset_id" is null);
