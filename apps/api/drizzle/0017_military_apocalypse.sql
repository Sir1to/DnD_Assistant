CREATE TYPE "public"."battle_lighting_theme" AS ENUM('BRIGHT', 'DIM', 'DARK');--> statement-breakpoint
CREATE TYPE "public"."battle_terrain_theme" AS ENUM('FOREST', 'RUINS', 'DUNGEON', 'CAVE', 'SWAMP', 'DESERT', 'SNOW', 'URBAN');--> statement-breakpoint
CREATE TYPE "public"."battle_weather_theme" AS ENUM('CLEAR', 'RAIN', 'FOG', 'SNOW', 'STORM');--> statement-breakpoint
ALTER TABLE "battle_scenes" ADD COLUMN "terrain_theme" "battle_terrain_theme";--> statement-breakpoint
ALTER TABLE "battle_scenes" ADD COLUMN "lighting_theme" "battle_lighting_theme";--> statement-breakpoint
ALTER TABLE "battle_scenes" ADD COLUMN "weather_theme" "battle_weather_theme";